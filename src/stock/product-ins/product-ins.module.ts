import { Module } from '@nestjs/common';

import { SourceTypesModule } from '../source-types/source-types.module';
import { ProductInsController } from './product-ins.controller';
import { ProductInsService } from './product-ins.service';

@Module({
  imports: [SourceTypesModule],
  controllers: [ProductInsController],
  providers: [ProductInsService],
})
export class ProductInsModule {}