import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

const ONLOADING_MSG =
  'Barang sudah onloading. Hubungi gudang untuk membatalkan loading terlebih dahulu';

/**
 * Alur plan:
 *   Sales buat plan (DRAFT) -> SPV setujui (DISETUJUI) -> SPV buat kasbon (DRAFT)
 *   -> Gudang Product Out (bon ONLOADING, plan LOADING) -> SPV tandai KOMPLIT.
 * Batal: SPV selama belum onloading, Gudang jika sudah onloading.
 * Revisi = batalkan plan, buat plan baru, buat kasbon baru.
 */
@Injectable()
export class PlanWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  private async getPlan(tx: Prisma.TransactionClient, id: number) {
    const plan = await tx.salesKanvasPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} tidak ditemukan`);
    return plan;
  }

  /** Batalkan plan beserta kedua kasbonnya. */
  private async markCancelled(tx: Prisma.TransactionClient, planId: number) {
    await tx.salesKanvasPlan.update({
      where: { id: planId },
      data: { status: 'BATAL', cancelled_at: new Date() },
    });
    const where = {
      sales_kanvas_plan_id: planId,
      status: { not: 'BATAL' as const },
    };
    await tx.salesKanvasKasbonProduct.updateMany({
      where,
      data: { status: 'BATAL' },
    });
    await tx.salesKanvasKasbonOperational.updateMany({
      where,
      data: { status: 'BATAL' },
    });
  }

  /** SPV: setujui plan buatan sales. */
  async approve(id: number) {
    const done = await this.prisma.salesKanvasPlan.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'DISETUJUI' },
    });
    if (done.count === 0) {
      const plan = await this.getPlan(this.prisma, id);
      throw new BadRequestException(
        `Plan berstatus ${plan.status}, hanya plan Draft yang bisa disetujui`,
      );
    }
    return this.prisma.salesKanvasPlan.findUnique({ where: { id } });
  }

  /** SPV: batalkan plan selama barang belum onloading. */
  async cancel(id: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await this.getPlan(tx, id);

        if (plan.status === 'LOADING') {
          throw new BadRequestException(ONLOADING_MSG);
        }
        if (plan.status !== 'DRAFT' && plan.status !== 'DISETUJUI') {
          throw new BadRequestException(
            `Plan berstatus ${plan.status} tidak dapat dibatalkan`,
          );
        }

        const onloading = await tx.salesKanvasKasbonProduct.findFirst({
          where: { sales_kanvas_plan_id: id, status: 'ONLOADING' },
          select: { id: true },
        });
        if (onloading) throw new BadRequestException(ONLOADING_MSG);

        await this.markCancelled(tx, id);
        return tx.salesKanvasPlan.findUnique({ where: { id } });
      }, SERIALIZABLE);
    } catch (e) {
      this.handle(e);
    }
  }

  /** SPV: tandai plan selesai. */
  async complete(id: number) {
    const done = await this.prisma.salesKanvasPlan.updateMany({
      where: { id, status: 'LOADING' },
      data: { status: 'KOMPLIT' },
    });
    if (done.count === 0) {
      const plan = await this.getPlan(this.prisma, id);
      throw new BadRequestException(
        `Plan berstatus ${plan.status}, hanya plan Loading yang bisa ditandai Komplit`,
      );
    }
    return this.prisma.salesKanvasPlan.findUnique({ where: { id } });
  }

  /**
   * Gudang: batalkan loading (bon sudah ONLOADING). Product Out plan ini
   * dihapus sehingga stok kembali, lalu plan dan kasbon menjadi BATAL.
   */
  async cancelLoading(id: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await this.getPlan(tx, id);
        if (plan.status !== 'LOADING') {
          throw new BadRequestException(
            'Hanya plan berstatus Loading yang bisa dibatalkan loading-nya',
          );
        }

        const bon = await tx.salesKanvasKasbonProduct.findFirst({
          where: { sales_kanvas_plan_id: id, status: 'ONLOADING' },
          select: { id: true },
        });
        if (!bon) {
          throw new BadRequestException(
            'Tidak ada bon barang yang sedang onloading',
          );
        }

        const invoices = await tx.invoiceOutlet.count({
          where: { sales_kanvas_plan_id: id },
        });
        if (invoices > 0) {
          throw new BadRequestException(
            'Plan sudah punya invoice penjualan, loading tidak dapat dibatalkan',
          );
        }

        const outs = await tx.productOut.findMany({
          where: { sales_kanvas_kasbon_product_id: bon.id },
          select: { id: true },
        });
        const ids = outs.map((o) => o.id);

        await tx.batchMutation.deleteMany({
          where: { productOutDetail: { product_out_id: { in: ids } } },
        });
        await tx.productOut.deleteMany({ where: { id: { in: ids } } });

        await this.markCancelled(tx, id);
        return tx.salesKanvasPlan.findUnique({ where: { id } });
      }, SERIALIZABLE);
    } catch (e) {
      this.handle(e);
    }
  }

  private handle(e: unknown): never {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2034'
    ) {
      throw new BadRequestException(
        'Terjadi bentrok dengan transaksi lain, silakan coba lagi',
      );
    }
    throw e;
  }
}