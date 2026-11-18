
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { ResponseMessage } from "../common/decorators/response-message.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

import {
  CreateVisitDto,
  FindAllVisitDto,
  UpdateStatusVisitDto,
} from "./visit.dto";

import { VisitService } from "./visit.service";

@Controller("visit")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

  @Get()
  @RequirePermission("visit:read")
  @ResponseMessage("Daftar kunjungan berhasil diambil")
  findAll(@Query() query: FindAllVisitDto) {
    return this.visitService.findAll(query);
  }

  @Get(":id")
  @RequirePermission("visit:read")
  @ResponseMessage("Detail kunjungan berhasil diambil")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.visitService.findOne(id);
  }

  @Post()
  @RequirePermission("visit:write")
  @ResponseMessage("Kunjungan berhasil dibuat")
  create(
    @Body() dto: CreateVisitDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.visitService.create(
      dto,
      user.id,
      ip,
      checkIdempotencyKey(idempotencyKey),
    );
  }

  @Patch(":id/update-status")
  @RequirePermission("visit:write")
  @ResponseMessage("Status kunjungan berhasil diperbarui")
  updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateStatusVisitDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
  ) {
    return this.visitService.updateStatus(id, dto, user.id, ip);
  }
}

function checkIdempotencyKey(key?: string): string | undefined {
  if (key === undefined) {
    return undefined;
  }

  if (!/^[\w-]{1,100}$/.test(key)) {
    throw new BadRequestException("Idempotency-Key tidak valid");
  }

  return key;
}
