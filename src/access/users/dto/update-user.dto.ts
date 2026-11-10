import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Karyawan tidak bisa diganti setelah user dibuat. */
export class UpdateUserDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  role_id?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}