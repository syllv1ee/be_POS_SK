import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { createSalesKanvasPlanSchema } from './create-sales-kanvas-plan.dto';

export const updateSalesKanvasPlanSchema = createSalesKanvasPlanSchema
  .partial()
  .extend({
    // Perpindahan status; aturan alurnya dicek di service
    status: z.enum(['DISETUJUI', 'LOADING', 'KOMPLIT', 'BATAL']).optional(),
  });

export class UpdateSalesKanvasPlanDto extends createZodDto(
  updateSalesKanvasPlanSchema,
) {}