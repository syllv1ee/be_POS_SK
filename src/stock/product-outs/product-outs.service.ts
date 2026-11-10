import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { docPrefix, nextDocNo } from '../../common/utils/doc-number.util';
import { SourceTypesService } from '../source-types/source-types.service';

import { CreateProductOutDto } from './dto/create-product-out.dto';
import { UpdateProductOutDto } from './dto/update-product-out.dto';

const include = {
  details: {
    include: {
      product: { select: { id: true, code: true, name: true } },
    },
  },
  warehouse: true,
  sourceType: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ProductOutInclude;

type Allocation = {
  product_id: number;
  batch: string;
  qty: number;
  expired_date: Date;
};

@Injectable()
export class ProductOutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceTypes: SourceTypesService,
  ) {}

  /** Tanggal dokumen tidak boleh lebih dari hari ini (zona waktu Jakarta). */
  private assertNotFuture(date: Date) {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jakarta',
    });
    if (date.toISOString().slice(0, 10) > today) {
      throw new BadRequestException(
        'Tanggal transaksi tidak boleh melebihi hari ini',
      );
    }
  }

  /**
   * Gudang mengeluarkan barang. Stok langsung berkurang (FEFO otomatis).
   * Untuk Sales Kanvas: kasbon produk -> ONLOADING dan plan -> LOADING
   * dalam transaction yang sama.
   */
  async create(dto: CreateProductOutDto, userId?: number) {
    const { details, ...header } = dto;

    try {
      this.assertNotFuture(header.date);

      const source = await this.sourceTypes.assertUsable(
        header.source_type_id,
        'OUT',
      );
      const isKanvas = source.code === 'SALES_KANVAS';

      if (
        !isKanvas &&
        (header.sales_kanvas_plan_id || header.sales_kanvas_kasbon_product_id)
      ) {
        throw new BadRequestException(
          'Plan dan kasbon hanya untuk sumber Sales Kanvas',
        );
      }

      return await this.prisma.$transaction(
        async (tx) => {
          // Dicek di dalam transaction: dua gudang tidak bisa loading kasbon yang sama.
          if (isKanvas) {
            await this.assertLoadingAllowed(tx, header, details);
          }

          const allocations = await this.allocateFefo(
            tx,
            header.warehouse_id,
            header.date,
            details,
          );

          const transaction_no = await this.generateNo(tx, header.date);

          const created = await tx.productOut.create({
            data: {
              ...header,
              transaction_no,
              created_by: userId,
              details: {
                create: allocations.map((a) => ({
                  product_id: a.product_id,
                  batch: a.batch,
                  qty: a.qty,
                })),
              },
            },
            include: { details: true },
          });

          const expiryOf = new Map(
            allocations.map((a) => [
              `${a.product_id}|${a.batch}`,
              a.expired_date,
            ]),
          );

          await tx.batchMutation.createMany({
            data: created.details.map((detail) => ({
              date: created.date,
              product_id: detail.product_id,
              warehouse_id: created.warehouse_id,
              sales_kanvas_plan_id: created.sales_kanvas_plan_id,
              product_out_detail_id: detail.id,
              batch: detail.batch as string,
              expired_date: expiryOf.get(
                `${detail.product_id}|${detail.batch}`,
              ) as Date,
              direction: 'OUT' as const,
              qty: detail.qty,
            })),
          });

          if (isKanvas) {
            await tx.salesKanvasKasbonProduct.update({
              where: { id: header.sales_kanvas_kasbon_product_id! },
              data: { status: 'ONLOADING' },
            });
            await tx.salesKanvasPlan.update({
              where: { id: header.sales_kanvas_plan_id! },
              data: { status: 'LOADING' },
            });
          }

          return tx.productOut.findUniqueOrThrow({
            where: { id: created.id },
            include,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /** Loading: plan Disetujui, kasbon produk milik plan itu dan masih Draft, qty tidak melebihi kasbon. */
  private async assertLoadingAllowed(
    tx: Prisma.TransactionClient,
    header: {
      sales_kanvas_plan_id?: number;
      sales_kanvas_kasbon_product_id?: number;
    },
    details: CreateProductOutDto['details'],
  ) {
    if (!header.sales_kanvas_plan_id) {
      throw new BadRequestException(
        'Plan wajib diisi untuk sumber Sales Kanvas',
      );
    }
    if (!header.sales_kanvas_kasbon_product_id) {
      throw new BadRequestException(
        'Kasbon produk wajib dipilih untuk sumber Sales Kanvas',
      );
    }

    const plan = await tx.salesKanvasPlan.findUnique({
      where: { id: header.sales_kanvas_plan_id },
    });
    if (!plan) throw new NotFoundException('Plan tidak ditemukan');
    if (!['DISETUJUI', 'LOADING'].includes(plan.status)) {
      throw new BadRequestException(
        'Product Out hanya dapat dibuat untuk plan yang sudah Disetujui',
      );
    }

    const bon = await tx.salesKanvasKasbonProduct.findUnique({
      where: { id: header.sales_kanvas_kasbon_product_id },
      include: { details: true },
    });
    if (!bon || bon.sales_kanvas_plan_id !== plan.id) {
      throw new BadRequestException('Kasbon produk tidak sesuai dengan plan');
    }
    if (bon.status !== 'DRAFT') {
      throw new BadRequestException(
        bon.status === 'ONLOADING'
          ? `Kasbon ${bon.kasbon_no} sudah di-loading`
          : `Kasbon ${bon.kasbon_no} berstatus ${bon.status} dan tidak dapat di-loading`,
      );
    }

    // Barang yang dikeluarkan tidak boleh melebihi isi kasbon.
    const limit = new Map(bon.details.map((d) => [d.product_id, d.qty]));
    const asked = new Map<number, number>();
    for (const d of details) {
      asked.set(d.product_id, (asked.get(d.product_id) ?? 0) + d.qty);
    }
    for (const [productId, qty] of asked) {
      const max = limit.get(productId);
      if (max === undefined) {
        throw new BadRequestException(
          `Produk ${productId} tidak ada di kasbon ${bon.kasbon_no}`,
        );
      }
      if (qty > max) {
        throw new BadRequestException(
          `Produk ${productId} melebihi kasbon (maksimal ${max}, diminta ${qty})`,
        );
      }
    }
  }

  /**
   * FEFO: ambil dari batch dengan kedaluwarsa terdekat. Tanggal sama: urut nomor batch.
   * Batch yang sudah kedaluwarsa pada tanggal dokumen tidak dipakai.
   */
  private async allocateFefo(
    tx: Prisma.TransactionClient,
    warehouseId: number,
    refDate: Date,
    details: CreateProductOutDto['details'],
  ): Promise<Allocation[]> {
    const need = new Map<number, number>();
    for (const d of details) {
      need.set(d.product_id, (need.get(d.product_id) ?? 0) + d.qty);
    }

    const rows = await tx.batchMutation.findMany({
      where: {
        warehouse_id: warehouseId,
        product_id: { in: [...need.keys()] },
      },
      select: {
        product_id: true,
        batch: true,
        expired_date: true,
        direction: true,
        qty: true,
      },
    });

    const batches = new Map<
      string,
      { product_id: number; batch: string; expired: Date; balance: number }
    >();
    for (const r of rows) {
      const key = `${r.product_id}|${r.batch}`;
      const cur = batches.get(key) ?? {
        product_id: r.product_id,
        batch: r.batch,
        expired: r.expired_date,
        balance: 0,
      };
      cur.balance += r.direction === 'IN' ? r.qty : -r.qty;
      batches.set(key, cur);
    }

    const result: Allocation[] = [];

    for (const [productId, qty] of need) {
      const stocked = [...batches.values()].filter(
        (b) => b.product_id === productId && b.balance > 0,
      );
      const usable = stocked
        .filter((b) => b.expired >= refDate)
        .sort(
          (a, b) =>
            a.expired.getTime() - b.expired.getTime() ||
            a.batch.localeCompare(b.batch, undefined, { numeric: true }),
        );

      const available = usable.reduce((s, b) => s + b.balance, 0);
      if (available < qty) {
        const expiredQty = stocked
          .filter((b) => b.expired < refDate)
          .reduce((s, b) => s + b.balance, 0);
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { name: true },
        });
        throw new BadRequestException(
          `Stok tidak cukup untuk ${product?.name ?? `produk ${productId}`} ` +
            `(tersedia ${available}, diminta ${qty})` +
            (expiredQty > 0
              ? `. ${expiredQty} lainnya sudah kedaluwarsa dan tidak bisa dipakai`
              : ''),
        );
      }

      let left = qty;
      for (const b of usable) {
        if (left <= 0) break;
        const take = Math.min(left, b.balance);
        result.push({
          product_id: productId,
          batch: b.batch,
          qty: take,
          expired_date: b.expired,
        });
        left -= take;
      }
    }

    return result;
  }

  findAll(filter: { sourceTypeId?: number; warehouseId?: number } = {}) {
    return this.prisma.productOut.findMany({
      where: {
        ...(filter.sourceTypeId && { source_type_id: filter.sourceTypeId }),
        ...(filter.warehouseId && { warehouse_id: filter.warehouseId }),
      },
      include,
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const data = await this.prisma.productOut.findUnique({
      where: { id },
      include,
    });

    if (!data) {
      throw new NotFoundException(`Product out ${id} not found`);
    }

    return data;
  }

  async update(id: number, dto: UpdateProductOutDto) {
    try {
      return await this.prisma.productOut.update({
        where: { id },
        data: dto,
        include,
      });
    } catch (error) {
      this.handleError(error, id);
    }
  }

  /**
   * Gudang membatalkan pengeluaran (setelah dihubungi supervisor):
   * stok kembali, kasbon produk kembali Draft, plan kembali Disetujui.
   * Supervisor lalu bisa membatalkan plan dan membuat plan baru.
   * Ditolak kalau plan sudah punya invoice atau sudah Komplit.
   */
  async remove(id: number) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.productOut.findUniqueOrThrow({
            where: { id },
          });

          if (current.sales_kanvas_plan_id) {
            const plan = await tx.salesKanvasPlan.findUnique({
              where: { id: current.sales_kanvas_plan_id },
              select: { status: true },
            });
            if (plan?.status === 'KOMPLIT') {
              throw new BadRequestException(
                'Product Out tidak dapat dihapus karena plan sudah Komplit',
              );
            }

            const invoices = await tx.invoiceOutlet.count({
              where: { sales_kanvas_plan_id: current.sales_kanvas_plan_id },
            });
            if (invoices > 0) {
              throw new BadRequestException(
                'Product Out tidak dapat dihapus karena plan sudah punya invoice penjualan',
              );
            }
          }

          await tx.batchMutation.deleteMany({
            where: { productOutDetail: { product_out_id: id } },
          });

          const removed = await tx.productOut.delete({ where: { id } });

          if (current.sales_kanvas_kasbon_product_id) {
            await tx.salesKanvasKasbonProduct.updateMany({
              where: {
                id: current.sales_kanvas_kasbon_product_id,
                status: 'ONLOADING',
              },
              data: { status: 'DRAFT' },
            });
          }

          if (current.sales_kanvas_plan_id) {
            const others = await tx.productOut.count({
              where: { sales_kanvas_plan_id: current.sales_kanvas_plan_id },
            });
            if (others === 0) {
              await tx.salesKanvasPlan.updateMany({
                where: {
                  id: current.sales_kanvas_plan_id,
                  status: 'LOADING',
                },
                data: { status: 'DISETUJUI' },
              });
            }
          }

          return removed;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.handleError(error, id);
    }
  }

  private async generateNo(tx: Prisma.TransactionClient, date: Date) {
    const prefix = docPrefix('OUT', date);

    const last = await tx.productOut.findFirst({
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
          throw new NotFoundException(`Product out ${id ?? ''} not found`);
        case 'P2034':
          throw new ConflictException(
            'Terjadi bentrok dengan transaksi lain, silakan coba lagi',
          );
      }
    }

    throw error;
  }
}