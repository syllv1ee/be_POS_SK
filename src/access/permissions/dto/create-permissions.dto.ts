import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

/** Format: resource:action, contoh "product:write" atau "product:*". */
export const PERMISSION_NAME = /^[a-z0-9-]+(:[a-z0-9*-]+){1,2}$/;

export class CreatePermissionDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(100)
  @Matches(PERMISSION_NAME, {
    message: 'Format permission: resource:action, contoh product:write',
  })
  name!: string;
}