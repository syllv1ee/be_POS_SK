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
import { ProductOutsService } from './product-outs.service';
import { CreateProductOutDto } from './dto/create-product-out.dto';
import { UpdateProductOutDto } from './dto/update-product-out.dto';

@Controller('product-outs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductOutsController {
  constructor(private readonly productOutsService: ProductOutsService) {}

  @Post()
  @RequirePermission('product-out:write')
  create(
    @Body() dto: CreateProductOutDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productOutsService.create(dto, user?.id);
  }

  /** GET /product-outs?source_type_id=1&warehouse_id=2 (semua filter opsional) */
  @Get()
  @Authenticated()
  findAll(
    @Query('source_type_id') sourceTypeId?: string,
    @Query('warehouse_id') warehouseId?: string,
  ) {
    return this.productOutsService.findAll({
      sourceTypeId: parseOptionalId(sourceTypeId, 'source_type_id'),
      warehouseId: parseOptionalId(warehouseId, 'warehouse_id'),
    });
  }

  @Get(':id')
  @Authenticated()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productOutsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('product-out:write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductOutDto,
  ) {
    return this.productOutsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('product-out:write')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productOutsService.remove(id);
  }
}