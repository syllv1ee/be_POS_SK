
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalesKanvasPlanDto } from './dto/create-sales-kanvas-plan.dto';
import { UpdateSalesKanvasPlanDto } from './dto/update-sales-kanvas-plan.dto';

const PLAN_INCLUDE = {
  employee: true,
  vehicle: true,
  marketArea: true,
  outlets: { include: { outlet: true } },
} as const;

@Injectable()
export class SalesKanvasPlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validasi relasi karyawan, kendaraan, area, dan outlet. */
  private async validateRefs(dto: {
    employee_id?: number;
    vehicle_id?: number | null;
    market_area_id?: number | null;
    outlet_ids?: number[];
  }) {
    if (dto.employee_id !== undefined) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: dto.employee_id },
      });

      if (!employee) {
        throw new NotFoundException(
          `Karyawan ${dto.employee_id} tidak ditemukan`,
        );
      }
    }

    if (dto.vehicle_id != null) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: dto.vehicle_id },
      });

      if (!vehicle) {
        throw new NotFoundException(
          `Kendaraan ${dto.vehicle_id} tidak ditemukan`,
        );
      }
    }

    if (dto.market_area_id != null) {
      const marketArea = await this.prisma.marketArea.findUnique({
        where: { id: dto.market_area_id },
      });

      if (!marketArea) {
        throw new NotFoundException(
          `Wilayah kanvas ${dto.market_area_id} tidak ditemukan`,
        );
      }
    }

    if (dto.outlet_ids !== undefined) {
      if (new Set(dto.outlet_ids).size !== dto.outlet_ids.length) {
        throw new BadRequestException(
          'outlet_ids tidak boleh berisi ID duplikat',
        );
      }

      if (dto.outlet_ids.length > 0) {
        const outlets = await this.prisma.outlet.findMany({
          where: { id: { in: dto.outlet_ids } },
          select: { id: true },
        });

        if (outlets.length !== dto.outlet_ids.length) {
          throw new BadRequestException(
            'Satu atau lebih ID outlet tidak ditemukan',
          );
        }
      }
    }
  }

  /** Tanggal kembali tidak boleh sebelum tanggal keberangkatan. */
  private assertDates(departure?: Date, ret?: Date | null) {
    if (departure && ret && ret < departure) {
      throw new BadRequestException(
        'Tanggal kembali tidak boleh sebelum tanggal berangkat',
      );
    }
  }

  /**
   * Satu sales hanya boleh mempunyai satu plan pada satu tanggal keberangkatan.
   *
   * Semua status tetap dihitung, termasuk BATAL dan REVISI.
   * Pengecualian hanya plan yang sedang diedit.
   */
  private async assertEmployeeDepartureDateUnique(args: {
    employee_id: number;
    departure: Date;
    excludeId?: number;
  }) {
    const existingPlan = await this.prisma.salesKanvasPlan.findFirst({
      where: {
        employee_id: args.employee_id,
        departure_date: args.departure,
        ...(args.excludeId !== undefined
          ? { id: { not: args.excludeId } }
          : {}),
      },
      select: {
        id: true,
        plan_no: true,
        status: true,
      },
    });

    if (existingPlan) {
      throw new BadRequestException(
        `Sales ini sudah memiliki plan ${existingPlan.plan_no} dengan tanggal keberangkatan yang sama. Status plan sebelumnya: ${existingPlan.status}. Silakan pilih tanggal keberangkatan lain.`,
      );
    }
  }

  /**
   * Validasi jadwal kendaraan.
   *
   * Plan BATAL dan REVISI tidak dihitung untuk penggunaan kendaraan,
   * mengikuti perilaku validasi kendaraan sebelumnya.
   */
  private async assertVehicleAvailable(args: {
    vehicle_id?: number | null;
    departure: Date;
    ret?: Date | null;
    excludeId?: number;
  }) {
    if (args.vehicle_id == null) {
      return;
    }

    const start = args.departure;
    const end = args.ret ?? args.departure;

    const vehicleClash = await this.prisma.salesKanvasPlan.findFirst({
      where: {
        vehicle_id: args.vehicle_id,
        status: {
          notIn: ['BATAL', 'REVISI'],
        },
        ...(args.excludeId !== undefined
          ? { id: { not: args.excludeId } }
          : {}),
        departure_date: { lte: end },
        OR: [
          { return_date: { gte: start } },
          {
            return_date: null,
            departure_date: { gte: start },
          },
        ],
      },
      select: {
        plan_no: true,
      },
    });

    if (vehicleClash) {
      throw new BadRequestException(
        `Kendaraan ini sudah digunakan oleh plan lain pada periode tersebut (${vehicleClash.plan_no})`,
      );
    }
  }

  /**
   * Menangani constraint unik database.
   * Ini menjadi perlindungan tambahan jika dua request masuk bersamaan.
   */
  private handleUniqueConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException(
        'Sales tersebut sudah memiliki plan pada tanggal keberangkatan ini. Silakan pilih tanggal lain.',
      );
    }

    throw error;
  }

  /** Membuat Sales Kanvas Plan dengan status awal DRAFT. */
  async create(dto: CreateSalesKanvasPlanDto) {
    await this.validateRefs(dto);

    this.assertDates(dto.departure_date, dto.return_date);

    await this.assertEmployeeDepartureDateUnique({
      employee_id: dto.employee_id,
      departure: dto.departure_date,
    });

    await this.assertVehicleAvailable({
      vehicle_id: dto.vehicle_id,
      departure: dto.departure_date,
      ret: dto.return_date,
    });

    const outletIds = dto.outlet_ids ?? [];
    const planNo = `RKN-${Date.now()}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.salesKanvasPlan.create({
          data: {
            plan_no: planNo,
            employee_id: dto.employee_id,
            vehicle_id: dto.vehicle_id ?? null,
            market_area_id: dto.market_area_id ?? null,
            departure_date: dto.departure_date,
            return_date: dto.return_date ?? null,
            status: 'DRAFT',
          },
        });

        if (outletIds.length > 0) {
          await tx.salesKanvasPlanOutlet.createMany({
            data: outletIds.map((outletId: number) => ({
              sales_kanvas_plan_id: plan.id,
              outlet_id: outletId,
            })),
          });
        }

        return tx.salesKanvasPlan.findUnique({
          where: { id: plan.id },
          include: PLAN_INCLUDE,
        });
      });
    } catch (error) {
      this.handleUniqueConstraint(error);
    }
  }

  /** Mengambil semua plan. */
  async findAll() {
    return this.prisma.salesKanvasPlan.findMany({
      include: PLAN_INCLUDE,
      orderBy: { id: 'desc' },
    });
  }

  /** Mengambil detail satu plan. */
  async findOne(id: number) {
    const plan = await this.prisma.salesKanvasPlan.findUnique({
      where: { id },
      include: PLAN_INCLUDE,
    });

    if (!plan) {
      throw new NotFoundException(
        `Sales Kanvas Plan dengan ID ${id} tidak ditemukan`,
      );
    }

    return plan;
  }

  /** Mengubah data plan. Hanya plan berstatus DRAFT yang bisa diedit. */
  async update(id: number, dto: UpdateSalesKanvasPlanDto) {
    const current = await this.findOne(id);

    if (dto.status !== undefined) {
      throw new BadRequestException(
        'Status plan diubah lewat endpoint approve, cancel, complete atau cancel-loading',
      );
    }

    if (current.status !== 'DRAFT') {
      throw new BadRequestException(
        'Plan hanya dapat diubah saat berstatus Draft',
      );
    }

    await this.validateRefs(dto);

    const employeeId = dto.employee_id ?? current.employee_id;
    const departureDate = dto.departure_date ?? current.departure_date;
    const returnDate =
      dto.return_date !== undefined
        ? dto.return_date
        : current.return_date;
    const vehicleId =
      dto.vehicle_id !== undefined
        ? dto.vehicle_id
        : current.vehicle_id;

    this.assertDates(departureDate, returnDate);

    await this.assertEmployeeDepartureDateUnique({
      employee_id: employeeId,
      departure: departureDate,
      excludeId: id,
    });

    await this.assertVehicleAvailable({
      vehicle_id: vehicleId,
      departure: departureDate,
      ret: returnDate,
      excludeId: id,
    });

    const updateData: {
      employee_id?: number;
      vehicle_id?: number | null;
      market_area_id?: number | null;
      departure_date?: Date;
      return_date?: Date | null;
    } = {};

    if (dto.employee_id !== undefined) {
      updateData.employee_id = dto.employee_id;
    }

    if (dto.vehicle_id !== undefined) {
      updateData.vehicle_id = dto.vehicle_id;
    }

    if (dto.market_area_id !== undefined) {
      updateData.market_area_id = dto.market_area_id;
    }

    if (dto.departure_date !== undefined) {
      updateData.departure_date = dto.departure_date;
    }

    if (dto.return_date !== undefined) {
      updateData.return_date = dto.return_date;
    }

    const outletIds = dto.outlet_ids;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.salesKanvasPlan.update({
          where: { id },
          data: updateData,
        });

        if (outletIds !== undefined) {
          await tx.salesKanvasPlanOutlet.deleteMany({
            where: { sales_kanvas_plan_id: id },
          });

          if (outletIds.length > 0) {
            await tx.salesKanvasPlanOutlet.createMany({
              data: outletIds.map((outletId: number) => ({
                sales_kanvas_plan_id: id,
                outlet_id: outletId,
              })),
            });
          }
        }

        return tx.salesKanvasPlan.findUnique({
          where: { id },
          include: PLAN_INCLUDE,
        });
      });
    } catch (error) {
      this.handleUniqueConstraint(error);
    }
  }
}
