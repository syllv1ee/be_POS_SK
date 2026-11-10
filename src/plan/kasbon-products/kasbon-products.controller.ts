import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { Authenticated } from '../../common/decorators/authenticated.decorator';
import { KasbonProductsService } from './kasbon-products.service';

@Controller('plan/kasbon-products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KasbonProductsController {
  constructor(private readonly kasbonProductsService: KasbonProductsService) {}

  @Get()
  @Authenticated()
  findAll(
    @Query('sales_kanvas_plan_id', new ParseIntPipe({ optional: true }))
    planId?: number,
  ) {
    return this.kasbonProductsService.findAll(planId);
  }

  @Get(':id')
  @Authenticated()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.kasbonProductsService.findOne(id);
  }
}