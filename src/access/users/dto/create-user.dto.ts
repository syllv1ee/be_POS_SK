import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  /** Karyawan dari master (hanya yang belum punya user). */
  @Type(() => Number)
  @IsInt()
  employee_id!: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  /** Permission otomatis mengikuti role (tabel permission_role). */
  @Type(() => Number)
  @IsInt()
  role_id!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}