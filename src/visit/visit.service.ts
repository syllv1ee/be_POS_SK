
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

import {
  CreateVisitDto,
  FindAllVisitDto,
  UpdateStatusVisitDto,
  VISIT_STATUS,
} from "./visit.dto";

@Injectable()
export class VisitService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, search }: FindAllVisitDto) {
    const where: Prisma.SalesKanvasVisitWhereInput = search
      ? {
          store_name: {
            contains: search,
            mode: "insensitive",
          },
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.salesKanvasVisit.findMany({
        where,
        include: {
          marketArea: true,
        },
        orderBy: {
          id: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.salesKanvasVisit.count({
        where,
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const visit = await this.prisma.salesKanvasVisit.findUnique({
      where: { id },
      include: {
        marketArea: true,
      },
    });

    if (!visit) {
      throw new NotFoundException("Data kunjungan tidak ditemukan");
    }

    return visit;
  }

  async create(
    dto: CreateVisitDto,
    userId: number,
    ip: string,
    key?: string,
  ) {
    // Jika permintaan yang sama dikirim ulang, kembalikan data sebelumnya.
    if (key) {
      const existing = await this.prisma.salesKanvasVisit.findUnique({
        where: {
          idempotency_key: key,
        },
        include: {
          marketArea: true,
        },
      });

      if (existing) {
        return existing;
      }
    }

    // Pastikan wilayah yang dipilih benar-benar tersedia.
    const marketArea = await this.prisma.marketArea.findUnique({
      where: {
        id: dto.market_area_id,
      },
      select: {
        id: true,
      },
    });

    if (!marketArea) {
      throw new BadRequestException("Wilayah kanvas tidak ditemukan");
    }

    try {
      return await this.prisma.salesKanvasVisit.create({
        data: {
          store_name: dto.store_name,
          visit_date: new Date(`${dto.visit_date}T00:00:00.000Z`),
          market_area_id: dto.market_area_id,
          note: dto.note ?? null,
          status: VISIT_STATUS.DIRENCANAKAN,
          idempotency_key: key ?? null,
          user_id: userId,
          ip,
        },
        include: {
          marketArea: true,
        },
      });
    } catch (error) {
      // Menangani dua permintaan bersamaan dengan kunci yang sama.
      if (
        key &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.salesKanvasVisit.findUnique({
          where: {
            idempotency_key: key,
          },
          include: {
            marketArea: true,
          },
        });

        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  async updateStatus(
    id: number,
    dto: UpdateStatusVisitDto,
    userId: number,
    ip: string,
  ) {
    const visit = await this.prisma.salesKanvasVisit.findUnique({
      where: { id },
      include: {
        marketArea: true,
      },
    });

    if (!visit) {
      throw new NotFoundException("Data kunjungan tidak ditemukan");
    }

    // Permintaan ulang dengan status sama dianggap berhasil.
    if (visit.status === dto.status) {
      return visit;
    }

    // Kunjungan yang sudah dibatalkan tidak dapat diubah kembali.
    if (visit.status === VISIT_STATUS.BATAL) {
      throw new BadRequestException(
        "Kunjungan yang sudah dibatalkan tidak dapat diubah",
      );
    }

    return this.prisma.salesKanvasVisit.update({
      where: { id },
      data: {
        status: dto.status,
        user_id: userId,
        ip,
      },
      include: {
        marketArea: true,
      },
    });
  }
}
