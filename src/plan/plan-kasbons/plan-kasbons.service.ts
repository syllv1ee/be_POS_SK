import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { docPrefix, nextDocNo } from '../../common/utils/doc-number.util';
import { PlanKasbonDto } from './dto/plan-kasbon.dto';

@Injectable()
export class PlanKasbonsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getPlan(planId: number) {
    const plan = await this.prisma.salesKanvasPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) throw new NotFoundException(`Plan ${planId} tidak ditemukan`);
    return plan;
  }

  /** SPV membuat kasbon setelah plan disetujui. Status awal Draft. */
  async create(planId: number, dto: PlanKasbonDto) {
    const plan = await this.getPlan(planId);
    if (plan.status !== 'DISETUJUI') {
      throw new BadRequestException(
        'Kasbon hanya dapat dibuat untuk plan yang berstatus Disetujui',
      );
    }

    const [hasProduct, hasOperational] = await Promise.all([
      this.prisma.salesKanvasKasbonProduct.findFirst({
        where: { sales_kanvas_plan_id: planId, status: { not: 'BATAL' } },
        select: { kasbon_no: true },
      }),
      this.prisma.salesKanvasKasbonOperational.findFirst({
        where: { sales_kanvas_plan_id: planId, status: { not: 'BATAL' } },
        select: { kasbon_no: true },
      }),
    ]);
    if (hasProduct || hasOperational) {
      throw new BadRequestException('Plan ini sudah punya kasbon');
    }

    await this.assertProducts(dto);

    // Satu transaction: kasbon_produk + detail_kasbon_produk + kasbon_operasional.
    await this.prisma.$transaction(async (tx) => {
      await tx.salesKanvasKasbonProduct.create({
        data: {
          kasbon_no: await this.nextNo(tx, 'KBP', dto.date, 'product'),
          sales_kanvas_plan_id: planId,
          employee_id: plan.employee_id,
          date: dto.date,
          description: dto.description,
          status: 'DRAFT',
          details: { create: dto.details },
        },
      });

      await tx.salesKanvasKasbonOperational.create({
        data: {
          kasbon_no: await this.nextNo(tx, 'KBO', dto.date, 'operational'),
          sales_kanvas_plan_id: planId,
          employee_id: plan.employee_id,
          date: dto.date,
          amount: dto.operational.amount,
          purpose: dto.operational.purpose,
          status: 'DRAFT',
        },
      });
    });

    return this.findByPlan(planId);
  }

  /** Ubah kasbon: hanya saat plan Disetujui dan bon masih Draft (belum onloading). */
  async update(planId: number, dto: PlanKasbonDto) {
    const plan = await this.getPlan(planId);
    if (plan.status !== 'DISETUJUI') {
      throw new BadRequestException(
        'Kasbon hanya dapat diubah saat plan berstatus Disetujui',
      );
    }

    const [product, operational] = await Promise.all([
      this.prisma.salesKanvasKasbonProduct.findFirst({
        where: { sales_kanvas_plan_id: planId, status: { not: 'BATAL' } },
      }),
      this.prisma.salesKanvasKasbonOperational.findFirst({
        where: { sales_kanvas_plan_id: planId, status: { not: 'BATAL' } },
      }),
    ]);
    if (!product || !operational) {
      throw new BadRequestException('Kasbon belum dibuat untuk plan ini');
    }
    if (product.status !== 'DRAFT') {
      throw new BadRequestException(
        'Kasbon sudah onloading dan tidak dapat diubah',
      );
    }

    await this.assertProducts(dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.salesKanvasKasbonProductDetail.deleteMany({
        where: { sales_kanvas_kasbon_product_id: product.id },
      });
      await tx.salesKanvasKasbonProduct.update({
        where: { id: product.id },
        data: {
          date: dto.date,
          description: dto.description ?? null,
          details: { create: dto.details },
        },
      });
      await tx.salesKanvasKasbonOperational.update({
        where: { id: operational.id },
        data: {
          date: dto.date,
          amount: dto.operational.amount,
          purpose: dto.operational.purpose ?? null,
        },
      });
    });

    return this.findByPlan(planId);
  }

  async findByPlan(planId: number) {
    const [kasbonProducts, kasbonOperationals] = await Promise.all([
      this.prisma.salesKanvasKasbonProduct.findMany({
        where: { sales_kanvas_plan_id: planId },
        include: {
          details: {
            include: {
              product: { select: { id: true, code: true, name: true } },
            },
          },
        },
        orderBy: { id: 'desc' },
      }),
      this.prisma.salesKanvasKasbonOperational.findMany({
        where: { sales_kanvas_plan_id: planId },
        orderBy: { id: 'desc' },
      }),
    ]);
    return { kasbonProducts, kasbonOperationals };
  }

  private async assertProducts(dto: PlanKasbonDto) {
    const ids = dto.details.map((d) => d.product_id);
    const found = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Satu atau lebih produk tidak ditemukan');
    }
  }

  private async nextNo(
    tx: Prisma.TransactionClient,
    code: 'KBP' | 'KBO',
    date: Date,
    kind: 'product' | 'operational',
  ) {
    const prefix = docPrefix(code, date);
    const where = { kasbon_no: { startsWith: prefix } };
    const orderBy = { kasbon_no: 'desc' as const };
    const select = { kasbon_no: true };

    const last =
      kind === 'product'
        ? await tx.salesKanvasKasbonProduct.findFirst({ where, orderBy, select })
        : await tx.salesKanvasKasbonOperational.findFirst({
            where,
            orderBy,
            select,
          });

    return nextDocNo(prefix, last?.kasbon_no);
  }
}