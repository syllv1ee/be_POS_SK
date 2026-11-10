
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { StringValue } from "ms";

import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { AUTH } from "./auth.constants";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

const WITH_ROLE_PERMISSIONS = {
  role: {
    include: {
      permissionRoles: {
        include: {
          permission: true,
        },
      },
    },
  },
} as const;

interface RefreshPayload {
  sub: number;
  username: string;
  type?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Login menggunakan username dan password.
   */
  async login(dto: LoginDto) {
    const username =
      typeof dto?.username === "string"
        ? dto.username.trim()
        : "";

    const password =
      typeof dto?.password === "string"
        ? dto.password
        : "";

    // Debug sementara, tanpa mencetak password asli.
    console.log("[LOGIN DEBUG]", {
      username: username || "(kosong)",
      usernameTerisi: Boolean(username),
      passwordTerisi: Boolean(password),
    });

    if (!username || !password) {
      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { username },
      include: WITH_ROLE_PERMISSIONS,
    });

    if (!user) {
      console.warn(
        `[LOGIN DEBUG] Username "${username}" tidak ditemukan.`,
      );

      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    if (!user.is_active) {
      console.warn(
        `[LOGIN DEBUG] Akun "${username}" tidak aktif.`,
      );

      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password,
    );

    console.log("[LOGIN DEBUG] Password valid:", isPasswordValid);

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
    });

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        username: user.username,
        type: "refresh",
      },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ||
          "30d") as StringValue,
      },
    );

    // Simpan hash refresh token untuk validasi dan pencabutan token.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refresh_token: await bcrypt.hash(refreshToken, 10),
      },
    });

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Membuat access token dan refresh token baru.
   */
  async refreshToken(token: string) {
    if (!token || !process.env.JWT_REFRESH_SECRET) {
      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    let payload: RefreshPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshPayload>(
        token,
        {
          secret: process.env.JWT_REFRESH_SECRET,
        },
      );
    } catch {
      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    if (!payload.sub || payload.type !== "refresh") {
      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: WITH_ROLE_PERMISSIONS,
    });

    if (!user || !user.is_active || !user.refresh_token) {
      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    const isRefreshTokenValid = await bcrypt.compare(
      token,
      user.refresh_token,
    );

    if (!isRefreshTokenValid) {
      // Cabut token tersimpan jika token yang dikirim tidak cocok.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refresh_token: null },
      });

      throw new UnauthorizedException(
        AUTH.INVALID_CREDENTIALS,
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
    });

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        username: user.username,
        type: "refresh",
      },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ||
          "30d") as StringValue,
      },
    );

    // Rotasi refresh token: token lama diganti dengan hash token baru.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refresh_token: await bcrypt.hash(refreshToken, 10),
      },
    });

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Logout dan cabut refresh token milik user.
   */
  async logout(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refresh_token: null,
      },
    });

    return {
      message: "Logout berhasil",
    };
  }

  /**
   * Validasi user berdasarkan ID dari access token.
   */
  async validateUser(
    userId: number,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: WITH_ROLE_PERMISSIONS,
    });

    if (!user || !user.is_active) {
      return null;
    }

    return user as unknown as AuthenticatedUser;
  }
}
