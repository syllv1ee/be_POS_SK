import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const detailSchema = z
  .object({
    product_id: z.number().int().positive(),
    qty: z.number().int().positive(),
    price: z.number().min(0).optional(),
  })
  .strict();

/** Satu form: bon barang (header + detail) dan kasbon operasional. Keduanya wajib. */
export const planKasbonSchema = z
  .object({
    date: z.coerce.date(),
    description: z.string().optional(),
    details: z.array(detailSchema).min(1),
    operational: z
      .object({
        amount: z.number().positive(),
        purpose: z.string().optional(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (d) =>
      new Set(d.details.map((x) => x.product_id)).size === d.details.length,
    { message: 'Produk pada bon barang tidak boleh duplikat', path: ['details'] },
  );

export class PlanKasbonDto extends createZodDto(planKasbonSchema) {}