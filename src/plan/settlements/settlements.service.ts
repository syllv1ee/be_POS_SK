import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const num = (v: unknown) => Number(v ?? 0);

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Daftar plan yang sudah masuk tahap loading/komplit + total penjualannya. */
  async list() {
    const plans = await this.prisma.salesKanvasPlan.findMany({
      where: { status: { in: ['LOADING', 'KOMPLIT'] } },
      orderBy: { id: 'desc' },
      take: 200,
      include: {
        employee: { select: { id: true, code: true, name: true } },
      },
    });

    const sales = await this.prisma.invoiceOutlet.groupBy({
      by: ['sales_kanvas_plan_id'],
      where: { sales_kanvas_plan_id: { in: plans.map((p) => p.id) } },
      _sum: { total: true },
    });
    const salesMap = new Map(
      sales.map((s) => [s.sales_kanvas_plan_id, num(s._sum.total)]),
    );

    return plans.map((p) => ({
      id: p.id,
      plan_no: p.plan_no,
      status: p.status,
      departure_date: p.departure_date,
      return_date: p.return_date,
      employee: p.employee,
      total_sales: salesMap.get(p.id) ?? 0,
    }));
  }

  /** Rekap penutupan satu plan. Hanya baca, tidak mengubah data. */
  async detail(planId: number) {
    const plan = await this.prisma.salesKanvasPlan.findUnique({
      where: { id: planId },
      include: {
        employee: { select: { id: true, code: true, name: true } },
        marketArea: { select: { id: true, name: true } },
        vehicle: { select: { id: true, plate_number: true } },
      },
    });
    if (!plan) throw new NotFoundException('Plan tidak ditemukan');

    const [out, sold, retur, back, invoices, kasbonOps] = await Promise.all([
      // dibawa: Product Out ke plan ini
      this.prisma.productOutDetail.groupBy({
        by: ['product_id'],
        where: { productOut: { sales_kanvas_plan_id: planId } },
        _sum: { qty: true },
      }),
      // terjual: invoice outlet plan ini
      this.prisma.invoiceOutletDetail.groupBy({
        by: ['product_id'],
        where: { invoiceOutlet: { sales_kanvas_plan_id: planId } },
        _sum: { qty: true },
      }),
      // retur dari outlet atas invoice plan ini
      this.prisma.invoiceReturnDetail.groupBy({
        by: ['product_id'],
        where: {
          invoiceReturn: { invoiceOutlet: { sales_kanvas_plan_id: planId } },
        },
        _sum: { qty: true },
      }),
      // barang sisa yang dikembalikan ke gudang (Product In plan ini)
      this.prisma.productInDetail.groupBy({
        by: ['product_id'],
        where: { productIn: { sales_kanvas_plan_id: planId } },
        _sum: { qty: true },
      }),
      this.prisma.invoiceOutlet.findMany({
        where: { sales_kanvas_plan_id: planId },
        include: {
          outlet: { select: { id: true, code: true, name: true } },
          payments: { select: { amount: true } },
          returns: { select: { total: true } },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.salesKanvasKasbonOperational.findMany({
        where: { sales_kanvas_plan_id: planId, status: { not: 'BATAL' } },
        select: { kasbon_no: true, amount: true, purpose: true, status: true },
      }),
    ]);

    // ---- barang per produk ----
    const sum = (rows: { product_id: number; _sum: { qty: number | null } }[]) =>
      new Map(rows.map((r) => [r.product_id, r._sum.qty ?? 0]));
    const mOut = sum(out);
    const mSold = sum(sold);
    const mRetur = sum(retur);
    const mBack = sum(back);

    const productIds = [
      ...new Set([...mOut.keys(), ...mSold.keys(), ...mRetur.keys(), ...mBack.keys()]),
    ];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, code: true, name: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    const items = productIds
      .map((id) => {
        const loaded = mOut.get(id) ?? 0;
        const soldQty = mSold.get(id) ?? 0;
        const returQty = mRetur.get(id) ?? 0;
        const backQty = mBack.get(id) ?? 0;
        return {
          product: pMap.get(id)!,
          loaded,
          sold: soldQty,
          retur: returQty,
          returned_to_warehouse: backQty,
          // > 0: masih di sales / belum dikembalikan. < 0: data tidak cocok.
          difference: loaded - soldQty + returQty - backQty,
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));

    // ---- uang ----
    const invoiceRows = invoices.map((i) => {
      const total = num(i.total);
      const returTotal = i.returns.reduce((s, r) => s + num(r.total), 0);
      const paid = i.payments.reduce((s, p) => s + num(p.amount), 0);
      return {
        id: i.id,
        invoice_no: i.invoice_no,
        outlet: i.outlet,
        payment_type: i.payment_type,
        total,
        retur: returTotal,
        paid,
        remaining: total - returTotal - paid,
      };
    });

    const totalSales = invoiceRows.reduce((s, i) => s + i.total, 0);
    const totalRetur = invoiceRows.reduce((s, i) => s + i.retur, 0);
    const totalPaid = invoiceRows.reduce((s, i) => s + i.paid, 0);
    const kasbonTotal = kasbonOps.reduce((s, k) => s + num(k.amount), 0);

    return {
      plan: {
        id: plan.id,
        plan_no: plan.plan_no,
        status: plan.status,
        departure_date: plan.departure_date,
        return_date: plan.return_date,
        employee: plan.employee,
        marketArea: plan.marketArea,
        vehicle: plan.vehicle,
      },
      items,
      invoices: invoiceRows,
      kasbon_operational: kasbonOps.map((k) => ({
        ...k,
        amount: num(k.amount),
      })),
      summary: {
        total_sales: totalSales,
        total_retur: totalRetur,
        net_sales: totalSales - totalRetur,
        total_paid: totalPaid,
        receivable: totalSales - totalRetur - totalPaid,
        kasbon_operational: kasbonTotal,
        // uang yang seharusnya disetor sales setelah dipotong kasbon
        deposit: totalPaid - kasbonTotal,
        has_item_difference: items.some((i) => i.difference !== 0),
      },
    };
  }
}