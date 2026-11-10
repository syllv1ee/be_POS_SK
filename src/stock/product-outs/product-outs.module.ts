import { Module } from '@nestjs/common';
import { SourceTypesModule } from '../source-types/source-types.module';
import { ProductOutsService } from './product-outs.service';
import { ProductOutsController } from './product-outs.controller';

@Module({
  imports: [SourceTypesModule],
  controllers: [ProductOutsController],
  providers: [ProductOutsService],
})
export class ProductOutsModule {}