import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { Authenticated } from '../../common/decorators/authenticated.decorator';
import { parseOptionalId } from '../../common/utils/query.util';
import { BatchMutationsService } from './batch-mutations.service';

function parseDate(v: string | undefined, name: string) {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${name} tidak valid (YYYY-MM-DD)`);
  }
  return d;
}

@Controller('batch-mutations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BatchMutationsController {
  constructor(private readonly service: BatchMutationsService) {}

  /** GET /batch-mutations/stock?warehouse_id=1&product_id=2 (saldo per batch, FEFO) */
  @Get('stock')
  @Authenticated()
  stock(
    @Query('warehouse_id') warehouseId?: string,
    @Query('product_id') productId?: string,
  ) {
    return this.service.stock({
      warehouseId: parseOptionalId(warehouseId, 'warehouse_id'),
      productId: parseOptionalId(productId, 'product_id'),
    });
  }

  /** GET /batch-mutations?warehouse_id=&product_id=&direction=IN|OUT&batch=&date_from=&date_to= */
  @Get()
  @Authenticated()
  findAll(
    @Query('warehouse_id') warehouseId?: string,
    @Query('product_id') productId?: string,
    @Query('direction') direction?: string,
    @Query('batch') batch?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    if (direction && direction !== 'IN' && direction !== 'OUT') {
      throw new BadRequestException('direction harus IN atau OUT');
    }
    return this.service.findAll({
      warehouseId: parseOptionalId(warehouseId, 'warehouse_id'),
      productId: parseOptionalId(productId, 'product_id'),
      direction: direction as 'IN' | 'OUT' | undefined,
      batch: batch?.trim() || undefined,
      dateFrom: parseDate(dateFrom, 'date_from'),
      dateTo: parseDate(dateTo, 'date_to'),
    });
  }
}