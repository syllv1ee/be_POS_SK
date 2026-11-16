import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CompletePlanDto } from './dto/complete-plan.dto';
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

  /** SPV: body opsional { "warehouse_id": 1 } */
  @Post(':id/complete')
  @RequirePermission('sales-kanvas-plan:approve')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompletePlanDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.complete(id, dto, req.user.id);
  }

  /** Gudang: batalkan loading yang sudah onloading */
  @Post(':id/cancel-loading')
  @RequirePermission('kasbon-product:cancel-loading')
  cancelLoading(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancelLoading(id);
  }
}