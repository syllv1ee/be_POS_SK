import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** Batch tidak dikirim: dipilih otomatis oleh sistem (FEFO). */
const detailSchema = z
  .object({
    product_id: z.number().int().positive(),
    qty: z.number().int().positive(),
  })
  .strict();

export const createProductOutSchema = z
  .object({
    date: z.coerce.date(),
    warehouse_id: z.number().int().positive(),
    /** GET /source-types?direction=OUT: Toko, Sales Counter, Sales Kanvas */
    source_type_id: z.number().int().positive(),
    sales_kanvas_plan_id: z.number().int().positive().optional(),
    /** Wajib untuk Sales Kanvas: bon barang berstatus Draft milik plan */
    sales_kanvas_kasbon_product_id: z.number().int().positive().optional(),
    description: z.string().optional(),
    details: z.array(detailSchema).min(1),
  })
  .strict();

export class CreateProductOutDto extends createZodDto(createProductOutSchema) {}