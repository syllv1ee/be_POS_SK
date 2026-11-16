import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { docPrefix, nextDocNo } from '../../common/utils/doc-number.util';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export type Allocation = { batch: string; expired_date: Date; qty: number };
type Available = { batch: string; expired_date: Date; available: number };

/** Kode tipe_sumber (arah IN) untuk pengembalian sisa kanvas ke gudang. */
const RETURN_SOURCE_CODE = 'SALES_KANVAS';

@Injectable()
export class StockCoreService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ambil qty dari batch yang paling dulu kedaluwarsa (FEFO). */
  private pick(rows: Available[], qty: number, message: string): Allocation[] {
    const sorted = [...rows].sort(
      (a, b) => a.expired_date.getTime() - b.expired_date.getTime(),
    );
    let need = qty;
    const out: Allocation[] = [];
    for (const r of sorted) {
      if (need <= 0) break;
      const take = Math.min(r.available, need);
      out.push({ batch: r.batch, expired_date: r.expired_date, qty: take });
      need -= take;
    }
    if (need > 0) throw new BadRequestException(`${message} (kurang ${need})`);
    return out;
  }

  // ---------- stok gudang (dihitung dari mutasi_batch) ----------

  /** Saldo per batch di gudang: IN dikurangi OUT. */
  async warehouseBalances(tx: Tx, warehouse_id: number, product_id: number) {
    const rows = await tx.batchMutation.groupBy({
      by: ['batch', 'expired_date', 'direction'],
      where: { warehouse_id, product_id },
      _sum: { qty: true },
    });

    const map = new Map<string, Available>();
    for (const r of rows) {
      const key = `${r.batch}|${r.expired_date.toISOString()}`;
      const cur = map.get(key) ?? {
        batch: r.batch,
        expired_date: r.expired_date,
        available: 0,
      };
      cur.available += (r.direction === 'IN' ? 1 : -1) * (r._sum?.qty ?? 0);
      map.set(key, cur);
    }
    return [...map.values()].filter((r) => r.available > 0);
  }

  // ---------- stok sales (tabel stok_sales) ----------

  /** Dipanggil saat barang di-loading ke kendaraan (Product Out kanvas). */
  async addSales(
    tx: Tx,
    a: {
      plan_id: number;
      product_id: number;
      batch: string;
      expired_date: Date;
      qty: number;
    },
  ) {
    await tx.salesStock.upsert({
      where: {
        sales_kanvas_plan_id_product_id_batch: {
          sales_kanvas_plan_id: a.plan_id,
          product_id: a.product_id,
          batch: a.batch,
        },
      },
      update: { qty: { increment: a.qty } },
      create: {
        sales_kanvas_plan_id: a.plan_id,
        product_id: a.product_id,
        batch: a.batch,
        expired_date: a.expired_date,
        qty: a.qty,
      },
    });
  }

  /** Atomik: hanya berkurang bila stok cukup (aman untuk request bersamaan). */
  async subSales(
    tx: Tx,
    plan_id: number,
    product_id: number,
    batch: string,
    qty: number,
  ) {
    const res = await tx.salesStock.updateMany({
      where: {
        sales_kanvas_plan_id: plan_id,
        product_id,
        batch,
        qty: { gte: qty },
      },
      data: { qty: { decrement: qty } },
    });
    if (res.count === 0) {
      throw new BadRequestException(
        `Stok sales tidak cukup untuk batch ${batch} (produk ${product_id})`,
      );
    }
  }

  /** Mengembalikan stok sales (dipakai saat invoice dihapus). */
  async restoreSales(
    tx: Tx,
    plan_id: number,
    product_id: number,
    batch: string,
    qty: number,
  ) {
    const res = await tx.salesStock.updateMany({
      where: { sales_kanvas_plan_id: plan_id, product_id, batch },
      data: { qty: { increment: qty } },
    });
    if (res.count === 0) {
      throw new BadRequestException(
        `Data stok sales batch ${batch} tidak ditemukan`,
      );
    }
  }

  /** FEFO dari stok sales sebuah plan. */
  async allocateFromSales(
    tx: Tx,
    plan_id: number,
    product_id: number,
    qty: number,
  ) {
    const rows = await tx.salesStock.findMany({
      where: { sales_kanvas_plan_id: plan_id, product_id, qty: { gt: 0 } },
    });
    return this.pick(
      rows.map((r) => ({
        batch: r.batch,
        expired_date: r.expired_date,
        available: r.qty,
      })),
      qty,
      `Stok sales tidak cukup untuk produk ${product_id}`,
    );
  }

  // ---------- selesai kanvas ----------

  /**
   * Sisa stok_sales dikembalikan ke gudang lewat Product In dengan sumber
   * SALES_KANVAS (arah IN), lalu stok_sales menjadi 0.
   * Panggil di dalam transaksi yang sama dengan perubahan status plan.
   */
  async returnLeftovers(
    tx: Tx,
    args: { plan_id: number; warehouse_id: number; user_id?: number },
  ) {
    const leftovers = await tx.salesStock.findMany({
      where: { sales_kanvas_plan_id: args.plan_id, qty: { gt: 0 } },
    });
    if (leftovers.length === 0) return null;

    const warehouse = await tx.warehouse.findUnique({
      where: { id: args.warehouse_id },
      select: { id: true },
    });
    if (!warehouse) {
      throw new BadRequestException('Gudang tujuan tidak ditemukan');
    }

    const source = await tx.sourceType.findFirst({
      where: { code: RETURN_SOURCE_CODE, direction: 'IN', is_active: true },
      select: { id: true },
    });
    if (!source) {
      throw new BadRequestException(
        `Tipe sumber ${RETURN_SOURCE_CODE} (arah IN) belum ada di master tipe sumber`,
      );
    }

    const date = new Date();
    const prefix = docPrefix('IN', date);
    const last = await tx.productIn.findFirst({
      where: { transaction_no: { startsWith: prefix } },
      orderBy: { transaction_no: 'desc' },
      select: { transaction_no: true },
    });

    const created = await tx.productIn.create({
      data: {
        transaction_no: nextDocNo(prefix, last?.transaction_no),
        date,
        warehouse_id: args.warehouse_id,
        source_type_id: source.id,
        sales_kanvas_plan_id: args.plan_id,
        description: 'Pengembalian sisa kasbon (selesai kanvas)',
        created_by: args.user_id,
        details: {
          create: leftovers.map((s) => ({
            product_id: s.product_id,
            batch: s.batch,
            expired_date: s.expired_date,
            qty: s.qty,
          })),
        },
      },
      include: { details: true },
    });

    await tx.batchMutation.createMany({
      data: created.details.map((d) => ({
        date: created.date,
        product_id: d.product_id,
        warehouse_id: created.warehouse_id,
        sales_kanvas_plan_id: args.plan_id,
        product_in_detail_id: d.id,
        batch: d.batch as string,
        expired_date: d.expired_date,
        direction: 'IN',
        qty: d.qty,
      })),
    });

    for (const s of leftovers) {
      await this.subSales(tx, args.plan_id, s.product_id, s.batch, s.qty);
    }

    return { product_in_id: created.id, items: leftovers.length };
  }

  // ---------- monitoring ----------

  salesSummary(plan_id?: number) {
    return this.prisma.salesStock.findMany({
      where: {
        qty: { gt: 0 },
        ...(plan_id !== undefined ? { sales_kanvas_plan_id: plan_id } : {}),
      },
      include: {
        product: { select: { id: true, code: true, name: true } },
        salesKanvasPlan: { select: { id: true, plan_no: true } },
      },
      orderBy: [{ sales_kanvas_plan_id: 'desc' }, { expired_date: 'asc' }],
    });
  }

  async warehouseSummary(warehouse_id: number) {
    return this.prisma.$transaction(async (tx) => {
      const products = await tx.batchMutation.findMany({
        where: { warehouse_id },
        distinct: ['product_id'],
        select: {
          product_id: true,
          product: { select: { code: true, name: true } },
        },
      });
      const result: {
        product_id: number;
        code: string | null;
        name: string;
        batch: string;
        expired_date: Date;
        qty: number;
      }[] = [];
      for (const p of products) {
        for (const b of await this.warehouseBalances(
          tx,
          warehouse_id,
          p.product_id,
        )) {
          result.push({
            product_id: p.product_id,
            code: p.product.code,
            name: p.product.name,
            batch: b.batch,
            expired_date: b.expired_date,
            qty: b.available,
          });
        }
      }
      return result;
    });
  }
}