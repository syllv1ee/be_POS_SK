import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
imports: [
ConfigModule,
PassportModule,
JwtModule.registerAsync({
imports: [ConfigModule],
inject: [ConfigService],
useFactory: (configService: ConfigService) => {
const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('JWT_SECRET belum diatur di file .env');
    }

    return {
      secret,
      signOptions: {
        expiresIn: '15m' as const,
      },
    };
  },
}),

],
controllers: [AuthController],
providers: [AuthService, JwtStrategy],
})
export class AuthModule {}