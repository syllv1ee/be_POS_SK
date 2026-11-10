import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permissions.dto';
import { UpdatePermissionDto } from './dto/update-permissions.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const perms = await this.prisma.permission.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { permissionRoles: true } },
      },
      orderBy: { name: 'asc' },
    });

    return perms.map(({ _count, ...p }) => ({
      ...p,
      role_count: _count.permissionRoles,
    }));
  }

  async create(dto: CreatePermissionDto) {
    try {
      return await this.prisma.permission.create({
        data: { name: dto.name },
        select: { id: true, name: true },
      });
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  async update(id: number, dto: UpdatePermissionDto) {
    const existing = await this.getExisting(id);
    if (existing.name === dto.name) return existing;

    try {
      const updated = await this.prisma.permission.update({
        where: { id },
        data: { name: dto.name },
        select: { id: true, name: true },
      });
      // Nama izin berubah -> user yang terdampak harus login ulang.
      await this.prisma.user.updateMany({
        where: { role: { permissionRoles: { some: { permission_id: id } } } },
        data: { refresh_token: null },
      });
      return updated;
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  async remove(id: number) {
    const perm = await this.prisma.permission.findUnique({
      where: { id },
      select: { id: true, _count: { select: { permissionRoles: true } } },
    });
    if (!perm) throw new NotFoundException('Permission tidak ditemukan');
    if (perm._count.permissionRoles > 0) {
      throw new ConflictException(
        `Permission masih dipakai ${perm._count.permissionRoles} role. Lepaskan dari role terlebih dulu.`,
      );
    }

    await this.prisma.permission.delete({ where: { id } });
    return { message: 'Permission berhasil dihapus' };
  }

  // ---------- helpers ----------

  private async getExisting(id: number) {
    const perm = await this.prisma.permission.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!perm) throw new NotFoundException('Permission tidak ditemukan');
    return perm;
  }

  private rethrowUnique(e: unknown): never {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      throw new ConflictException('Nama permission sudah dipakai');
    }
    throw e;
  }
}