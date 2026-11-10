import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PlanKasbonDto } from './dto/plan-kasbon.dto';
import { PlanKasbonsService } from './plan-kasbons.service';

@Controller('sales-kanvas-plans/:planId/kasbon')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlanKasbonsController {
  constructor(private readonly service: PlanKasbonsService) {}

  /** SPV: buat bon barang + detail + kasbon operasional dalam satu transaction. */
  @Post()
  @RequirePermission('kasbon-product:write')
  create(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: PlanKasbonDto,
  ) {
    return this.service.create(planId, dto);
  }

  @Put()
  @RequirePermission('kasbon-product:write')
  update(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: PlanKasbonDto,
  ) {
    return this.service.update(planId, dto);
  }
}