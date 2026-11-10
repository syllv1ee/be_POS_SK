import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PlanWorkflowService } from './plan-workflow.service';

@Controller('sales-kanvas-plans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlanWorkflowController {
  constructor(private readonly service: PlanWorkflowService) {}

  /** SPV */
  @Post(':id/approve')
  @RequirePermission('sales-kanvas-plan:approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.service.approve(id);
  }

  /** SPV: selama belum onloading */
  @Post(':id/cancel')
  @RequirePermission('sales-kanvas-plan:approve')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancel(id);
  }

  /** SPV */
  @Post(':id/complete')
  @RequirePermission('sales-kanvas-plan:approve')
  complete(@Param('id', ParseIntPipe) id: number) {
    return this.service.complete(id);
  }

  /** Gudang: batalkan loading yang sudah onloading */
  @Post(':id/cancel-loading')
  @RequirePermission('kasbon-product:cancel-loading')
  cancelLoading(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancelLoading(id);
  }
}