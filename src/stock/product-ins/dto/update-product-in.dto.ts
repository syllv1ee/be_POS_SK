import { createZodDto } from 'nestjs-zod';
import { createProductInSchema } from './create-product-in.dto';

export class UpdateProductInDto extends createZodDto(
  createProductInSchema.pick({
    description: true,
  }),
) {}