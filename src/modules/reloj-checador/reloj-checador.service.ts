import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
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

type RequestMeta = {
  url: string;
  method: string;
  ip: string | null;
  body?: unknown;
};

type AccessScope = {
  idUsuario: number;
  roleId: number;
  roleCode: string;
  roleName: string;
  nivel: number;
  suc: string | null;
  idDepto: number | null;
  isAdmin: boolean;
  isHr: boolean;
  isManager: boolean;
  isEmployee: boolean;
};

type UserScopeRow = {
  idUsuario: number;
  suc: string | null;
  idDepto: number | null;
};

@Injectable()
export class RelojChecadorService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async getContext(
    user: JwtPayload,
    sucQuery: string | undefined,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    const suc = this.resolveScopedSuc(scope, sucQuery);

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_timelog_get_context
          @IDUSUARIO = @0,
          @SUC = @1;
        `,
        [scope.idUsuario, suc],
      );

      const row = this.firstRow(rows);
      if (!row) {
        throw new NotFoundException(
          'No se pudo obtener el contexto del marcaje',
        );
      }

      await this.audit.log({
        IDUSUARIO: scope.idUsuario,
        ACTION: 'GET',
        MODULO: 'reloj_checador',
        ENTIDAD: 'ATT_TIME_LOG',
        ENTIDAD_ID: null,
        SUC: suc,
        METADATA_JSON: JSON.stringify({
          url: meta.url,
          method: meta.method,
          query: { suc },
          result: {
            LAST_TIPO: this.readString(row, 'LAST_TIPO'),
            NEXT_ALLOWED_TIPO: this.readString(row, 'NEXT_ALLOWED_TIPO'),
          },
        }),
        IP: meta.ip,
      });

      return row;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async createTimelog(
    user: JwtPayload,
    dto: CreateTimelogDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    const suc = this.resolveScopedSuc(scope, dto.SUC);

    const tipo = this.normalizeUpper(dto.TIPO);
    const authMethod = this.normalizeUpper(dto.AUTH_METHOD);

    try {
      const rows = await this.dataSource.query(
        `
        DECLARE @OK BIT;
        DECLARE @MESSAGE VARCHAR(200);
        DECLARE @IDTIMELOG BIGINT;

        EXEC dbo.sp_att_timelog_create
          @IDUSUARIO = @0,
          @SUC = @1,
          @TIPO = @2,
          @AUTH_METHOD = @3,
          @LIVENESS_OK = @4,
          @LAT = @5,
          @LON = @6,
          @GPS_ACCURACY_M = @7,
          @DEVICE_ID = @8,
          @CLIENT_IP = @9,
          @NOTES = @10,
          @OK = @OK OUTPUT,
          @MESSAGE = @MESSAGE OUTPUT,
          @IDTIMELOG = @IDTIMELOG OUTPUT;

        SELECT @OK AS OK, @MESSAGE AS MESSAGE, @IDTIMELOG AS IDTIMELOG;
        `,
        [
          scope.idUsuario,
          suc,
          tipo,
          authMethod,
          this.toBit(dto.LIVENESS_OK ?? 0),
          dto.LAT ?? null,
          dto.LON ?? null,
          dto.GPS_ACCURACY_M ?? null,
          dto.DEVICE_ID?.trim() || null,
          meta.ip,
          dto.NOTES?.trim() || null,
        ],
      );

      const row = this.firstRow(rows);
      if (!row) {
        throw new BadRequestException(
          'No se recibio respuesta al crear marcaje',
        );
      }

      const ok = this.toBool(this.readValue(row, 'OK'));
      const message = this.readString(row, 'MESSAGE') ?? 'Marcaje procesado';
      const idTimeLog = this.readValue(row, 'IDTIMELOG');

      if (!ok) {
        throw new ConflictException(message);
      }

      await this.audit.log({
        IDUSUARIO: scope.idUsuario,
        ACTION: 'POST',
        MODULO: 'reloj_checador',
        ENTIDAD: 'ATT_TIME_LOG',
        ENTIDAD_ID: idTimeLog == null ? null : String(idTimeLog),
        SUC: suc,
        METADATA_JSON: JSON.stringify({
          url: meta.url,
          method: meta.method,
          body: this.sanitizeBody(meta.body),
          OK: ok,
          MESSAGE: message,
          IDTIMELOG: idTimeLog,
        }),
        IP: meta.ip,
      });

      return {
        OK: ok,
        MESSAGE: message,
        IDTIMELOG: idTimeLog,
      };
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async listTimelogs(
    user: JwtPayload,
    query: ListTimelogsDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);

    let suc = this.normalizeNullable(query.suc);
    let idUsuario = query.idUsuario ?? null;
    let idDepto = query.idDepto ?? null;

    if (scope.isEmployee) {
      suc = this.requireActorSuc(scope);
      idUsuario = scope.idUsuario;
      idDepto = null;
    } else if (!this.hasGlobalScope(scope)) {
      const managerSuc = this.requireActorSuc(scope);
      if (suc != null && suc !== managerSuc) {
        throw new ForbiddenException('El usuario no puede consultar otra SUC');
      }
      suc = managerSuc;

      if (idUsuario != null) {
        await this.ensureUserWithinScope(scope, idUsuario, suc);
      }

      idDepto = scope.idDepto ?? null;
      if (
        query.idDepto != null &&
        scope.idDepto != null &&
        query.idDepto !== scope.idDepto
      ) {
        throw new ForbiddenException(
          'El usuario no puede consultar otro departamento',
        );
      }
    }

    const page = this.normalizePage(query.page, 1);
    const limit = this.normalizeLimit(query.limit, 100);

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_timelog_list
          @SUC = @0,
          @IDUSUARIO = @1,
          @IDDEPTO = @2,
          @DATE_FROM = @3,
          @DATE_TO = @4,
          @PAGE = @5,
          @LIMIT = @6;
        `,
        [
          suc,
          idUsuario,
          idDepto,
          query.dateFrom ?? null,
          query.dateTo ?? null,
          page,
          limit,
        ],
      );

      const total =
        this.toInt(this.readValue(this.firstRow(rows), 'TOTAL_COUNT')) ??
        rows.length;

      await this.audit.log({
        IDUSUARIO: scope.idUsuario,
        ACTION: 'GET',
        MODULO: 'reloj_checador',
        ENTIDAD: 'ATT_TIME_LOG',
        ENTIDAD_ID: null,
        SUC: suc ?? scope.suc,
        METADATA_JSON: JSON.stringify({
          url: meta.url,
          method: meta.method,
          query: {
            suc,
            idUsuario,
            idDepto,
            dateFrom: query.dateFrom ?? null,
            dateTo: query.dateTo ?? null,
            page,
            limit,
          },
        }),
        IP: meta.ip,
      });

      return {
        items: rows,
        total,
        page,
        limit,
      };
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async createClientAuditLog(
    user: JwtPayload,
    dto: CreateAuditoriaDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    const payload = {
      evento: this.normalizeUpper(dto.EVENTO),
      detalle: dto.DETALLE?.trim() || null,
      deviceId: dto.DEVICE_ID?.trim() || null,
      clientIdUnico: dto.CLIENT_ID_UNICO?.trim() || null,
      fechaHoraLocal: dto.FECHA_HORA_LOCAL?.trim() || null,
      url: meta.url,
      method: meta.method,
    };

    await this.audit.log({
      IDUSUARIO: scope.idUsuario,
      ACTION: 'POST',
      MODULO: 'reloj_checador',
      ENTIDAD: 'CLIENT_AUDIT',
      ENTIDAD_ID: null,
      SUC: scope.suc,
      METADATA_JSON: JSON.stringify(payload),
      IP: meta.ip,
    });

    return {
      ok: true,
      message: 'Auditoria registrada',
    };
  }

  async getMarcajesHistorialByUsuario(
    user: JwtPayload,
    idUsuarioRaw: string,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    const idUsuario = this.parseId(idUsuarioRaw, 'id_usuario');

    let suc: string | null = null;
    if (scope.isEmployee) {
      if (idUsuario !== scope.idUsuario) {
        throw new ForbiddenException(
          'Empleado solo puede consultar su propio historial',
        );
      }
      suc = this.requireActorSuc(scope);
    } else if (!this.hasGlobalScope(scope)) {
      suc = this.requireActorSuc(scope);
      await this.ensureUserWithinScope(scope, idUsuario, suc);
    }

    const rows = await this.dataSource.query(
      `
      SELECT TOP 200
        m.id_usuario,
        m.punch_time,
        m.pin,
        m.suc,
        m.tipo,
        m.verify_mode_label
      FROM dbo.MARCAJES m
      WHERE m.id_usuario = @0
        AND (@1 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(m.suc, '')))) = @1)
      ORDER BY m.punch_time DESC;
      `,
      [idUsuario, suc ? this.normalizeUpper(suc) : null],
    );

    await this.audit.log({
      IDUSUARIO: scope.idUsuario,
      ACTION: 'GET',
      MODULO: 'reloj_checador',
      ENTIDAD: 'MARCAJES',
      ENTIDAD_ID: null,
      SUC: suc ?? scope.suc,
      METADATA_JSON: JSON.stringify({
        url: meta.url,
        method: meta.method,
        idUsuario,
      }),
      IP: meta.ip,
    });

    return rows ?? [];
  }

  async updateTimelog(
    user: JwtPayload,
    idRaw: string,
    dto: UpdateTimelogDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    if (!this.hasGlobalScope(scope)) {
      throw new ForbiddenException('Solo Admin/RRHH puede corregir marcajes');
    }

    const id = this.parseId(idRaw, 'IDTIMELOG');

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_timelog_admin_update
          @IDTIMELOG = @0,
          @FCNR = @1,
          @NOTES = @2,
          @TIPO = @3,
          @REASON = @4,
          @CHANGED_BY = @5,
          @IP = @6,
          @URL = @7,
          @METHOD = @8;
        `,
        [
          id,
          dto.FCNR ?? null,
          dto.NOTES?.trim() || null,
          dto.TIPO ? this.normalizeUpper(dto.TIPO) : null,
          dto.REASON.trim(),
          scope.idUsuario,
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const row = this.firstRow(rows);
      if (!row)
        throw new NotFoundException('Marcaje no encontrado para actualizacion');
      return row;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async deleteTimelog(user: JwtPayload, idRaw: string, meta: RequestMeta) {
    const scope = await this.resolveAccessScope(user);
    if (!this.hasGlobalScope(scope)) {
      throw new ForbiddenException('Solo Admin/RRHH puede eliminar marcajes');
    }

    const id = this.parseId(idRaw, 'IDTIMELOG');
    const existsRows = await this.dataSource.query(
      `
      SELECT TOP 1 IDTIMELOG
      FROM dbo.ATT_TIME_LOG
      WHERE IDTIMELOG = @0
      `,
      [id],
    );
    if (!this.firstRow(existsRows)) {
      throw new NotFoundException('Marcaje no encontrado');
    }

    await this.dataSource.query(
      `
      UPDATE dbo.ATT_TIME_LOG
      SET ACTIVO = 0
      WHERE IDTIMELOG = @0;
      `,
      [id],
    );

    await this.audit.log({
      IDUSUARIO: scope.idUsuario,
      ACTION: 'DELETE',
      MODULO: 'reloj_checador',
      ENTIDAD: 'ATT_TIME_LOG',
      ENTIDAD_ID: String(id),
      SUC: scope.suc,
      METADATA_JSON: JSON.stringify({
        url: meta.url,
        method: meta.method,
      }),
      IP: meta.ip,
    });

    return { success: true, id, logical: true };
  }

  async createIncidencia(
    user: JwtPayload,
    dto: CreateIncidenciaDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    const targetUserId = dto.IDUSUARIO ?? scope.idUsuario;

    if (scope.isEmployee && targetUserId !== scope.idUsuario) {
      throw new ForbiddenException(
        'Empleado solo puede crear incidencias propias',
      );
    }

    let suc = this.normalizeNullable(dto.SUC);
    if (scope.isEmployee) {
      suc = this.requireActorSuc(scope);
    } else if (!this.hasGlobalScope(scope)) {
      const managerSuc = this.requireActorSuc(scope);
      if (suc != null && suc !== managerSuc) {
        throw new ForbiddenException('Manager solo puede operar en su SUC');
      }
      suc = managerSuc;
      await this.ensureUserWithinScope(scope, targetUserId, suc);
    }

    if (suc == null) {
      const targetUser = await this.loadUserScope(targetUserId);
      suc = targetUser.suc;
    }
    if (suc == null) {
      throw new BadRequestException(
        'No se pudo determinar SUC para la incidencia',
      );
    }

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_incidencia_create
          @IDUSUARIO = @0,
          @SUC = @1,
          @TIPO = @2,
          @FECHA_INI = @3,
          @FECHA_FIN = @4,
          @MOTIVO = @5,
          @ESTATUS = @6,
          @APROBADA_POR = @7,
          @CREATED_BY = @8,
          @IP = @9,
          @URL = @10,
          @METHOD = @11;
        `,
        [
          targetUserId,
          suc,
          this.normalizeUpper(dto.TIPO),
          dto.FECHA_INI,
          dto.FECHA_FIN,
          dto.MOTIVO?.trim() || null,
          dto.ESTATUS ? this.normalizeUpper(dto.ESTATUS) : null,
          dto.APROBADA_POR ?? null,
          scope.idUsuario,
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const row = this.firstRow(rows);
      if (!row) throw new BadRequestException('No se pudo crear la incidencia');
      return row;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async updateIncidenciaStatus(
    user: JwtPayload,
    idRaw: string,
    dto: UpdateIncidenciaStatusDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    if (scope.isEmployee) {
      throw new ForbiddenException(
        'Empleado no puede cambiar estatus de incidencias',
      );
    }

    const id = this.parseId(idRaw, 'IDINC');

    if (!this.hasGlobalScope(scope)) {
      const rows = await this.dataSource.query(
        `
        SELECT TOP 1 i.IDUSUARIO, i.SUC
        FROM dbo.ATT_INCIDENCIA i
        WHERE i.IDINC = @0
        `,
        [id],
      );
      const row = this.firstRow(rows);
      if (!row) throw new NotFoundException('Incidencia no encontrada');

      const suc = this.readString(row, 'SUC');
      if (suc == null || suc !== this.requireActorSuc(scope)) {
        throw new ForbiddenException(
          'Manager solo puede gestionar incidencias de su SUC',
        );
      }

      const targetUserId = this.toInt(this.readValue(row, 'IDUSUARIO'));
      if (targetUserId != null) {
        await this.ensureUserWithinScope(scope, targetUserId, suc);
      }
    }

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_incidencia_update_status
          @IDINC = @0,
          @ESTATUS = @1,
          @APROBADA_POR = @2,
          @REASON = @3,
          @CHANGED_BY = @4,
          @IP = @5,
          @URL = @6,
          @METHOD = @7;
        `,
        [
          id,
          this.normalizeUpper(dto.ESTATUS),
          dto.APROBADA_POR ?? null,
          dto.REASON?.trim() || null,
          scope.idUsuario,
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const row = this.firstRow(rows);
      if (!row)
        throw new NotFoundException('No se pudo actualizar la incidencia');
      return row;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async listIncidencias(
    user: JwtPayload,
    query: ListIncidenciasDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);

    let suc = this.normalizeNullable(query.suc);
    let idUsuario = query.idUsuario ?? null;

    if (scope.isEmployee) {
      suc = this.requireActorSuc(scope);
      idUsuario = scope.idUsuario;
    } else if (!this.hasGlobalScope(scope)) {
      const managerSuc = this.requireActorSuc(scope);
      if (suc != null && suc !== managerSuc) {
        throw new ForbiddenException('Manager solo puede listar su SUC');
      }
      suc = managerSuc;

      if (idUsuario != null) {
        await this.ensureUserWithinScope(scope, idUsuario, suc);
      }
    }

    const page = this.normalizePage(query.page, 1);
    const limit = this.normalizeLimit(query.limit, 100);

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_incidencia_list
          @SUC = @0,
          @IDUSUARIO = @1,
          @DATE_FROM = @2,
          @DATE_TO = @3,
          @ESTATUS = @4,
          @TIPO = @5,
          @PAGE = @6,
          @LIMIT = @7,
          @REQUESTED_BY = @8,
          @IP = @9,
          @URL = @10,
          @METHOD = @11;
        `,
        [
          suc,
          idUsuario,
          query.dateFrom ?? null,
          query.dateTo ?? null,
          query.estatus ? this.normalizeUpper(query.estatus) : null,
          query.tipo ? this.normalizeUpper(query.tipo) : null,
          page,
          limit,
          scope.idUsuario,
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const total =
        this.toInt(this.readValue(this.firstRow(rows), 'TOTAL_COUNT')) ??
        rows.length;
      return { items: rows, total, page, limit };
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async uploadDocumento(
    user: JwtPayload,
    dto: UploadDocumentoDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    const targetUserId = dto.IDUSUARIO ?? scope.idUsuario;

    if (scope.isEmployee && targetUserId !== scope.idUsuario) {
      throw new ForbiddenException(
        'Empleado solo puede subir documentos propios',
      );
    }

    const contentBuffer = this.decodeBase64(dto.CONTENT_BASE64);
    const sucFromDto = this.normalizeNullable(dto.SUC);

    let suc = sucFromDto;
    if (scope.isEmployee) {
      suc = this.requireActorSuc(scope);
    } else if (!this.hasGlobalScope(scope)) {
      const managerSuc = this.requireActorSuc(scope);
      if (suc != null && suc !== managerSuc) {
        throw new ForbiddenException(
          'Manager solo puede subir documentos de su SUC',
        );
      }
      suc = managerSuc;
      await this.ensureUserWithinScope(scope, targetUserId, suc);
    }

    if (suc == null) {
      const targetUser = await this.loadUserScope(targetUserId);
      suc = targetUser.suc;
    }

    if (suc == null) {
      throw new BadRequestException(
        'No se pudo determinar SUC para el documento',
      );
    }

    if (dto.IDINC != null) {
      await this.assertIncidenciaOwnership(dto.IDINC, targetUserId, suc, scope);
    }

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_document_upload
          @IDUSUARIO = @0,
          @IDINC = @1,
          @SUC = @2,
          @TIPO = @3,
          @FILE_NAME = @4,
          @MIME_TYPE = @5,
          @CONTENT = @6,
          @SHA256 = @7,
          @UPLOADED_BY = @8,
          @IP = @9,
          @URL = @10,
          @METHOD = @11;
        `,
        [
          targetUserId,
          dto.IDINC ?? null,
          suc,
          this.normalizeUpper(dto.TIPO),
          dto.FILE_NAME.trim(),
          dto.MIME_TYPE.trim(),
          contentBuffer,
          dto.SHA256?.trim() || null,
          scope.idUsuario,
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const row = this.firstRow(rows);
      if (!row) throw new BadRequestException('No se pudo cargar el documento');
      return row;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async listDocumentos(
    user: JwtPayload,
    query: ListDocumentosDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);

    let suc = this.normalizeNullable(query.suc);
    let userId = query.userId ?? null;
    const incId = query.incId ?? null;

    if (scope.isEmployee) {
      suc = this.requireActorSuc(scope);
      userId = scope.idUsuario;
    } else if (!this.hasGlobalScope(scope)) {
      const managerSuc = this.requireActorSuc(scope);
      if (suc != null && suc !== managerSuc) {
        throw new ForbiddenException(
          'Manager solo puede listar documentos de su SUC',
        );
      }
      suc = managerSuc;
      if (userId != null) {
        await this.ensureUserWithinScope(scope, userId, suc);
      }
    }

    const page = this.normalizePage(query.page, 1);
    const limit = this.normalizeLimit(query.limit, 100);

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_document_list
          @IDUSUARIO = @0,
          @IDINC = @1,
          @SUC = @2,
          @DATE_FROM = @3,
          @DATE_TO = @4,
          @PAGE = @5,
          @LIMIT = @6,
          @REQUESTED_BY = @7,
          @IP = @8,
          @URL = @9,
          @METHOD = @10;
        `,
        [
          userId,
          incId,
          suc,
          query.dateFrom ?? null,
          query.dateTo ?? null,
          page,
          limit,
          scope.idUsuario,
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const total =
        this.toInt(this.readValue(this.firstRow(rows), 'TOTAL_COUNT')) ??
        rows.length;
      return { items: rows, total, page, limit };
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async downloadDocumento(user: JwtPayload, idRaw: string, meta: RequestMeta) {
    const scope = await this.resolveAccessScope(user);
    const idDoc = this.parseId(idRaw, 'IDDOC');

    const docMetaRows = await this.dataSource.query(
      `
      SELECT TOP 1 IDUSUARIO, SUC
      FROM dbo.ATT_DOCUMENTO
      WHERE IDDOC = @0
      `,
      [idDoc],
    );

    const docMeta = this.firstRow(docMetaRows);
    if (!docMeta) {
      throw new NotFoundException('Documento no encontrado');
    }

    const docUserId = this.toInt(this.readValue(docMeta, 'IDUSUARIO'));
    const docSuc = this.readString(docMeta, 'SUC');

    if (scope.isEmployee) {
      if (docUserId !== scope.idUsuario) {
        throw new ForbiddenException(
          'Empleado solo puede descargar documentos propios',
        );
      }
    } else if (!this.hasGlobalScope(scope)) {
      if (docSuc == null || docSuc !== this.requireActorSuc(scope)) {
        throw new ForbiddenException(
          'Manager solo puede descargar documentos de su SUC',
        );
      }
      if (docUserId != null) {
        await this.ensureUserWithinScope(scope, docUserId, docSuc);
      }
    }

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_document_download
          @IDDOC = @0,
          @REQUESTED_BY = @1,
          @IP = @2,
          @URL = @3,
          @METHOD = @4;
        `,
        [idDoc, scope.idUsuario, meta.ip, meta.url, meta.method],
      );

      const row = this.firstRow(rows);
      if (!row) {
        throw new NotFoundException('Documento no encontrado para descarga');
      }

      return {
        idDoc,
        fileName: this.readString(row, 'FILE_NAME') ?? `documento-${idDoc}`,
        mimeType:
          this.readString(row, 'MIME_TYPE') ?? 'application/octet-stream',
        content: this.readBuffer(this.readValue(row, 'CONTENT')),
      };
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async createOverride(
    user: JwtPayload,
    dto: CreateOverrideDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    if (scope.isEmployee) {
      throw new ForbiddenException('Empleado no puede crear overrides');
    }

    let suc = this.normalizeNullable(dto.SUC);
    if (!this.hasGlobalScope(scope)) {
      const managerSuc = this.requireActorSuc(scope);
      if (suc != null && suc !== managerSuc) {
        throw new ForbiddenException(
          'Manager solo puede crear overrides en su SUC',
        );
      }
      suc = managerSuc;
      await this.ensureUserWithinScope(scope, dto.IDUSUARIO, suc);
    }

    if (suc == null) {
      const targetUser = await this.loadUserScope(dto.IDUSUARIO);
      suc = targetUser.suc;
    }
    if (suc == null) {
      throw new BadRequestException('No se pudo resolver SUC para el override');
    }

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_override_create
          @IDUSUARIO = @0,
          @SUC = @1,
          @TIPO = @2,
          @REASON = @3,
          @AUTH_BY = @4,
          @VALID_UNTIL = @5,
          @IP = @6,
          @URL = @7,
          @METHOD = @8;
        `,
        [
          dto.IDUSUARIO,
          suc,
          this.normalizeUpper(dto.TIPO),
          dto.REASON.trim(),
          scope.idUsuario,
          dto.VALID_UNTIL,
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const row = this.firstRow(rows);
      if (!row) throw new BadRequestException('No se pudo crear override');
      return row;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async listOverrides(
    user: JwtPayload,
    query: ListOverridesDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    if (scope.isEmployee) {
      throw new ForbiddenException('Empleado no puede consultar overrides');
    }

    let suc = this.normalizeNullable(query.suc);
    const idUsuario = query.idUsuario ?? null;

    if (!this.hasGlobalScope(scope)) {
      const managerSuc = this.requireActorSuc(scope);
      if (suc != null && suc !== managerSuc) {
        throw new ForbiddenException(
          'Manager solo puede consultar overrides de su SUC',
        );
      }
      suc = managerSuc;
      if (idUsuario != null) {
        await this.ensureUserWithinScope(scope, idUsuario, suc);
      }
    }

    const page = this.normalizePage(query.page, 1);
    const limit = this.normalizeLimit(query.limit, 100);
    const activeOnly = query.activeOnly === false ? 0 : 1;

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_override_list
          @SUC = @0,
          @IDUSUARIO = @1,
          @ACTIVE_ONLY = @2,
          @PAGE = @3,
          @LIMIT = @4,
          @REQUESTED_BY = @5,
          @IP = @6,
          @URL = @7,
          @METHOD = @8;
        `,
        [
          suc,
          idUsuario,
          activeOnly,
          page,
          limit,
          scope.idUsuario,
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const total =
        this.toInt(this.readValue(this.firstRow(rows), 'TOTAL_COUNT')) ??
        rows.length;
      return { items: rows, total, page, limit };
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async revokeOverride(
    user: JwtPayload,
    idRaw: string,
    dto: RevokeOverrideDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    if (scope.isEmployee) {
      throw new ForbiddenException('Empleado no puede revocar overrides');
    }

    const idOvr = this.parseId(idRaw, 'IDOVR');

    if (!this.hasGlobalScope(scope)) {
      const rows = await this.dataSource.query(
        `
        SELECT TOP 1 IDUSUARIO, SUC
        FROM dbo.ATT_OVERRIDE
        WHERE IDOVR = @0
        `,
        [idOvr],
      );
      const row = this.firstRow(rows);
      if (!row) throw new NotFoundException('Override no encontrado');

      const suc = this.readString(row, 'SUC');
      if (suc == null || suc !== this.requireActorSuc(scope)) {
        throw new ForbiddenException(
          'Manager solo puede revocar overrides de su SUC',
        );
      }

      const targetUserId = this.toInt(this.readValue(row, 'IDUSUARIO'));
      if (targetUserId != null) {
        await this.ensureUserWithinScope(scope, targetUserId, suc);
      }
    }

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_override_revoke
          @IDOVR = @0,
          @REVOKED_BY = @1,
          @REASON = @2,
          @IP = @3,
          @URL = @4,
          @METHOD = @5;
        `,
        [
          idOvr,
          scope.idUsuario,
          dto.REASON.trim(),
          meta.ip,
          meta.url,
          meta.method,
        ],
      );

      const row = this.firstRow(rows);
      if (!row)
        throw new NotFoundException('Override no encontrado para revocar');
      return row;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async getPolicy(user: JwtPayload, query: GetPolicyDto, meta: RequestMeta) {
    const scope = await this.resolveAccessScope(user);
    if (!this.hasGlobalScope(scope)) {
      throw new ForbiddenException('Solo Admin puede consultar policies');
    }

    const suc =
      this.normalizeNullable(query.suc) ?? this.requireActorSuc(scope);

    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_policy_get
          @SUC = @0,
          @IDDEPTO = @1,
          @IDUSUARIO = @2;
        `,
        [suc, query.idDepto ?? null, null],
      );

      const row = this.firstRow(rows);
      if (!row) throw new NotFoundException('Policy no encontrada');

      await this.audit.log({
        IDUSUARIO: scope.idUsuario,
        ACTION: 'GET',
        MODULO: 'reloj_checador',
        ENTIDAD: 'ATT_POLICY',
        ENTIDAD_ID:
          this.readValue(row, 'IDPOLICY') == null
            ? null
            : String(this.readValue(row, 'IDPOLICY')),
        SUC: suc,
        METADATA_JSON: JSON.stringify({
          url: meta.url,
          method: meta.method,
          query: {
            suc,
            idDepto: query.idDepto ?? null,
          },
        }),
        IP: meta.ip,
      });

      return row;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  async upsertPolicy(
    user: JwtPayload,
    dto: UpsertPolicyDto,
    meta: RequestMeta,
  ) {
    const scope = await this.resolveAccessScope(user);
    if (!this.hasGlobalScope(scope)) {
      throw new ForbiddenException('Solo Admin puede editar policies');
    }

    const suc = dto.SUC.trim();
    const idDepto = dto.IDDEPTO ?? null;

    try {
      const beforeRows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_policy_get
          @SUC = @0,
          @IDDEPTO = @1,
          @IDUSUARIO = @2;
        `,
        [suc, idDepto, null],
      );
      const before = this.firstRow(beforeRows);

      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_att_policy_upsert
          @SUC = @0,
          @IDDEPTO = @1,
          @TIMEZONE = @2,
          @ALLOW_EARLY_MIN = @3,
          @ALLOW_LATE_MIN = @4,
          @REQUIRE_GPS = @5,
          @GEOFENCE_LAT = @6,
          @GEOFENCE_LON = @7,
          @GEOFENCE_RADIUS_M = @8,
          @GPS_MAX_ACCURACY_M = @9,
          @REQUIRE_LIVENESS = @10,
          @SHIFT_START = @11,
          @SHIFT_END = @12,
          @LUNCH_START = @13,
          @LUNCH_END = @14,
          @ENFORCE_WINDOWS = @15,
          @OVERTIME_DAILY_LIMIT_HOURS = @16,
          @OVERTIME_WEEKLY_LIMIT_HOURS = @17,
          @ACTIVE = @18;
        `,
        [
          suc,
          idDepto,
          dto.TIMEZONE?.trim() || null,
          dto.ALLOW_EARLY_MIN ?? null,
          dto.ALLOW_LATE_MIN ?? null,
          this.nullableBit(dto.REQUIRE_GPS),
          dto.GEOFENCE_LAT ?? null,
          dto.GEOFENCE_LON ?? null,
          dto.GEOFENCE_RADIUS_M ?? null,
          dto.GPS_MAX_ACCURACY_M ?? null,
          this.nullableBit(dto.REQUIRE_LIVENESS),
          dto.SHIFT_START ?? null,
          dto.SHIFT_END ?? null,
          dto.LUNCH_START ?? null,
          dto.LUNCH_END ?? null,
          this.nullableBit(dto.ENFORCE_WINDOWS),
          dto.OVERTIME_DAILY_LIMIT_HOURS ?? null,
          dto.OVERTIME_WEEKLY_LIMIT_HOURS ?? null,
          this.nullableBit(dto.ACTIVE),
        ],
      );

      const after = this.firstRow(rows);
      if (!after) throw new BadRequestException('No se pudo guardar policy');

      const beforeId = this.readValue(before, 'IDPOLICY');
      const action = beforeId == null ? 'POST' : 'PUT';
      const afterId = this.readValue(after, 'IDPOLICY');

      await this.audit.log({
        IDUSUARIO: scope.idUsuario,
        ACTION: action,
        MODULO: 'reloj_checador',
        ENTIDAD: 'ATT_POLICY',
        ENTIDAD_ID: afterId == null ? null : String(afterId),
        SUC: suc,
        METADATA_JSON: JSON.stringify({
          url: meta.url,
          method: meta.method,
          body: this.sanitizeBody(meta.body),
          before,
          after,
        }),
        IP: meta.ip,
      });

      return after;
    } catch (error) {
      this.throwMappedError(error);
    }
  }

  private async resolveAccessScope(user: JwtPayload): Promise<AccessScope> {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        u.IDUSUARIO,
        u.SUC,
        TRY_CONVERT(INT, u.IDDEPTO) AS IDDEPTO,
        TRY_CONVERT(INT, u.NIVEL) AS NIVEL,
        r.CODIGO AS ROLE_CODE,
        r.NOMBRE AS ROLE_NAME
      FROM dbo.USUARIO u
      LEFT JOIN dbo.ROL r ON r.IDROL = u.IDROL
      WHERE u.IDUSUARIO = @0
      `,
      [user.sub],
    );

    const row = this.firstRow(rows);
    const roleCode = this.normalizeUpper(
      this.readString(row, 'ROLE_CODE') ?? '',
    );
    const roleName = this.readString(row, 'ROLE_NAME') ?? '';
    const nivel =
      this.toInt(this.readValue(row, 'NIVEL')) ??
      (Number(user.nivel ?? 0) || 0);
    const suc = this.normalizeNullable(
      this.readString(row, 'SUC') ?? user.suc ?? null,
    );
    const idDepto = this.toInt(this.readValue(row, 'IDDEPTO'));

    const isAdmin =
      Number(user.roleId ?? 0) === 1 ||
      nivel === 0 ||
      roleCode.includes('ADMIN');

    const isHr =
      roleCode.includes('RRHH') ||
      roleCode.includes('RECURSOS') ||
      roleCode === 'HR';

    const isManager =
      isAdmin ||
      isHr ||
      roleCode.includes('MANAGER') ||
      roleCode.includes('GEREN') ||
      roleCode.includes('SUPERV') ||
      roleCode.startsWith('SUPER') ||
      roleCode.includes('JEFE');

    return {
      idUsuario: Number(user.sub),
      roleId: Number(user.roleId ?? 0),
      roleCode,
      roleName,
      nivel,
      suc,
      idDepto,
      isAdmin,
      isHr,
      isManager,
      isEmployee: !isManager,
    };
  }

  private hasGlobalScope(scope: AccessScope) {
    return scope.isAdmin || scope.isHr;
  }

  private resolveScopedSuc(scope: AccessScope, requestedSuc?: string | null) {
    const req = this.normalizeNullable(requestedSuc);

    if (this.hasGlobalScope(scope)) {
      return req ?? this.requireActorSuc(scope);
    }

    const actorSuc = this.requireActorSuc(scope);
    if (req == null) return actorSuc;
    if (req !== actorSuc) {
      throw new ForbiddenException(
        'El usuario no puede operar en una SUC distinta',
      );
    }
    return actorSuc;
  }

  private requireActorSuc(scope: AccessScope) {
    const suc = this.normalizeNullable(scope.suc);
    if (suc == null) {
      throw new ForbiddenException('Usuario sin SUC asignada');
    }
    return suc;
  }

  private async ensureUserWithinScope(
    scope: AccessScope,
    userId: number,
    expectedSuc?: string | null,
  ) {
    const user = await this.loadUserScope(userId);
    if (expectedSuc != null && user.suc !== expectedSuc) {
      throw new ForbiddenException('Usuario fuera de la SUC permitida');
    }
    if (!this.hasGlobalScope(scope)) {
      const scopeSuc = this.requireActorSuc(scope);
      if (user.suc !== scopeSuc) {
        throw new ForbiddenException('Usuario fuera de la SUC del manager');
      }
      if (
        scope.idDepto != null &&
        user.idDepto != null &&
        user.idDepto !== scope.idDepto
      ) {
        throw new ForbiddenException(
          'Usuario fuera del departamento permitido',
        );
      }
    }
    return user;
  }

  private async loadUserScope(idUsuario: number): Promise<UserScopeRow> {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        u.IDUSUARIO,
        u.SUC,
        TRY_CONVERT(INT, u.IDDEPTO) AS IDDEPTO
      FROM dbo.USUARIO u
      WHERE u.IDUSUARIO = @0
      `,
      [idUsuario],
    );

    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return {
      idUsuario: this.toInt(this.readValue(row, 'IDUSUARIO')) ?? idUsuario,
      suc: this.normalizeNullable(this.readString(row, 'SUC')),
      idDepto: this.toInt(this.readValue(row, 'IDDEPTO')),
    };
  }

  private async assertIncidenciaOwnership(
    idInc: number,
    targetUserId: number,
    targetSuc: string,
    scope: AccessScope,
  ) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 IDUSUARIO, SUC
      FROM dbo.ATT_INCIDENCIA
      WHERE IDINC = @0
      `,
      [idInc],
    );

    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException(
        'Incidencia no encontrada para adjuntar documento',
      );
    }

    const rowUserId = this.toInt(this.readValue(row, 'IDUSUARIO'));
    const rowSuc = this.readString(row, 'SUC');

    if (rowUserId !== targetUserId || rowSuc !== targetSuc) {
      throw new ForbiddenException(
        'La incidencia no corresponde al usuario/SUC indicados',
      );
    }

    if (!this.hasGlobalScope(scope) && rowSuc !== this.requireActorSuc(scope)) {
      throw new ForbiddenException('Incidencia fuera del alcance del usuario');
    }
  }

  private decodeBase64(input: string) {
    const raw = String(input ?? '').trim();
    if (!raw.length) {
      throw new BadRequestException('CONTENT_BASE64 es requerido');
    }

    const normalized = raw.includes(',') ? raw.split(',').pop() || '' : raw;

    let content: Buffer;
    try {
      content = Buffer.from(normalized, 'base64');
    } catch {
      throw new BadRequestException('CONTENT_BASE64 invalido');
    }

    if (!content.length) {
      throw new BadRequestException('Archivo decodificado vacio');
    }

    return content;
  }

  private sanitizeBody(body: unknown) {
    if (body == null) return null;
    if (typeof body !== 'object') return body;

    try {
      const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
      if ('CONTENT_BASE64' in clone) clone.CONTENT_BASE64 = '[REDACTED_BASE64]';
      if ('AUTH_PASSWORD' in clone) clone.AUTH_PASSWORD = '[REDACTED]';
      if ('password' in clone) clone.password = '[REDACTED]';
      if ('PASSWORD' in clone) clone.PASSWORD = '[REDACTED]';
      return clone;
    } catch {
      return null;
    }
  }

  private readValue(row: Record<string, unknown> | null, key: string) {
    if (!row) return null;
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];

    const lower = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, lower)) return row[lower];

    const upper = key.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(row, upper)) return row[upper];

    return null;
  }

  private readString(row: Record<string, unknown> | null, key: string) {
    const value = this.readValue(row, key);
    if (value == null) return null;
    const text = String(value).trim();
    return text.length ? text : null;
  }

  private readBuffer(value: unknown) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === 'string') return Buffer.from(value, 'base64');
    return Buffer.alloc(0);
  }

  private firstRow(rows: any[]): Record<string, unknown> | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const first = rows[0];
    if (first && typeof first === 'object') {
      return first as Record<string, unknown>;
    }
    return null;
  }

  private normalizeUpper(value: unknown) {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  private normalizeNullable(value: unknown) {
    const text = String(value ?? '').trim();
    return text.length ? text : null;
  }

  private toInt(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : null;
  }

  private toBool(value: unknown) {
    if (value == null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'si';
  }

  private toBit(value: unknown) {
    return this.toBool(value) ? 1 : 0;
  }

  private nullableBit(value: unknown) {
    if (value == null) return null;
    return this.toBool(value) ? 1 : 0;
  }

  private normalizePage(value: number | undefined, fallback: number) {
    const num = Number(value ?? fallback);
    if (!Number.isFinite(num) || num < 1) return fallback;
    return Math.trunc(num);
  }

  private normalizeLimit(value: number | undefined, fallback: number) {
    const num = Number(value ?? fallback);
    if (!Number.isFinite(num) || num < 1) return fallback;
    return Math.min(Math.trunc(num), 500);
  }

  private parseId(value: string, label: string) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException(`${label} invalido`);
    }
    return Math.trunc(id);
  }

  private throwMappedError(error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    const message = this.extractErrorMessage(error);
    const upper = this.normalizeUpper(message);

    if (
      upper.includes('SECUENCIA') ||
      upper.includes('VENTANA') ||
      upper.includes('GEOCERCA') ||
      upper.includes('LIVENESS') ||
      upper.includes('DUPLICADO') ||
      upper.includes('FUERA DE')
    ) {
      throw new ConflictException(message || 'Conflicto de reglas de marcaje');
    }

    if (
      upper.includes('NO PUEDE') ||
      upper.includes('NO AUTORIZ') ||
      upper.includes('PERMISO') ||
      upper.includes('FORBIDDEN')
    ) {
      throw new ForbiddenException(message || 'Operacion no permitida');
    }

    if (upper.includes('NO ENCONTR') || upper.includes('NOT FOUND')) {
      throw new NotFoundException(message || 'Recurso no encontrado');
    }

    throw new BadRequestException(message || 'Error al procesar la solicitud');
  }

  private extractErrorMessage(error: unknown) {
    if (error == null) return '';
    if (typeof error === 'string') return error;

    if (typeof error === 'object') {
      const asAny = error as Record<string, unknown>;
      const message = asAny.message;
      if (typeof message === 'string' && message.trim().length) {
        const marker = message.lastIndexOf('Error:');
        if (marker >= 0) {
          return message.substring(marker + 'Error:'.length).trim();
        }
        return message.trim();
      }
    }

    return String(error);
  }
}
