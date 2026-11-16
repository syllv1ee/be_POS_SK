
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { docPrefix, nextDocNo } from '../../common/utils/doc-number.util';
import { StockCoreService } from '../../stock/stock-core/stock-core.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

const outletSelect = { select: { id: true, code: true, name: true } };

const include = {
  details: {
    include: { product: { select: { id: true, code: true, name: true } } },
  },
  outlet: outletSelect,
  payments: true,
};

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockCoreService,
  ) {}

  async create(dto: CreateInvoiceDto) {
    const { details, ...header } = dto;

    if (!header.sales_kanvas_plan_id) {
      throw new BadRequestException(
        'Plan wajib diisi: stok invoice diambil dari stok sales pada plan tersebut',
      );
    }

    const planId = header.sales_kanvas_plan_id;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Invoice hanya boleh dibuat ketika barang sudah onloading.
        const plan = await tx.salesKanvasPlan.findUnique({
          where: { id: planId },
          select: { id: true, status: true },
        });

        if (!plan) {
          throw new NotFoundException(`Plan ${planId} tidak ditemukan`);
        }

        if (plan.status !== 'LOADING') {
          throw new BadRequestException(
            `Invoice hanya dapat dibuat untuk plan berstatus LOADING. Status saat ini: ${plan.status}`,
          );
        }

        const outlet = await tx.outlet.findUniqueOrThrow({
          where: { id: header.outlet_id },
        });

        // Harga: dari input, kalau kosong dari product-prices.
        const priceRows = await tx.productPrice.findMany({
          where: {
            price_type_id: outlet.price_type_id,
            product_id: { in: details.map((d) => d.product_id) },
          },
        });

        const priceMap = new Map(
          priceRows.map((p) => [p.product_id, p.price]),
        );

        let total = new Prisma.Decimal(0);

        const priced = details.map((d) => {
          const price =
            d.price !== undefined
              ? new Prisma.Decimal(d.price)
              : priceMap.get(d.product_id);

          if (price === undefined) {
            throw new BadRequestException(
              `Harga produk ${d.product_id} untuk tipe harga outlet belum diatur`,
            );
          }

          total = total.plus(price.mul(d.qty));

          return { ...d, price };
        });

        const isTop = header.payment_type === 'TOP';

        // Cek limit piutang untuk penjualan tempo.
        if (
          isTop &&
          outlet.receivable_limit &&
          outlet.receivable_limit.gt(0)
        ) {
          const [inv, paid] = await Promise.all([
            tx.invoiceOutlet.aggregate({
              where: { outlet_id: outlet.id },
              _sum: { total: true },
            }),
            tx.invoicePayment.aggregate({
              where: { invoiceOutlet: { outlet_id: outlet.id } },
              _sum: { amount: true },
            }),
          ]);

          const running = (inv._sum.total ?? new Prisma.Decimal(0)).minus(
            paid._sum.amount ?? 0,
          );

          if (running.plus(total).gt(outlet.receivable_limit)) {
            throw new BadRequestException(
              `Melebihi limit piutang outlet (limit ${outlet.receivable_limit}, piutang berjalan ${running})`,
            );
          }
        }

        // Ambil stok dari stok_sales menggunakan FEFO.
        const lines: {
          product_id: number;
          batch: string;
          qty: number;
          price: Prisma.Decimal;
          subtotal: Prisma.Decimal;
        }[] = [];

        for (const d of priced) {
          const parts = await this.stock.allocateFromSales(
            tx,
            planId,
            d.product_id,
            d.qty,
          );

          for (const p of parts) {
            await this.stock.subSales(
              tx,
              planId,
              d.product_id,
              p.batch,
              p.qty,
            );

            lines.push({
              product_id: d.product_id,
              batch: p.batch,
              qty: p.qty,
              price: d.price,
              subtotal: d.price.mul(p.qty),
            });
          }
        }

        const due_date = isTop ? new Date(header.date) : null;

        if (due_date) {
          due_date.setUTCDate(due_date.getUTCDate() + header.top_days);
        }

        const prefix = docPrefix('INV', header.date);

        const last = await tx.invoiceOutlet.findFirst({
          where: { invoice_no: { startsWith: prefix } },
          orderBy: { invoice_no: 'desc' },
          select: { invoice_no: true },
        });

        const invoice = await tx.invoiceOutlet.create({
          data: {
            ...header,
            top_days: isTop ? header.top_days : 0,
            due_date,
            invoice_no: nextDocNo(prefix, last?.invoice_no),
            total,
            details: { create: lines },
          },
        });

        if (isTop) {
          await tx.outletReceivableCard.create({
            data: {
              outlet_id: outlet.id,
              invoice_outlet_id: invoice.id,
              date: header.date,
              remaining: total,
            },
          });
        } else {
          await tx.invoicePayment.create({
            data: {
              invoice_outlet_id: invoice.id,
              date: header.date,
              amount: total,
            },
          });
        }

        return tx.invoiceOutlet.findUniqueOrThrow({
          where: { id: invoice.id },
          include,
        });
      }, SERIALIZABLE);
    } catch (e) {
      this.handleError(e);
    }
  }

  findAll(outletId?: number, planId?: number) {
    return this.prisma.invoiceOutlet.findMany({
      where: { outlet_id: outletId, sales_kanvas_plan_id: planId },
      include: { outlet: outletSelect, payments: true },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const data = await this.prisma.invoiceOutlet.findUnique({
      where: { id },
      include,
    });

    if (!data) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    return data;
  }

  async remove(id: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoiceOutlet.findUniqueOrThrow({
          where: { id },
          include: {
            details: true,
            _count: { select: { payments: true, returns: true } },
          },
        });

        if (invoice._count.returns > 0) {
          throw new BadRequestException('Invoice sudah memiliki retur');
        }

        if (
          invoice.payment_type === 'TOP' &&
          invoice._count.payments > 0
        ) {
          throw new BadRequestException(
            'Invoice tempo sudah memiliki pembayaran, hapus pembayaran terlebih dahulu',
          );
        }

        // Penghapusan invoice plan hanya boleh selama plan masih LOADING.
        if (invoice.sales_kanvas_plan_id) {
          const plan = await tx.salesKanvasPlan.findUnique({
            where: { id: invoice.sales_kanvas_plan_id },
            select: { status: true },
          });

          if (!plan) {
            throw new NotFoundException(
              `Plan ${invoice.sales_kanvas_plan_id} tidak ditemukan`,
            );
          }

          if (plan.status !== 'LOADING') {
            throw new BadRequestException(
              `Invoice tidak dapat dihapus karena plan berstatus ${plan.status}. Pengembalian stok hanya diizinkan saat plan LOADING`,
            );
          }

          // Kembalikan stok ke stok_sales sesuai batch asal.
          for (const d of invoice.details) {
            if (d.batch) {
              await this.stock.restoreSales(
                tx,
                invoice.sales_kanvas_plan_id,
                d.product_id,
                d.batch,
                d.qty,
              );
            }
          }
        }

        await tx.outletReceivableCard.deleteMany({
          where: { invoice_outlet_id: id },
        });

        await tx.invoicePayment.deleteMany({
          where: { invoice_outlet_id: id },
        });

        return tx.invoiceOutlet.delete({
          where: { id },
        });
      }, SERIALIZABLE);
    } catch (e) {
      this.handleError(e, id);
    }
  }

  private handleError(e: unknown, id?: number): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      switch (e.code) {
        case 'P2002':
          throw new BadRequestException('Invoice number already exists');

        case 'P2003':
          throw new BadRequestException('Invalid reference');

        case 'P2025':
          throw new NotFoundException(`Invoice ${id ?? ''} not found`);

        case 'P2034':
          throw new BadRequestException(
            'Terjadi bentrok dengan transaksi lain, silakan coba lagi',
          );
      }
    }

    throw e;
  }
}
