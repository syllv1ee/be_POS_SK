import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function getBatchBalance(
  db: Prisma.TransactionClient,
  where: { warehouse_id: number; product_id: number; batch: string },
) {
  const rows = await db.batchMutation.groupBy({
    by: ['direction'],
    where,
    _sum: { qty: true },
  });
  const sum = (dir: string) =>
    rows.find((r) => r.direction === dir)?._sum.qty ?? 0;
  return sum('IN') - sum('OUT');
}

export type BatchAllocation = {
  product_id: number;
  batch: string;
  expired_date: Date;
  qty: number;
};

/**
 * Alokasi FEFO: ambil batch dengan expired_date terdekat lebih dulu.
 * Batch yang saldonya 0 atau sudah expired pada `date` dilewati.
 * Satu item bisa dipecah ke beberapa batch.
 */
export async function allocateFefo(
  tx: Prisma.TransactionClient,
  params: {
    warehouse_id: number;
    date: Date;
    items: { product_id: number; qty: number }[];
  },
): Promise<BatchAllocation[]> {
  const { warehouse_id, date, items } = params;

  // Gabungkan qty untuk produk yang sama.
  const need = new Map<number, number>();
  for (const item of items) {
    need.set(item.product_id, (need.get(item.product_id) ?? 0) + item.qty);
  }

  const result: BatchAllocation[] = [];

  for (const [product_id, qty] of need) {
    // Kunci per gudang+produk supaya dua pengeluaran bersamaan tidak
    // mengambil batch yang sama. Lepas otomatis saat transaksi selesai.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${warehouse_id}::int, ${product_id}::int)`;

    const rows = await tx.batchMutation.groupBy({
      by: ['batch', 'expired_date', 'direction'],
      where: { warehouse_id, product_id },
      _sum: { qty: true },
    });

    const balances = new Map<
      string,
      { batch: string; expired_date: Date; balance: number }
    >();
    for (const r of rows) {
      const key = `${r.batch}|${r.expired_date.toISOString()}`;
      const cur = balances.get(key) ?? {
        batch: r.batch,
        expired_date: r.expired_date,
        balance: 0,
      };
      const q = r._sum.qty ?? 0;
      cur.balance += r.direction === 'IN' ? q : -q;
      balances.set(key, cur);
    }

    const available = [...balances.values()]
      .filter((b) => b.balance > 0 && b.expired_date >= date)
      .sort(
        (a, b) =>
          a.expired_date.getTime() - b.expired_date.getTime() ||
          a.batch.localeCompare(b.batch),
      );

    let remaining = qty;
    for (const b of available) {
      if (remaining <= 0) break;
      const take = Math.min(b.balance, remaining);
      result.push({
        product_id,
        batch: b.batch,
        expired_date: b.expired_date,
        qty: take,
      });
      remaining -= take;
    }

    if (remaining > 0) {
      const total = available.reduce((s, b) => s + b.balance, 0);
      throw new BadRequestException(
        `Stok tidak cukup untuk produk ${product_id} ` +
          `(tersedia ${total}, diminta ${qty})`,
      );
    }
  }

  return result;
}