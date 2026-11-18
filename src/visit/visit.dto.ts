
import { z } from "zod";
import { createZodDto } from "nestjs-zod";

export const VISIT_STATUS = {
  DIRENCANAKAN: "DIRENCANAKAN",
  SELESAI: "SELESAI",
  BATAL: "BATAL",
} as const;

const visitDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Tanggal kunjungan tidak valid");

const createVisitSchema = z
  .object({
    store_name: z.string().trim().min(1).max(150),
    visit_date: visitDateSchema,
    market_area_id: z.number().int().positive(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export class CreateVisitDto extends createZodDto(createVisitSchema) {}

export class UpdateStatusVisitDto extends createZodDto(
  z
    .object({
      status: z.enum([
        VISIT_STATUS.DIRENCANAKAN,
        VISIT_STATUS.SELESAI,
        VISIT_STATUS.BATAL,
      ]),
    })
    .strict(),
) {}

export class FindAllVisitDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    search: z.string().trim().optional(),
  }),
) {}
