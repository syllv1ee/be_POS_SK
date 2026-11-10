import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockDirection } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SourceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Daftar tipe sumber aktif; filter arah IN (penerimaan) / OUT (pengeluaran). */
  findAll(direction?: StockDirection) {
    return this.prisma.sourceType.findMany({
      where: { is_active: true, ...(direction && { direction }) },
      select: { id: true, code: true, name: true, direction: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Dipakai ProductIn / ProductOut: pastikan tipe sumber ada, aktif,
   * dan arahnya sesuai transaksi.
   */
  async assertUsable(id: number, direction: StockDirection) {
    const src = await this.prisma.sourceType.findUnique({
      where: { id },
      select: { id: true, code: true, direction: true, is_active: true },
    });
    if (!src || !src.is_active) {
      throw new NotFoundException('Tipe sumber tidak ditemukan');
    }
    if (src.direction !== direction) {
      throw new BadRequestException(
        `Tipe sumber "${src.code}" bukan untuk ${
          direction === 'IN' ? 'penerimaan' : 'pengeluaran'
        }`,
      );
    }
    return src;
  }
}