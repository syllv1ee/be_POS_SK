import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StockDirection } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SourceTypesService } from './source-types.service';

@Controller('source-types')
@UseGuards(JwtAuthGuard)
export class SourceTypesController {
  constructor(private readonly sourceTypesService: SourceTypesService) {}

  /** GET /source-types?direction=IN|OUT (untuk dropdown di form) */
  @Get()
  findAll(@Query('direction') direction?: string) {
    if (direction && direction !== 'IN' && direction !== 'OUT') {
      throw new BadRequestException('direction harus IN atau OUT');
    }
    return this.sourceTypesService.findAll(
      direction as StockDirection | undefined,
    );
  }
}