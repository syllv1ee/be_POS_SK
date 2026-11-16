import { Global, Module } from '@nestjs/common';
import { StockCoreController } from './stock-core.controller';
import { StockCoreService } from './stock-core.service';

/**
 * Global: StockCoreService dipakai oleh product-outs, plan-kasbons,
 * dan invoices tanpa perlu mengimpor module ini satu per satu.
 */
@Global()
@Module({
  controllers: [StockCoreController],
  providers: [StockCoreService],
  exports: [StockCoreService],
})
export class StockCoreModule {}