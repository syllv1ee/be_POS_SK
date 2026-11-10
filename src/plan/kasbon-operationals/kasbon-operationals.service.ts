import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const include = {
  employee: { select: { id: true, name: true } },
};

@Injectable()
export class KasbonOperationalsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(planId?: number) {
    return this.prisma.salesKanvasKasbonOperational.findMany({
      where: planId ? { sales_kanvas_plan_id: planId } : {},
      include,
      orderBy: { id: 'desc' },
    });
  }

  findOne(id: number) {
    return this.prisma.salesKanvasKasbonOperational.findUniqueOrThrow({
      where: { id },
      include,
    });
  }
}