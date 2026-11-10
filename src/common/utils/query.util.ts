import { BadRequestException } from '@nestjs/common';

/** Ubah query string opsional menjadi id (angka bulat positif). */
export function parseOptionalId(
  value: string | undefined,
  field: string,
): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(`${field} harus berupa angka`);
  }
  return n;
}