import { createZodDto } from 'nestjs-zod';
import { createProductOutSchema } from './create-product-out.dto';

export class UpdateProductOutDto extends createZodDto(
  createProductOutSchema.pick({
    description: true,
  }),
) {}