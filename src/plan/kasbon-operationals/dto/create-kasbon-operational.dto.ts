import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const createKasbonOperationalSchema = z
  .object({
    sales_kanvas_plan_id: z.number().int().positive(),
    employee_id: z.number().int().positive(),
    date: z.coerce.date(),
    amount: z.number().positive(),
    purpose: z.string().optional(),
  })
  .strict();

export class CreateKasbonOperationalDto extends createZodDto(
  createKasbonOperationalSchema,
) {}