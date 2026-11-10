import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, StockDirection } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { docPrefix, nextDocNo } from '../../common/utils/doc-number.util';

import { SourceTypesService } from '../source-types/source-types.service';
import { assertNotFuture, dayOf } from '../stock-date.util';
import { CreateProductInDto } from './dto/create-product-in.dto';
import { UpdateProductInDto } from './dto/update-product-in.dto';

const include = {
  details: {
    include: {
      product: { select: { id: true, code: true, name: true } },
    },
  },
  warehouse: true,
  sourceType: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ProductInInclude;

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

@Injectable()
export class ProductInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceTypesService: SourceTypesService,
  ) {}

  // Membuat dokumen penerimaan stok.
  async create(dto: CreateProductInDto, userId?: number) {
    const { details, ...header } = dto;

    try {
      assertNotFuture(header.date, 'Tanggal terima');

      const source = await this.sourceTypesService.assertUsable(
        dto.source_type_id,
        StockDirection.IN,
      );

      if (source.code === 'SALES_KANVAS' && !header.sales_kanvas_plan_id) {
        throw new BadRequestException(
          'Plan wajib diisi untuk sumber Sales Kanvas',
        );
      }

      return await this.prisma.$transaction(async (tx) => {
        await this.assertBatchExpiry(tx, header.date, details);

        const transaction_no = await this.generateNo(tx, header.date);

        const created = await tx.productIn.create({
          data: {
            ...header,
            transaction_no,
            created_by: userId,
            details: { create: details },
          },
          include: { details: true },
        });

        await tx.batchMutation.createMany({
          data: created.details.map((detail) => ({
            date: created.date,
            product_id: detail.product_id,
            warehouse_id: created.warehouse_id,
            sales_kanvas_plan_id: created.sales_kanvas_plan_id,
            product_in_detail_id: detail.id,
            batch: detail.batch as string,
            expired_date: detail.expired_date,
            direction: 'IN' as const,
            qty: detail.qty,
          })),
        });

        return tx.productIn.findUniqueOrThrow({
          where: { id: created.id },
          include,
        });
      }, SERIALIZABLE);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * - Kedaluwarsa tidak boleh lebih awal dari tanggal terima.
   * - Satu batch (produk + nomor batch) hanya boleh punya satu tanggal
   *   kedaluwarsa, baik di dokumen ini maupun terhadap penerimaan sebelumnya.
   */
  private async assertBatchExpiry(
    tx: Prisma.TransactionClient,
    docDate: Date,
    details: CreateProductInDto['details'],
  ) {
    const products = await tx.product.findMany({
      where: { id: { in: details.map((d) => d.product_id) } },
      select: { id: true, name: true },
    });
    const nameOf = (id: number) =>
      products.find((p) => p.id === id)?.name ?? `produk ${id}`;

    const received = dayOf(docDate);
    const seen = new Map<string, string>();

    for (const d of details) {
      const batch = d.batch.trim();
      if (batch === '') {
        throw new BadRequestException(
          `Batch wajib diisi untuk ${nameOf(d.product_id)}`,
        );
      }

      const exp = dayOf(d.expired_date);

      if (exp < received) {
        throw new BadRequestException(
          `${nameOf(d.product_id)} batch ${batch} sudah kedaluwarsa (${exp}) pada tanggal terima ${received}`,
        );
      }

      const key = `${d.product_id}|${batch}`;
      const inDoc = seen.get(key);
      if (inDoc && inDoc !== exp) {
        throw new BadRequestException(
          `Batch ${batch} (${nameOf(d.product_id)}) memiliki dua tanggal kedaluwarsa berbeda`,
        );
      }
      seen.set(key, exp);

      const existing = await tx.batchMutation.findFirst({
        where: { product_id: d.product_id, batch },
        select: { expired_date: true },
      });
      if (existing && dayOf(existing.expired_date) !== exp) {
        throw new BadRequestException(
          `Batch ${batch} (${nameOf(d.product_id)}) sudah terdaftar dengan kedaluwarsa ${dayOf(existing.expired_date)}`,
        );
      }
    }
  }

  // Daftar penerimaan; bisa difilter per sumber dan per gudang.
  findAll(filter: { sourceTypeId?: number; warehouseId?: number } = {}) {
    return this.prisma.productIn.findMany({
      where: {
        ...(filter.sourceTypeId && { source_type_id: filter.sourceTypeId }),
        ...(filter.warehouseId && { warehouse_id: filter.warehouseId }),
      },
      include,
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const data = await this.prisma.productIn.findUnique({
      where: { id },
      include,
    });

    if (!data) {
      throw new NotFoundException(`Product in ${id} not found`);
    }

    return data;
  }

  async update(id: number, dto: UpdateProductInDto) {
    try {
      return await this.prisma.productIn.update({
        where: { id },
        data: dto,
        include,
      });
    } catch (error) {
      this.handleError(error, id);
    }
  }

  /**
   * Hapus penerimaan. Ditolak kalau stok batch dari penerimaan ini sudah
   * dipakai (saldo akan menjadi minus).
   */
  async remove(id: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const doc = await tx.productIn.findUnique({
          where: { id },
          include: { details: true },
        });
        if (!doc) throw new NotFoundException(`Product in ${id} not found`);

        // Total qty yang akan hilang per produk + batch.
        const removing = new Map<
          string,
          { product_id: number; batch: string; qty: number }
        >();
        for (const d of doc.details) {
          const batch = d.batch as string;
          const key = `${d.product_id}|${batch}`;
          const cur = removing.get(key) ?? {
            product_id: d.product_id,
            batch,
            qty: 0,
          };
          cur.qty += d.qty;
          removing.set(key, cur);
        }

        for (const item of removing.values()) {
          const rows = await tx.batchMutation.groupBy({
            by: ['direction'],
            where: {
              warehouse_id: doc.warehouse_id,
              product_id: item.product_id,
              batch: item.batch,
            },
            _sum: { qty: true },
          });
          const sum = (dir: string) =>
            rows.find((r) => r.direction === dir)?._sum.qty ?? 0;
          const balance = sum('IN') - sum('OUT');

          if (balance - item.qty < 0) {
            throw new BadRequestException(
              `Penerimaan ${doc.transaction_no} tidak dapat dihapus: stok batch ${item.batch} ` +
                `(produk ${item.product_id}) sudah dipakai (saldo ${balance}, akan dihapus ${item.qty})`,
            );
          }
        }

        await tx.batchMutation.deleteMany({
          where: { productInDetail: { product_in_id: id } },
        });

        return tx.productIn.delete({ where: { id } });
      }, SERIALIZABLE);
    } catch (error) {
      this.handleError(error, id);
    }
  }

  private async generateNo(tx: Prisma.TransactionClient, date: Date) {
    const prefix = docPrefix('IN', date);

    const last = await tx.productIn.findFirst({
      where: { transaction_no: { startsWith: prefix } },
      orderBy: { transaction_no: 'desc' },
      select: { transaction_no: true },
    });

    return nextDocNo(prefix, last?.transaction_no);
  }

  private handleError(error: unknown, id?: number): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          throw new BadRequestException('Transaction number already exists');
        case 'P2003':
          throw new BadRequestException('Invalid reference');
        case 'P2025':
          throw new NotFoundException(`Product in ${id ?? ''} not found`);
        case 'P2034':
          throw new ConflictException(
            'Terjadi bentrok dengan transaksi lain, silakan coba lagi',
          );
      }
    }

    throw error;
  }
}