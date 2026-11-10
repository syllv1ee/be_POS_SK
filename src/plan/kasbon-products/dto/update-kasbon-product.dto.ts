import { createZodDto } from 'nestjs-zod';
import { createKasbonProductSchema } from './create-kasbon-product.dto';

// Bila `details` dikirim, seluruh detail lama diganti. Plan tidak boleh dipindah.
export class UpdateKasbonProductDto extends createZodDto(
  createKasbonProductSchema.omit({ sales_kanvas_plan_id: true }).partial(),
) {}