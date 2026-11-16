import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { StockCoreService } from './stock-core.service';

@Controller('stocks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockCoreController {
  constructor(private readonly stock: StockCoreService) {}

  // GET /stocks/sales?plan_id=1
  @Get('sales')
  @RequirePermission('stock:read')
  sales(@Query('plan_id', new ParseIntPipe({ optional: true })) planId?: number) {
    return this.stock.salesSummary(planId);
  }

  // GET /stocks/warehouse?warehouse_id=1
  @Get('warehouse')
  @RequirePermission('stock:read')
  warehouse(@Query('warehouse_id', ParseIntPipe) warehouseId: number) {
    return this.stock.warehouseSummary(warehouseId);
  }
}