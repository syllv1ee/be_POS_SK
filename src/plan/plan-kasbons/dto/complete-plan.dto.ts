import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const completePlanSchema = z
  .object({
    /** Gudang tujuan sisa barang. Kosong = gudang Product Out plan ini. */
    warehouse_id: z.number().int().positive().optional(),
  })
  .strict();

export class CompletePlanDto extends createZodDto(completePlanSchema) {}