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
import { KasbonOperationalsService } from './kasbon-operationals.service';

@Controller('plan/kasbon-operationals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KasbonOperationalsController {
  constructor(
    private readonly kasbonOperationalsService: KasbonOperationalsService,
  ) {}

  @Get()
  @Authenticated()
  findAll(
    @Query('sales_kanvas_plan_id', new ParseIntPipe({ optional: true }))
    planId?: number,
  ) {
    return this.kasbonOperationalsService.findAll(planId);
  }

  @Get(':id')
  @Authenticated()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.kasbonOperationalsService.findOne(id);
  }
}