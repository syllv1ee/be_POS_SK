import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { Authenticated } from '../../common/decorators/authenticated.decorator';
import { SettlementsService } from './settlements.service';

@Controller('settlements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Authenticated()
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':planId')
  detail(@Param('planId', ParseIntPipe) planId: number) {
    return this.service.detail(planId);
  }
}