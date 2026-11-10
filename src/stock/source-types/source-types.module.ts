import { Module } from '@nestjs/common';
import { SourceTypesController } from './source-types.controller';
import { SourceTypesService } from './source-types.service';

@Module({
  controllers: [SourceTypesController],
  providers: [SourceTypesService],
  exports: [SourceTypesService],
})
export class SourceTypesModule {}