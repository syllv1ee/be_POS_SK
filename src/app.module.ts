import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RolesModule } from './access/roles/roles.module';
import { UsersModule } from './access/users/users.module';
import { PermissionsModule } from './access/permissions/permissions.module';
import { MarketAreasModule } from './master/market-areas/market-areas.module';
import { EmployeesModule } from './master/employees/employees.module';
import { OutletsModule } from './master/outlets/outlets.module';
import { PriceTypesModule } from './master/price-types/price-types.module';
import { ProductsModule } from './master/products/products.module';
import { ProductPricesModule } from './master/product-prices/product-prices.module';
import { VehiclesModule } from './master/vehicles/vehicles.module';
import { WarehousesModule } from './master/warehouses/warehouses.module';
import { SalesKanvasPlansModule } from './plan/sales-kanvas-plans/sales-kanvas-plans.module';
import { KasbonProductsModule } from './plan/kasbon-products/kasbon-products.module';
import { KasbonOperationalsModule } from './plan/kasbon-operationals/kasbon-operationals.module';
import { PlanKasbonsModule } from './plan/plan-kasbons/plan-kasbons.module';
import { SettlementsModule } from './plan/settlements/settlements.module';
import { InvoicesModule } from './sales/invoices/invoices.module';
import { InvoicePaymentsModule } from './sales/invoice-payments/invoice-payments.module';
import { InvoiceReturnsModule } from './sales/invoice-returns/invoice-returns.module';
import { ReceivableCardsModule } from './sales/receivable-cards/receivable-cards.module';
import { BatchMutationsModule } from './stock/batch-mutations/batch-mutations.module';
import { ProductOutsModule } from './stock/product-outs/product-outs.module';
import { ProductInsModule } from './stock/product-ins/product-ins.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    RolesModule,
    UsersModule,
    PermissionsModule,
    MarketAreasModule,
    EmployeesModule,
    OutletsModule,
    PriceTypesModule,
    ProductsModule,
    ProductPricesModule,
    VehiclesModule,
    WarehousesModule,
    SalesKanvasPlansModule,
    KasbonProductsModule,
    KasbonOperationalsModule,
    PlanKasbonsModule,
    SettlementsModule,
    InvoicesModule,
    InvoicePaymentsModule,
    InvoiceReturnsModule,
    ReceivableCardsModule,
    BatchMutationsModule,
    ProductOutsModule,
    ProductInsModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: ResponseInterceptor }],
})
export class AppModule {}