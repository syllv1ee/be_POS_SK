import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const decideKasbonSchema = z
  .object({
    status: z.enum(['ACC', 'REVISI']),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((d) => d.status !== 'REVISI' || !!d.note, {
    message: 'Catatan wajib diisi saat meminta revisi',
    path: ['note'],
  });

export class DecideKasbonProductDto extends createZodDto(decideKasbonSchema) {}