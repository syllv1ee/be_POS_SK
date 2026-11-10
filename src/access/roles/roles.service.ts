import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-roles.dto';
import { UpdateRoleDto } from './dto/update-roles.dto';

/** Sama dengan logika PermissionsGuard: Super Admin bypass semua izin. */
function isSuperAdmin(role: { id: number; name: string }) {
  const name = role.name.toLowerCase();
  return role.id === 1 || name === 'super admin' || name === 'superadmin';
}

/** Nama yang akan dianggap Super Admin oleh guard — tidak boleh dipakai role lain. */
const SUPER_ADMIN_NAME = /^super\s?admin$/i;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { permissionRoles: true, users: true } },
      },
      orderBy: { id: 'asc' },
    });

    return roles.map(({ _count, ...role }) => ({
      ...role,
      permission_count: _count.permissionRoles,
      user_count: _count.users,
    }));
  }

  /** Role + daftar permission dari tabel permission_role. */
  async findOne(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        permissionRoles: {
          select: { permission: { select: { id: true, name: true } } },
        },
      },
    });
    if (!role) throw new NotFoundException('Role tidak ditemukan');

    return {
      id: role.id,
      name: role.name,
      permissions: role.permissionRoles
        .map((pr) => pr.permission)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Buat role + hubungkan ke permission (tabel permission_role). */
  async create(dto: CreateRoleDto) {
    await this.assertNameAllowed(dto.name);
    const permissionIds = await this.validPermissionIds(dto.permission_ids);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: { name: dto.name },
          select: { id: true },
        });
        if (permissionIds.length > 0) {
          await tx.permissionRole.createMany({
            data: permissionIds.map((permission_id) => ({
              permission_id,
              role_id: role.id,
            })),
          });
        }
        return role;
      });
      return this.findOne(created.id);
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  /** Ubah nama dan/atau ganti seluruh permission role. */
  async update(id: number, dto: UpdateRoleDto) {
    const existing = await this.getExisting(id);
    if (isSuperAdmin(existing)) {
      throw new ForbiddenException('Role Super Admin tidak dapat diubah');
    }

    if (dto.name && dto.name !== existing.name) {
      await this.assertNameAllowed(dto.name, id);
    }
    const permissionIds =
      dto.permission_ids !== undefined
        ? await this.validPermissionIds(dto.permission_ids)
        : undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (dto.name && dto.name !== existing.name) {
          await tx.role.update({ where: { id }, data: { name: dto.name } });
        }
        if (permissionIds !== undefined) {
          await tx.permissionRole.deleteMany({ where: { role_id: id } });
          if (permissionIds.length > 0) {
            await tx.permissionRole.createMany({
              data: permissionIds.map((permission_id) => ({
                permission_id,
                role_id: id,
              })),
            });
          }
          // Izin berubah -> paksa semua user role ini login ulang.
          await tx.user.updateMany({
            where: { role_id: id },
            data: { refresh_token: null },
          });
        }
      });
    } catch (e) {
      this.rethrowUnique(e);
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role tidak ditemukan');
    if (isSuperAdmin(role)) {
      throw new ForbiddenException('Role Super Admin tidak dapat dihapus');
    }
    if (role._count.users > 0) {
      throw new ConflictException(
        `Role masih dipakai ${role._count.users} user`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.permissionRole.deleteMany({ where: { role_id: id } }),
      this.prisma.role.delete({ where: { id } }),
    ]);
    return { message: 'Role berhasil dihapus' };
  }

  // ---------- helpers ----------

  private async getExisting(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!role) throw new NotFoundException('Role tidak ditemukan');
    return role;
  }

  private async assertNameAllowed(name: string, exceptId?: number) {
    if (SUPER_ADMIN_NAME.test(name)) {
      throw new BadRequestException('Nama role ini dicadangkan untuk sistem');
    }
    const taken = await this.prisma.role.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken && taken.id !== exceptId) {
      throw new ConflictException('Nama role sudah dipakai');
    }
  }

  /** Pastikan semua id permission ada. */
  private async validPermissionIds(ids?: number[]) {
    const unique = [...new Set(ids ?? [])];
    if (unique.length === 0) return [];
    const found = await this.prisma.permission.count({
      where: { id: { in: unique } },
    });
    if (found !== unique.length) {
      throw new NotFoundException('Sebagian permission tidak ditemukan');
    }
    return unique;
  }

  private rethrowUnique(e: unknown): never {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      throw new ConflictException('Nama role sudah dipakai');
    }
    throw e;
  }
}