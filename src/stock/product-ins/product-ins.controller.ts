import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Authenticated } from '../../common/decorators/authenticated.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { parseOptionalId } from '../../common/utils/query.util';

import { ProductInsService } from './product-ins.service';
import { CreateProductInDto } from './dto/create-product-in.dto';
import { UpdateProductInDto } from './dto/update-product-in.dto';

@Controller('product-ins')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductInsController {
  constructor(private readonly productInsService: ProductInsService) {}

  @Post()
  @RequirePermission('product-in:write')
  create(
    @Body() dto: CreateProductInDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productInsService.create(dto, user?.id);
  }

  /** GET /product-ins?source_type_id=1&warehouse_id=2 (semua filter opsional) */
  @Get()
  @Authenticated()
  findAll(
    @Query('source_type_id') sourceTypeId?: string,
    @Query('warehouse_id') warehouseId?: string,
  ) {
    return this.productInsService.findAll({
      sourceTypeId: parseOptionalId(sourceTypeId, 'source_type_id'),
      warehouseId: parseOptionalId(warehouseId, 'warehouse_id'),
    });
  }

  @Get(':id')
  @Authenticated()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productInsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('product-in:write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductInDto,
  ) {
    return this.productInsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('product-in:write')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productInsService.remove(id);
  }
}