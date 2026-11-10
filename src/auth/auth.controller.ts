
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";

import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { ResponseMessage } from "../common/decorators/response-message.decorator";
import { Authenticated } from "../common/decorators/authenticated.decorator";
import { PermissionsGuard } from "../common/guards/permission.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AUTH } from "./auth.constants";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  /**
   * Login menggunakan username dan password.
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(AUTH.LOGIN_SUCCESSFUL)
  async login(@Body() dto: LoginDto) {
    // Debug sementara: jangan mencetak password asli.
    console.log("[CONTROLLER LOGIN DEBUG]", {
      bodyAda: Boolean(dto),
      username: dto?.username ?? "(undefined)",
      passwordTerisi: Boolean(dto?.password),
    });

    const { user, accessToken, refreshToken } =
      await this.authService.login(dto);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: toSafeUser(user),
    };
  }

  /**
   * Memperbarui access token menggunakan refresh token.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage(AUTH.TOKEN_REFRESHED)
  async refresh(@Body() dto: RefreshDto) {
    const { accessToken, refreshToken } =
      await this.authService.refreshToken(
        dto.refresh_token,
      );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  /**
   * Logout dan mencabut refresh token.
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Authenticated()
  @ResponseMessage(AUTH.LOGOUT_SUCCESSFUL)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authService.logout(user.id);

    return null;
  }

  /**
   * Mengambil data user yang sedang login.
   */
  @Get("me")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Authenticated()
  me(@CurrentUser() user: AuthenticatedUser) {
    return toSafeUser(user);
  }
}

/**
 * Menghapus informasi sensitif dari respons user.
 */
function toSafeUser(user: AuthenticatedUser) {
  const {
    password: _password,
    refresh_token: _refreshToken,
    role,
    ...safeUser
  } = user;

  return {
    ...safeUser,
    role: {
      id: role.id,
      name: role.name,
    },
    permissions: role.permissionRoles.map(
      (permissionRole) => ({
        id: permissionRole.permission.id,
        name: permissionRole.permission.name,
      }),
    ),
  };
}
