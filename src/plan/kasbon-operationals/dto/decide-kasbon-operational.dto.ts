import { createZodDto } from 'nestjs-zod';
import { decideKasbonSchema } from '../../kasbon-products/dto/decide-kasbon-product.dto';

export class DecideKasbonOperationalDto extends createZodDto(
  decideKasbonSchema,
) {}