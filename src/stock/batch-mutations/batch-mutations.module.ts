import { Module } from '@nestjs/common';
import { BatchMutationsController } from './batch-mutations.controller';
import { BatchMutationsService } from './batch-mutations.service';

@Module({
  controllers: [BatchMutationsController],
  providers: [BatchMutationsService],
})
export class BatchMutationsModule {}