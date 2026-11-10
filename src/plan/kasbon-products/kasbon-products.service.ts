import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const include = {
  details: {
    include: { product: { select: { id: true, code: true, name: true } } },
  },
  employee: { select: { id: true, name: true } },
};

@Injectable()
export class KasbonProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(planId?: number) {
    return this.prisma.salesKanvasKasbonProduct.findMany({
      where: { sales_kanvas_plan_id: planId },
      include,
      orderBy: { id: 'desc' },
    });
  }

  findOne(id: number) {
    return this.prisma.salesKanvasKasbonProduct.findUniqueOrThrow({
      where: { id },
      include,
    });
  }
}