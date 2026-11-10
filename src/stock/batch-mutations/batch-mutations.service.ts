import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Filter = {
  warehouseId?: number;
  productId?: number;
  direction?: 'IN' | 'OUT';
  batch?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

const include = {
  product: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  salesKanvasPlan: { select: { id: true, plan_no: true } },
} satisfies Prisma.BatchMutationInclude;

@Injectable()
export class BatchMutationsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(f: Filter): Prisma.BatchMutationWhereInput {
    return {
      ...(f.warehouseId && { warehouse_id: f.warehouseId }),
      ...(f.productId && { product_id: f.productId }),
      ...(f.direction && { direction: f.direction }),
      ...(f.batch && { batch: { contains: f.batch, mode: 'insensitive' } }),
      ...((f.dateFrom || f.dateTo) && {
        date: {
          ...(f.dateFrom && { gte: f.dateFrom }),
          ...(f.dateTo && { lte: f.dateTo }),
        },
      }),
    };
  }

  /** Riwayat mutasi (buku besar), terbaru lebih dulu. */
  findAll(f: Filter = {}) {
    return this.prisma.batchMutation.findMany({
      where: this.where(f),
      include,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 500,
    });
  }

  /** Saldo per batch, urut FEFO (kedaluwarsa terdekat dulu). */
  async stock(f: Pick<Filter, 'warehouseId' | 'productId'> = {}) {
    const rows = await this.prisma.batchMutation.findMany({
      where: this.where(f),
      include: {
        product: include.product,
        warehouse: include.warehouse,
      },
    });

    const map = new Map<
      string,
      {
        product: { id: number; code: string | null; name: string };
        warehouse: { id: number; code: string | null; name: string };
        batch: string;
        expired_date: Date;
        qty_in: number;
        qty_out: number;
        balance: number;
      }
    >();

    for (const r of rows) {
      const key = `${r.product_id}|${r.warehouse_id}|${r.batch}`;
      const cur = map.get(key) ?? {
        product: r.product,
        warehouse: r.warehouse,
        batch: r.batch,
        expired_date: r.expired_date,
        qty_in: 0,
        qty_out: 0,
        balance: 0,
      };
      if (r.direction === 'IN') cur.qty_in += r.qty;
      else cur.qty_out += r.qty;
      cur.balance = cur.qty_in - cur.qty_out;
      map.set(key, cur);
    }

    return [...map.values()]
      .filter((b) => b.balance > 0)
      .sort(
        (a, b) =>
          a.expired_date.getTime() - b.expired_date.getTime() ||
          a.batch.localeCompare(b.batch, undefined, { numeric: true }),
      );
  }
}