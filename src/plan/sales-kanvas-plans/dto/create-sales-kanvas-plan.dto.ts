import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const createSalesKanvasPlanSchema = z
  .object({
    employee_id: z.number().int().positive(),
    vehicle_id: z.number().int().positive().nullish(),
    market_area_id: z.number().int().positive().nullish(),
    departure_date: z.coerce.date(),
    // null / kosong = belum ditentukan (jangan di-coerce jadi 1970)
    return_date: z.preprocess(
      (v) => (v === null || v === '' ? null : v),
      z.coerce.date().nullish(),
    ),
    outlet_ids: z.array(z.number().int().positive()).optional(),
  })
  .strict();

export class CreateSalesKanvasPlanDto extends createZodDto(
  createSalesKanvasPlanSchema,
) {}