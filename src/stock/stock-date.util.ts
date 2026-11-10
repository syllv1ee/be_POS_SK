import { BadRequestException } from '@nestjs/common';

const TZ = 'Asia/Jakarta';

/** 'YYYY-MM-DD' dari Date hasil parse tanggal (UTC). */
export const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Tanggal hari ini (YYYY-MM-DD) di zona waktu Jakarta. */
export const todayJakarta = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: TZ });

/** Tanggal dokumen tidak boleh di masa depan. */
export function assertNotFuture(date: Date, label = 'Tanggal transaksi') {
  if (dayOf(date) > todayJakarta()) {
    throw new BadRequestException(`${label} tidak boleh lebih dari hari ini`);
  }
}