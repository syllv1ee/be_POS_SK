import { Module } from '@nestjs/common';
import { PlanKasbonsController } from './plan-kasbons.controller';
import { PlanKasbonsService } from './plan-kasbons.service';
import { PlanWorkflowController } from './plan-workflow.controller';
import { PlanWorkflowService } from './plan-workflow.service';

@Module({
  controllers: [PlanKasbonsController, PlanWorkflowController],
  providers: [PlanKasbonsService, PlanWorkflowService],
})
export class PlanKasbonsModule {}