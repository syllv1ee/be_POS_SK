import { createZodDto } from 'nestjs-zod';
import { createKasbonOperationalSchema } from './create-kasbon-operational.dto';

export class UpdateKasbonOperationalDto extends createZodDto(
  createKasbonOperationalSchema.omit({ sales_kanvas_plan_id: true }).partial(),
) {}