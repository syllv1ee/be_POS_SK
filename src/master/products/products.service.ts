import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type Action = 'create' | 'update' | 'delete';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    try {
      return await this.prisma.product.create({ data: dto });
    } catch (e) {
      this.handleError(e, 'create');
    }
  }

  findAll() {
    return this.prisma.product.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: number) {
    const data = await this.prisma.product.findUnique({
      where: { id },
      include: { prices: { include: { priceType: true } } },
    });
    if (!data) throw new NotFoundException(`Produk dengan ID ${id} tidak ditemukan`);
    return data;
  }

  async update(id: number, dto: UpdateProductDto) {
    try {
      return await this.prisma.product.update({ where: { id }, data: dto });
    } catch (e) {
      this.handleError(e, 'update', id);
    }
  }

  // Ditolak (400) bila produk masih dipakai data harga atau transaksi.
  async remove(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!product) {
      throw new NotFoundException(`Produk dengan ID ${id} tidak ditemukan`);
    }

    try {
      return await this.prisma.product.delete({ where: { id } });
    } catch (e) {
      this.handleError(e, 'delete', id, product.name);
    }
  }

  // Mendeteksi error foreign key dari berbagai bentuk error Prisma / driver.
  private isForeignKeyError(e: unknown): boolean {
    const err = e as { code?: string; message?: string };
    const code = String(err?.code ?? '');
    const message = String(err?.message ?? '').toLowerCase();

    return (
      code === 'P2003' ||
      code === 'P2014' ||
      code === '23001' || // restrict_violation
      code === '23503' || // foreign_key_violation
      message.includes('foreign key') ||
      message.includes('23001') ||
      message.includes('23503')
    );
  }

  private handleError(
    e: unknown,
    action: Action,
    id?: number,
    name?: string,
  ): never {
    // Sudah berupa exception NestJS, teruskan apa adanya.
    if (e instanceof BadRequestException || e instanceof NotFoundException) {
      throw e;
    }

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new BadRequestException(
          'Kode produk sudah digunakan. Gunakan kode lain.',
        );
      }
      if (e.code === 'P2025') {
        throw new NotFoundException(
          `Produk dengan ID ${id ?? ''} tidak ditemukan`.trim(),
        );
      }
    }

    if (this.isForeignKeyError(e)) {
      if (action === 'delete') {
        throw new BadRequestException(
          `Produk${name ? ` "${name}"` : ''} tidak bisa dihapus karena masih memiliki data harga atau transaksi. Nonaktifkan produk ini sebagai gantinya.`,
        );
      }
      throw new BadRequestException(
        'Data referensi tidak valid. Periksa kembali isian yang terhubung ke data lain.',
      );
    }

    throw e;
  }
}