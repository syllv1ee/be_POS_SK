import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

import { SalesKanvasPlansService } from './sales-kanvas-plans.service';
import { CreateSalesKanvasPlanDto } from './dto/create-sales-kanvas-plan.dto';
import { UpdateSalesKanvasPlanDto } from './dto/update-sales-kanvas-plan.dto';

@Controller('sales-kanvas-plans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesKanvasPlansController {
  constructor(
    private readonly salesKanvasPlansService: SalesKanvasPlansService,
  ) {}

  @Post()
  @RequirePermission('sales-kanvas-plan:write')
  create(@Body() dto: CreateSalesKanvasPlanDto) {
    return this.salesKanvasPlansService.create(dto);
  }

  @Get()
  @RequirePermission('sales-kanvas-plan:read')
  findAll() {
    return this.salesKanvasPlansService.findAll();
  }

  @Get(':id')
  @RequirePermission('sales-kanvas-plan:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.salesKanvasPlansService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('sales-kanvas-plan:write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesKanvasPlanDto,
  ) {
    return this.salesKanvasPlansService.update(id, dto);
  }
}