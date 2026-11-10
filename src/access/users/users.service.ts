import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { QueryUserDto } from './dto/query-user.dto';

// Tidak pernah memilih password & refresh_token.
const USER_LIST_SELECT = {
  id: true,
  employee_id: true,
  username: true,
  name: true,
  is_active: true,
  last_login_at: true,
  created_at: true,
  updated_at: true,
  role: { select: { id: true, name: true } },
  employee: {
    select: { id: true, code: true, name: true, position: true, phone: true },
  },
} satisfies Prisma.UserSelect;

const USER_DETAIL_SELECT = {
  ...USER_LIST_SELECT,
  role: {
    select: {
      id: true,
      name: true,
      permissionRoles: {
        select: { permission: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.UserSelect;

type RoleLite = { id: number; name: string };

/** Query string bisa berupa string, boolean, atau undefined (tergantung ValidationPipe). */
function toBool(v: unknown): boolean | undefined {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Daftar user (paginasi, search, filter role & status). */
   /** Daftar user (paginasi, search, filter role & status). */
  async findAll(query: QueryUserDto) {
    // Dipaksa ke angka: aman walau ValidationPipe tidak transform.
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const search = query.search?.trim();
    const roleId =
      query.role_id !== undefined && query.role_id !== null
        ? Number(query.role_id)
        : undefined;
    const isActive = toBool(query.is_active);

    const where: Prisma.UserWhereInput = {
      ...(roleId !== undefined &&
        Number.isInteger(roleId) && { role_id: roleId }),
      ...(isActive !== undefined && { is_active: isActive }),
      ...(search && {
        OR: [
          { username: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { employee: { code: { contains: search, mode: 'insensitive' } } },
          { employee: { name: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_LIST_SELECT,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Detail user + daftar permission (hasil turunan dari role). */
  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_DETAIL_SELECT,
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const { role, ...rest } = user;
    return {
      ...rest,
      role: { id: role.id, name: role.name },
      permissions: role.permissionRoles.map((pr) => pr.permission.name),
    };
  }

  /** Karyawan aktif yang belum punya user (untuk dropdown form tambah). */
  async availableEmployees(search?: string) {
    return this.prisma.employee.findMany({
      where: {
        is_active: true,
        user: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      select: { id: true, code: true, name: true, position: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Buat user dari karyawan yang sudah ada di master. */
  async create(dto: CreateUserDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employee_id },
      select: {
        id: true,
        name: true,
        is_active: true,
        user: { select: { id: true } },
      },
    });
    if (!employee) throw new NotFoundException('Karyawan tidak ditemukan');
    if (employee.is_active === false) {
      throw new BadRequestException('Karyawan sudah tidak aktif');
    }
    if (employee.user) {
      throw new ConflictException('Karyawan ini sudah memiliki user');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.role_id },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('Role tidak ditemukan');

    await this.assertUsernameFree(dto.username);

    try {
      const created = await this.prisma.user.create({
        data: {
          employee_id: employee.id,
          role_id: role.id,
          username: dto.username,
          password: await bcrypt.hash(dto.password, 10),
          name: employee.name, // nama diambil dari master karyawan
          is_active: dto.is_active ?? true,
        },
        select: { id: true },
      });
      return this.findOne(created.id);
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  /** Ubah username / role / status. actorId = user yang sedang login. */
  async update(id: number, dto: UpdateUserDto, actorId: number) {
    const existing = await this.getExisting(id);

    const nextActive = dto.is_active ?? existing.is_active;
    const nextRoleId = dto.role_id ?? existing.role_id;
    const roleChanged = nextRoleId !== existing.role_id;
    const deactivating = existing.is_active && !nextActive;

    // Tidak boleh menonaktifkan / mengganti role akun sendiri.
    if (id === actorId && (deactivating || roleChanged)) {
      throw new ForbiddenException(
        'Tidak dapat menonaktifkan atau mengganti role akun sendiri',
      );
    }

    let newRole: RoleLite = existing.role;
    if (roleChanged) {
      const found = await this.prisma.role.findUnique({
        where: { id: nextRoleId },
        select: { id: true, name: true },
      });
      if (!found) throw new NotFoundException('Role tidak ditemukan');
      newRole = found;
    }

    if (dto.username && dto.username !== existing.username) {
      await this.assertUsernameFree(dto.username, id);
    }

    // Jangan sampai Super Admin aktif terakhir hilang.
    const demotingSuperAdmin =
      this.isSuperAdminRole(existing.role) &&
      existing.is_active &&
      (deactivating || (roleChanged && !this.isSuperAdminRole(newRole)));
    if (demotingSuperAdmin) {
      await this.assertOtherSuperAdminExists(id);
    }

    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.username && { username: dto.username }),
          ...(roleChanged && { role_id: nextRoleId }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
          // Paksa login ulang jika role berubah atau akun dinonaktifkan.
          ...((roleChanged || deactivating) && { refresh_token: null }),
        },
      });
    } catch (e) {
      this.rethrowUnique(e);
    }

    return this.findOne(id);
  }

  /** Reset password oleh admin. Refresh token dicabut. */
  async resetPassword(id: number, dto: ResetPasswordDto) {
    await this.getExisting(id);

    await this.prisma.user.update({
      where: { id },
      data: {
        password: await bcrypt.hash(dto.password, 10),
        refresh_token: null,
      },
    });

    return { message: 'Password berhasil direset' };
  }

  // ---------- helpers ----------

  private async getExisting(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role_id: true,
        is_active: true,
        role: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  private async assertUsernameFree(username: string, exceptId?: number) {
    const taken = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (taken && taken.id !== exceptId) {
      throw new ConflictException('Username sudah dipakai');
    }
  }

  /** Sama dengan logika PermissionsGuard.isSuperAdmin. */
  private isSuperAdminRole(role: RoleLite): boolean {
    const name = role.name.toLowerCase();
    return name === 'super admin' || name === 'superadmin' || role.id === 1;
  }

  private async assertOtherSuperAdminExists(excludeUserId: number) {
    const others = await this.prisma.user.count({
      where: {
        id: { not: excludeUserId },
        is_active: true,
        role: {
          OR: [
            { id: 1 },
            { name: { equals: 'super admin', mode: 'insensitive' } },
            { name: { equals: 'superadmin', mode: 'insensitive' } },
          ],
        },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'Harus ada minimal satu Super Admin aktif',
      );
    }
  }

  /** Race condition: cek manual lolos tapi unique constraint DB menolak. */
  private rethrowUnique(e: unknown): never {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      throw new ConflictException(
        'Username atau karyawan sudah terdaftar pada user lain',
      );
    }
    throw e;
  }
}