import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreateIncidenciaDto } from './dto/create-incidencia.dto';
import { CreateOverrideDto } from './dto/create-override.dto';
import { CreateAuditoriaDto } from './dto/create-auditoria.dto';
import { CreateTimelogDto } from './dto/create-timelog.dto';
import { GetPolicyDto } from './dto/get-policy.dto';
import { ListDocumentosDto } from './dto/list-documentos.dto';
import { ListIncidenciasDto } from './dto/list-incidencias.dto';
import { ListOverridesDto } from './dto/list-overrides.dto';
import { ListTimelogsDto } from './dto/list-timelogs.dto';
import { RevokeOverrideDto } from './dto/revoke-override.dto';
import { UpdateIncidenciaStatusDto } from './dto/update-incidencia-status.dto';
import { UpdateTimelogDto } from './dto/update-timelog.dto';
import { UploadDocumentoDto } from './dto/upload-documento.dto';
import { UpsertPolicyDto } from './dto/upsert-policy.dto';
import { RelojChecadorService } from './reloj-checador.service';

@ApiTags('reloj-checador')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('reloj-checador')
export class RelojChecadorController {
  constructor(private readonly service: RelojChecadorService) {}

  @Get('context')
  getContext(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetPolicyDto, // Cambiado para recibir el objeto DTO completo[cite: 2]
    @Req() req: any,
  ) {
    // Se extrae query.suc para enviarlo al servicio blindado
    return this.service.getContext(user, query.suc, this.requestMeta(req));
  }

  @Post('timelog')
  createTimelog(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTimelogDto,
    @Req() req: any,
  ) {
    const normalized = this.normalizeCreateTimelogBody(
      dto as unknown as Record<string, unknown>,
    );
    return this.service.createTimelog(
      user,
      normalized as unknown as CreateTimelogDto,
      this.requestMeta(req, normalized),
    );
  }

  @Post('auditoria')
  createAuditoriaCliente(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAuditoriaDto,
    @Req() req: any,
  ) {
    return this.service.createClientAuditLog(
      user,
      dto,
      this.requestMeta(req, dto),
    );
  }

  @Get('timelogs')
  listTimelogs(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListTimelogsDto,
    @Req() req: any,
  ) {
    return this.service.listTimelogs(user, query, this.requestMeta(req));
  }

  @Get('historial/:id_usuario')
  getMarcajesHistorialByUsuario(
    @CurrentUser() user: JwtPayload,
    @Param('id_usuario') idUsuario: string,
    @Req() req: any,
  ) {
    return this.service.getMarcajesHistorialByUsuario(
      user,
      idUsuario,
      this.requestMeta(req),
    );
  }

  @Put('timelog/:id')
  updateTimelog(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTimelogDto,
    @Req() req: any,
  ) {
    return this.service.updateTimelog(
      user,
      id,
      dto,
      this.requestMeta(req, dto),
    );
  }

  @Patch('timelog/:id')
  patchTimelog(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTimelogDto,
    @Req() req: any,
  ) {
    return this.service.updateTimelog(
      user,
      id,
      dto,
      this.requestMeta(req, dto),
    );
  }

  @Delete('timelog/:id')
  deleteTimelog(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.deleteTimelog(user, id, this.requestMeta(req));
  }

  @Post('incidencias')
  createIncidencia(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateIncidenciaDto,
    @Req() req: any,
  ) {
    return this.service.createIncidencia(user, dto, this.requestMeta(req, dto));
  }

  @Put('incidencias/:id/status')
  updateIncidenciaStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateIncidenciaStatusDto,
    @Req() req: any,
  ) {
    return this.service.updateIncidenciaStatus(
      user,
      id,
      dto,
      this.requestMeta(req, dto),
    );
  }

  @Get('incidencias')
  listIncidencias(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListIncidenciasDto,
    @Req() req: any,
  ) {
    return this.service.listIncidencias(user, query, this.requestMeta(req));
  }

  @Post('documentos')
  uploadDocumento(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UploadDocumentoDto,
    @Req() req: any,
  ) {
    return this.service.uploadDocumento(user, dto, this.requestMeta(req, dto));
  }

  @Get('documentos')
  listDocumentos(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListDocumentosDto,
    @Req() req: any,
  ) {
    return this.service.listDocumentos(user, query, this.requestMeta(req));
  }

  @Get('documentos/:id/download')
  async downloadDocumento(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const file = await this.service.downloadDocumento(
      user,
      id,
      this.requestMeta(req),
    );
    const fileName = encodeURIComponent(
      file.fileName || `documento-${id}`,
    );

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(file.content);
  }

  @Post('overrides')
  createOverride(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOverrideDto,
    @Req() req: any,
  ) {
    return this.service.createOverride(user, dto, this.requestMeta(req, dto));
  }

  @Get('overrides')
  listOverrides(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListOverridesDto,
    @Req() req: any,
  ) {
    return this.service.listOverrides(user, query, this.requestMeta(req));
  }

  @Put('overrides/:id/revoke')
  revokeOverride(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RevokeOverrideDto,
    @Req() req: any,
  ) {
    return this.service.revokeOverride(
      user,
      id,
      dto,
      this.requestMeta(req, dto),
    );
  }

  @Get('policy')
  getPolicy(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetPolicyDto,
    @Req() req: any,
  ) {
    return this.service.getPolicy(user, query, this.requestMeta(req));
  }

  @Post('policy')
  upsertPolicy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertPolicyDto,
    @Req() req: any,
  ) {
    return this.service.upsertPolicy(user, dto, this.requestMeta(req, dto));
  }

  private requestMeta(req: any, body?: unknown) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;

    return {
      url: String(req?.originalUrl ?? req?.url ?? ''),
      method: String(req?.method ?? '').toUpperCase(),
      ip: ip ? String(ip) : null,
      userAgent: req?.headers?.['user-agent'] || 'unknown',
      signature: String(req?.headers?.['x-signature'] ?? '').trim() || null,
      deviceIdHeader: String(req?.headers?.['x-device-id'] ?? '').trim() || null,
      clientTimestamp:
        String(req?.headers?.['x-client-timestamp'] ?? '').trim() || null,
      body,
    };
  }

  private normalizeCreateTimelogBody(input: Record<string, unknown>) {
    return {
      ...input,
      id_usuario: input['id_usuario'] ?? input['ID_USUARIO'],
      pin: input['pin'] ?? input['PIN'],
      suc: input['suc'] ?? input['SUC'],
      tipo: input['tipo'] ?? input['TIPO'],
      verify_mode_label:
        input['verify_mode_label'] ??
        input['VERIFY_MODE_LABEL'] ??
        input['auth_method'] ??
        input['AUTH_METHOD'],
      device_id: input['device_id'] ?? input['DEVICE_ID'],
      client_id_unico: input['client_id_unico'] ?? input['CLIENT_ID_UNICO'],
      fecha_hora_local: input['fecha_hora_local'] ?? input['FECHA_HORA_LOCAL'],
      notes: input['notes'] ?? input['NOTES'],
    };
  }
}
