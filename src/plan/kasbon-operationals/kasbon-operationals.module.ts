import { Module } from '@nestjs/common';
import { KasbonOperationalsController } from './kasbon-operationals.controller';
import { KasbonOperationalsService } from './kasbon-operationals.service';

@Module({
  controllers: [KasbonOperationalsController],
  providers: [KasbonOperationalsService],
})
export class KasbonOperationalsModule {}