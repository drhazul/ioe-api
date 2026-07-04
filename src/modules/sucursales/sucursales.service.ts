import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DataSource, Repository } from 'typeorm';
import {
  buildCanonicalTimelogTimestampIso,
  buildTimelogVerificationHash,
} from '../asistencia/asistencia.service';
import { AdmsPushDto } from './dto/adms-push.dto';
import { CleanupComandosDto } from './dto/cleanup-comandos.dto';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { ImportUsbDto } from './dto/import-usb.dto';
import { KioscoVisitaDto } from './dto/kiosco-visita.dto';
import {
  SucursalCommandAction,
  SucursalCommandDto,
} from './dto/sucursal-command.dto';
import { SucursalEventDto } from './dto/sucursal-event.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { UploadAsistenciaFotoDto } from './dto/upload-asistencia-foto.dto';
import { AuthManagerService } from './auth-manager.service';
import {
  MarcajesRealtimeGateway,
  PunchRealtimePayload,
} from './marcajes-realtime.gateway';
import { SucursalEntity } from './sucursal.entity';

type RequestContext = {
  actorId: number | null;
  ip: string | null;
};

type DeviceStatus = {
  deviceId: string;
  lastSeenUtc: string;
  connected: boolean;
  secondsSinceLastSeen: number;
  minutesSinceLastSeen: number;
  timezone: string;
};

type PendingCommandsBySuc = Map<string, number>;

type NormalizedEvent = {
  idUsuario: number;
  tipo: string;
  authMethod: string;
  fechaIso: string;
  suc: string | null;
  deviceId: string | null;
  gpsCoordinates: string | null;
  temperature: number | null;
  verificationMode: string | null;
  verifyMode: number | null;
  securePin: string | null;
  fingerprintId: string | null;
  eventPhoto: string | null;
  isOffline: boolean;
};

@Injectable()
export class SucursalesService implements OnModuleInit {
  private readonly uploadsDir = path.resolve(
    process.cwd(),
    'uploads',
    'asistencia',
  );
  private readonly logger = new Logger(SucursalesService.name);
  private readonly visitorCleanupCronName = 'sucursales-visitor-photos-30d';

  constructor(
    @InjectRepository(SucursalEntity)
    private readonly repo: Repository<SucursalEntity>,
    private readonly dataSource: DataSource,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly authManager: AuthManagerService,
    private readonly realtimeGateway: MarcajesRealtimeGateway,
  ) {}

  async onModuleInit() {
    await this.ensureTelemetryColumns();
    this.ensureVisitorCleanupCronRegistered();
  }

  async findAll() {
    try {
      const rows = await this.repo.find({
        order: {
          id: 'ASC',
        },
      });

      const devicesBySuc = await this.loadDeviceStatusBySuc();
      const pendingBySuc = await this.loadPendingCommandsBySuc();

      return rows.map((row) => {
        const sucCode = this.normalizeNullable(row.codigo) ?? '';
        const devices = devicesBySuc.get(sucCode) ?? [];
        const connectedCount = devices.filter((d) => d.connected).length;
        const comandosPendientes = pendingBySuc.get(sucCode) ?? 0;

        return {
          ...row,
          dispositivosTotal: devices.length,
          dispositivosConectados: connectedCount,
          dispositivos: devices,
          comandosPendientes,
          direccion_completa: row.direccionCompleta ?? null,
          telefono: row.telefono ?? null,
          zona_horaria: row.zonaHoraria ?? null,
          id_externo_nomina: row.idExternoNomina ?? null,
          latitud: row.latitud ?? null,
          longitud: row.longitud ?? null,
          radio_metros: row.radioMetros ?? null,
          sucursal_token: row.sucursalToken ?? null,
          last_seen_at: row.lastSeenAt ?? null,
          is_offline:
            row.lastSeenAt == null
              ? true
              : Date.now() - row.lastSeenAt.getTime() > 5 * 60 * 1000,
        };
      });
    } catch (error) {
      console.error('ERROR EN SUCURSALES:', error);
      throw error;
    }
  }

  async create(dto: CreateSucursalDto) {
    try {
      const codigo = dto.codigo.trim().toUpperCase();
      const nombre = dto.nombre.trim();
      const empresa = dto.empresa.trim();
      const direccionCompleta = this.normalizeNullable(dto.direccion_completa);
      const telefono = this.normalizeNullable(dto.telefono);
      const idExternoNomina = this.normalizeNullable(dto.id_externo_nomina);

      this.validateGeofence(dto.latitud, dto.longitud, dto.radio_metros);

      const exists = await this.repo.exist({ where: { codigo } });
      if (exists) {
        throw new ConflictException(`El código ${codigo} ya existe`);
      }

      const entity = this.repo.create({
        codigo,
        nombre,
        empresa,
        direccionCompleta,
        telefono,
        idExternoNomina,
        estado: dto.estado ?? true,
        latitud: dto.latitud ?? null,
        longitud: dto.longitud ?? null,
        radioMetros: dto.radio_metros ?? null,
        sucursalToken: randomUUID(),
      });

      return await this.repo.save(entity);
    } catch (error) {
      console.error('ERROR EN SUCURSALES:', error);
      throw error;
    }
  }

  async update(id: number, dto: UpdateSucursalDto) {
    const current = await this.repo.findOne({ where: { id } });
    if (!current) {
      throw new NotFoundException(`Sucursal ${id} no existe`);
    }

    const nextCodigo =
      dto.codigo !== undefined
        ? dto.codigo.trim().toUpperCase()
        : (current.codigo ?? '');

    const nextNombre =
      dto.nombre !== undefined ? dto.nombre.trim() : (current.nombre ?? '');
    const nextEmpresa =
      dto.empresa !== undefined ? dto.empresa.trim() : (current.empresa ?? '');
    const nextDireccionCompleta =
      dto.direccion_completa !== undefined
        ? this.normalizeNullable(dto.direccion_completa)
        : current.direccionCompleta;
    const nextTelefono =
      dto.telefono !== undefined
        ? this.normalizeNullable(dto.telefono)
        : current.telefono;
    const nextIdExternoNomina =
      dto.id_externo_nomina !== undefined
        ? this.normalizeNullable(dto.id_externo_nomina)
        : current.idExternoNomina;

    const nextLat = dto.latitud !== undefined ? dto.latitud : current.latitud;
    const nextLon =
      dto.longitud !== undefined ? dto.longitud : current.longitud;
    const nextRadio =
      dto.radio_metros !== undefined ? dto.radio_metros : current.radioMetros;

    this.validateGeofence(
      nextLat ?? undefined,
      nextLon ?? undefined,
      nextRadio ?? undefined,
    );

    if (nextCodigo !== (current.codigo ?? '')) {
      const exists = await this.repo.exist({
        where: { codigo: nextCodigo },
      });
      if (exists) {
        throw new ConflictException(`El código ${nextCodigo} ya existe`);
      }
    }

    current.codigo = nextCodigo;
    current.nombre = nextNombre;
    current.empresa = nextEmpresa;
    current.direccionCompleta = nextDireccionCompleta ?? null;
    current.telefono = nextTelefono ?? null;
    current.idExternoNomina = nextIdExternoNomina ?? null;
    if (dto.estado !== undefined) current.estado = dto.estado;
    current.latitud = nextLat ?? null;
    current.longitud = nextLon ?? null;
    current.radioMetros = nextRadio ?? null;

    return this.repo.save(current);
  }

  async remove(id: number) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Sucursal ${id} no existe`);
    }
    row.estado = false;
    await this.repo.save(row);
    return { deleted: true, id, logical: true, estado: row.estado };
  }

  async getGeofence(codigoRaw: string) {
    const codigo = this.normalizeNullable(codigoRaw);
    if (codigo == null) throw new BadRequestException('Codigo requerido');

    const row = await this.repo.findOne({
      where: { codigo },
    });

    if (!row) throw new NotFoundException(`Sucursal ${codigo} no existe`);

    let latitud = row.latitud ?? null;
    let longitud = row.longitud ?? null;
    let radioMetros = row.radioMetros ?? null;

    // Fallback por policy existente del reloj-checador si sucursal aun no tiene geocerca.
    if (latitud == null || longitud == null || radioMetros == null) {
      const policyRows = await this.dataSource.query(
        `
        SELECT TOP 1
          p.GEOFENCE_LAT,
          p.GEOFENCE_LON,
          p.GEOFENCE_RADIUS_M
        FROM dbo.ATT_POLICY p
        WHERE UPPER(LTRIM(RTRIM(ISNULL(p.SUC, '')))) = @0
          AND p.ACTIVE = 1
        ORDER BY p.IDPOLICY DESC
        `,
        [codigo],
      );
      const policy = policyRows?.[0] as Record<string, unknown> | undefined;
      if (policy) {
        latitud =
          latitud ?? this.toNumber(this.readValue(policy, 'GEOFENCE_LAT'));
        longitud =
          longitud ?? this.toNumber(this.readValue(policy, 'GEOFENCE_LON'));
        radioMetros =
          radioMetros ??
          this.toInt(this.readValue(policy, 'GEOFENCE_RADIUS_M'));
      }
    }

    return {
      codigo,
      latitud,
      longitud,
      radioMetros,
      hasGeofence:
        latitud != null &&
        longitud != null &&
        radioMetros != null &&
        radioMetros > 0,
    };
  }

  async getOrCreateSucursalToken(codigoRaw: string, ctx: RequestContext) {
    const codigo = this.normalizeNullable(codigoRaw);
    if (codigo == null) {
      throw new BadRequestException('codigo requerido');
    }
    const row = await this.repo.findOne({ where: { codigo } });
    if (!row) {
      throw new NotFoundException(`Sucursal ${codigo} no existe`);
    }

    if (!(await this.sucursalTokenColumnExists())) {
      const fallbackToken = this.hashAsUuid(codigo);
      return {
        ok: true,
        codigo,
        sucursal_token: fallbackToken,
        persisted: false,
      };
    }

    if (this.normalizeNullable(row.sucursalToken) == null) {
      row.sucursalToken = randomUUID();
      await this.repo.save(row);
    }

    await this.logAudit({
      adminId: ctx.actorId,
      accion: 'SUCURSAL_TOKEN_GET',
      ip: ctx.ip,
      detalles: { codigo, persisted: true },
    });

    return {
      ok: true,
      codigo,
      sucursal_token: row.sucursalToken,
      persisted: true,
    };
  }

  async queueSucursalCommand(dto: SucursalCommandDto, ctx: RequestContext) {
    const suc = this.normalizeNullable(dto.suc);
    if (suc == null) {
      throw new BadRequestException('suc requerida');
    }
    if (!(await this.comandosTableExists())) {
      throw new BadRequestException(
        'COMANDOS_ADMS no existe. Ejecuta script 118.',
      );
    }

    const allowed = new Set<string>([
      SucursalCommandAction.REBOOT,
      SucursalCommandAction.UNLOCK,
      SucursalCommandAction.CLEAR_ADMIN,
      SucursalCommandAction.SYNC_USERS,
    ]);
    const commandAction = String(dto.command ?? '')
      .trim()
      .toUpperCase();
    if (!allowed.has(commandAction)) {
      throw new BadRequestException('Comando no permitido');
    }

    const explicitDevice = this.normalizeNullable(dto.device_id);
    const devices =
      explicitDevice != null
        ? [explicitDevice]
        : await this.resolveDeviceIdsForSuc(suc);

    let queued = 0;
    const now = new Date().toISOString();

    if (devices.length) {
      for (const deviceId of devices) {
        await this.enqueueCommand({
          deviceId,
          comando: `${commandAction}|SUC=${suc}|ORIGIN=TABLET|TS=${now}`,
          estado: 'PENDIENTE',
        });
        queued += 1;
      }
    } else {
      // Sin dispositivo detectado todavía: cola lógica por sucursal.
      await this.enqueueCommand({
        deviceId: `SUC:${suc}`,
        comando: `${commandAction}|SUC=${suc}|ORIGIN=TABLET|TS=${now}`,
        estado: 'PENDIENTE',
      });
      queued = 1;
    }

    await this.logAudit({
      adminId: ctx.actorId,
      accion: `SUC_CMD_${commandAction}`,
      ip: ctx.ip,
      detalles: {
        suc,
        queued,
        devices,
      },
    });

    return {
      ok: true,
      suc,
      command: commandAction,
      queued,
      devices,
    };
  }

  async listRecentCommands(codigoRaw: string, limitRaw: number) {
    const codigo = this.normalizeNullable(codigoRaw);
    if (codigo == null) throw new BadRequestException('codigo requerido');
    const limit = Number.isFinite(limitRaw)
      ? Math.min(20, Math.max(1, Math.trunc(limitRaw)))
      : 5;

    if (!(await this.comandosTableExists())) {
      return { ok: true, codigo, rows: [] as Array<Record<string, unknown>> };
    }

    const rows = await this.dataSource.query(
      `
      ;WITH device_suc AS (
        SELECT
          UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, '')))) AS DEVICE_ID,
          UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))) AS SUC,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))))
            ORDER BY tl.FCNR DESC
          ) AS rn
        FROM dbo.ATT_TIME_LOG tl
        WHERE NULLIF(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))), '') IS NOT NULL
      )
      SELECT TOP (${limit})
        c.dispositivo_id,
        c.comando,
        c.estado,
        c.fecha_creacion
      FROM dbo.COMANDOS_ADMS c
      LEFT JOIN device_suc ds
        ON ds.DEVICE_ID = UPPER(LTRIM(RTRIM(ISNULL(c.dispositivo_id, ''))))
       AND ds.rn = 1
      WHERE ds.SUC = @0 OR UPPER(LTRIM(RTRIM(ISNULL(c.dispositivo_id, '')))) = @1
      ORDER BY c.fecha_creacion DESC;
      `,
      [codigo, `SUC:${codigo}`],
    );

    return {
      ok: true,
      codigo,
      rows: ((rows as Record<string, unknown>[]) ?? []).map((row) => ({
        dispositivo_id: this.readString(row, 'dispositivo_id') ?? '',
        comando: this.readString(row, 'comando') ?? '',
        estado: this.readString(row, 'estado') ?? 'PENDIENTE',
        fecha_creacion: this.readValue(row, 'fecha_creacion'),
      })),
    };
  }

  async getSucursalConfig(codigoRaw: string) {
    const codigo = this.normalizeNullable(codigoRaw);
    if (codigo == null) throw new BadRequestException('codigo requerido');

    const sucursal = await this.repo.findOne({ where: { codigo } });
    if (!sucursal) {
      throw new NotFoundException(`Sucursal ${codigo} no existe`);
    }

    const tokenData = await this.getOrCreateSucursalToken(codigo, {
      actorId: null,
      ip: null,
    });

    const devices = await this.loadDeviceMetadataBySuc(codigo);
    const history = await this.listRecentCommands(codigo, 5);

    return {
      ok: true,
      sucursal: {
        id: sucursal.id,
        codigo: sucursal.codigo,
        nombre: sucursal.nombre,
        empresa: sucursal.empresa,
        estado: sucursal.estado,
        sucursal_token: tokenData.sucursal_token,
        last_seen_at: sucursal.lastSeenAt,
      },
      devices,
      comandos: history.rows,
    };
  }

  async cleanupComandos(dto: CleanupComandosDto, ctx: RequestContext) {
    const olderThanMinutes = dto.olderThanMinutes ?? 30;
    const suc = this.normalizeNullable(dto.suc);

    if (!(await this.comandosTableExists())) {
      return {
        ok: true,
        deleted: 0,
        suc,
        olderThanMinutes,
        actorId: ctx.actorId,
        message: 'Tabla COMANDOS_ADMS no existe. Ejecuta script 118.',
      };
    }

    const rows = await this.dataSource.query(
      `
      ;WITH device_suc AS (
        SELECT
          UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, '')))) AS DEVICE_ID,
          UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))) AS SUC,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))))
            ORDER BY tl.FCNR DESC
          ) AS rn
        FROM dbo.ATT_TIME_LOG tl
        WHERE NULLIF(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))), '') IS NOT NULL
      )
      DELETE c
      FROM dbo.COMANDOS_ADMS c
      LEFT JOIN device_suc ds
        ON ds.DEVICE_ID = UPPER(LTRIM(RTRIM(ISNULL(c.dispositivo_id, ''))))
       AND ds.rn = 1
      WHERE UPPER(LTRIM(RTRIM(ISNULL(c.estado, '')))) = 'PENDIENTE'
        AND (
          CASE
            WHEN c.fecha_creacion IS NULL THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), c.fecha_creacion) IS NULL THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), c.fecha_creacion) < '20000101' THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), c.fecha_creacion) >= '21000101' THEN 0
            ELSE DATEDIFF(MINUTE, c.fecha_creacion, GETDATE())
          END
        ) >= @0
        AND (@1 IS NULL OR ds.SUC = @1);

      SELECT @@ROWCOUNT AS DELETED;
      `,
      [olderThanMinutes, suc],
    );

    const deleted =
      this.toInt(this.readValue(rows?.[0] ?? null, 'DELETED')) ?? 0;

    return {
      ok: true,
      deleted,
      suc,
      olderThanMinutes,
      actorId: ctx.actorId,
    };
  }

  async importUsb(dto: ImportUsbDto, ctx: RequestContext) {
    return this.ingestEvents({
      events: dto.events,
      fallbackSuc: dto.suc,
      deviceId: null,
      timezone: 'America/Mexico_City',
      source: 'USB_IMPORT',
      ctx,
    });
  }

  async receiveAdmsPush(dto: AdmsPushDto, ctx: RequestContext) {
    const fallbackSuc = this.normalizeNullable(dto.suc);
    const token = this.normalizeNullable(dto.sucursal_token);
    if (fallbackSuc != null && token != null) {
      await this.validateSucursalToken(fallbackSuc, token);
    }

    const result = await this.ingestEvents({
      events: dto.events,
      fallbackSuc: dto.suc,
      deviceId: dto.deviceId,
      timezone: dto.timezone ?? 'America/Mexico_City',
      source: 'ADMS_PUSH',
      ctx,
    });

    const sucsToTouch = new Set<string>();
    if (fallbackSuc != null) sucsToTouch.add(fallbackSuc);
    for (const event of dto.events ?? []) {
      const suc = this.normalizeNullable(event?.suc);
      if (suc != null) sucsToTouch.add(suc);
    }
    for (const suc of sucsToTouch) {
      await this.touchSucursalLastSeen(suc);
    }

    if (dto.deviceId) {
      await this.markPendingCommandsAsSent(dto.deviceId);
    }

    return {
      ...result,
      deviceId: dto.deviceId,
      timezone: dto.timezone ?? 'America/Mexico_City',
    };
  }

  async registerKioscoVisita(dto: KioscoVisitaDto, ctx: RequestContext) {
    const suc = this.normalizeNullable(dto.suc);
    const terminalId = this.normalizeNullable(dto.terminal_id);
    const qr = String(dto.qr ?? '').trim();
    const eventPhoto = String(dto.event_photo ?? '').trim();
    if (!qr.length) {
      throw new BadRequestException('qr requerido');
    }
    if (!eventPhoto.length) {
      throw new BadRequestException('event_photo requerido');
    }
    if (suc == null) {
      throw new BadRequestException('suc requerida');
    }

    const eventDate = dto.punch_time
      ? this.normalizeDateToIso(dto.punch_time)
      : this.normalizeDateToIso(new Date().toISOString());

    await this.insertMarcajeRecord({
      idUsuario: null,
      idTimeLog: null,
      suc,
      tipo: 'VISITA',
      fechaIso: eventDate,
      terminalId,
      eventPhoto,
      expedientePhoto: null,
      bodyTemp:
        dto.body_temp != null && Number.isFinite(Number(dto.body_temp))
          ? Number(dto.body_temp)
          : null,
      verifyMode:
        dto.verify_mode != null && Number.isFinite(Number(dto.verify_mode))
          ? Math.trunc(Number(dto.verify_mode))
          : 3,
      verifyModeLabel: 'PIN',
      gpsCoordinates: this.normalizeNullable(dto.gps_coordinates),
      isOffline: dto.is_offline === true,
      pinText: null,
      source: 'KIOSCO_VISITA',
      requiresReview: false,
      silentAlert: false,
    });

    this.realtimeGateway.emitNewPunch({
      idTimeLog: null,
      idUsuario: null,
      suc,
      tipo: 'VISITA',
      punchTime: eventDate,
      terminalId,
      eventPhoto,
      expedientePhoto: null,
      bodyTemp:
        dto.body_temp != null && Number.isFinite(Number(dto.body_temp))
          ? Number(dto.body_temp)
          : null,
      verifyMode:
        dto.verify_mode != null && Number.isFinite(Number(dto.verify_mode))
          ? Math.trunc(Number(dto.verify_mode))
          : 3,
      verifyModeLabel: 'PIN',
      isOffline: dto.is_offline === true,
      requiresReview: false,
      silentAlert: false,
      source: 'KIOSCO_VISITA',
    });

    return {
      ok: true,
      message: 'Visita registrada en terminal kiosco',
      suc,
      terminalId,
      qr,
      eventPhoto,
      actorId: ctx.actorId,
      ip: ctx.ip,
    };
  }

  async syncArea(sucRaw: string, ctx: RequestContext) {
    const suc = this.normalizeNullable(sucRaw);
    if (suc == null) {
      throw new BadRequestException('SUC es requerida');
    }

    const areaExistsRows = await this.dataSource.query(
      `
      SELECT TOP 1 SUC
      FROM dbo.DAT_SUC
      WHERE UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @0
      `,
      [suc],
    );
    if (!areaExistsRows?.length) {
      throw new NotFoundException(`SUC ${suc} no existe en DAT_SUC`);
    }

    const userCountRows = await this.dataSource.query(
      `
      SELECT COUNT(1) AS TOTAL
      FROM dbo.USUARIO u
      WHERE UPPER(LTRIM(RTRIM(ISNULL(u.SUC, '')))) = @0
      `,
      [suc],
    );
    const empleadosArea =
      this.toInt(this.readValue(userCountRows?.[0] ?? null, 'TOTAL')) ?? 0;

    const deviceIds = await this.resolveDeviceIdsForSuc(suc);
    let comandosCreados = 0;

    if (await this.comandosTableExists()) {
      for (const deviceId of deviceIds) {
        await this.enqueueCommand({
          deviceId,
          comando: `SYNC_AREA|SUC=${suc}|EMPLEADOS=${empleadosArea}`,
          estado: 'PENDIENTE',
        });
        comandosCreados += 1;
      }
    }

    const updatedDevices = 0;

    return {
      ok: true,
      suc,
      empleadosArea,
      dispositivosDetectados: deviceIds.length,
      comandosCreados,
      updatedDevices,
      actorId: ctx.actorId,
      message:
        comandosCreados > 0
          ? 'Sincronizacion proactiva en cola ADMS'
          : 'Sin dispositivos detectados para esa sucursal',
    };
  }

  async uploadAsistenciaFoto(
    dto: UploadAsistenciaFotoDto,
    file: any,
    ctx: RequestContext,
  ) {
    const idUsuario = Number(dto.idUsuario);
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      throw new BadRequestException('idUsuario invalido');
    }

    const payload = this.resolvePhotoPayload(dto, file);
    await fs.mkdir(this.uploadsDir, { recursive: true });

    const extension = this.resolvePhotoExtension(
      payload.mimeType,
      dto.fileName,
    );
    const safeFileName = `${Date.now()}_${idUsuario}_${randomUUID()}.${extension}`;
    const absolutePath = path.join(this.uploadsDir, safeFileName);
    const relativePath = path.join('uploads', 'asistencia', safeFileName);

    await fs.writeFile(absolutePath, payload.buffer);
    const sha256 = createHash('sha256').update(payload.buffer).digest('hex');

    const suc =
      this.normalizeNullable(dto.suc) ??
      (await this.resolveUserSuc(idUsuario, new Map<number, string | null>()));

    if (suc == null) {
      throw new BadRequestException(
        'No se pudo resolver sucursal para registrar foto',
      );
    }

    const insertRows = await this.dataSource.query(
      `
      IF OBJECT_ID('dbo.ATT_ASISTENCIA_FOTO', 'U') IS NULL
      BEGIN
        THROW 56001, 'No existe dbo.ATT_ASISTENCIA_FOTO. Ejecuta script 119.', 1;
      END

      INSERT INTO dbo.ATT_ASISTENCIA_FOTO (
        id_timelog,
        id_usuario,
        suc,
        ruta_archivo,
        mime_type,
        sha256,
        fecha_creacion
      )
      VALUES (
        @0,
        @1,
        @2,
        @3,
        @4,
        @5,
        GETDATE()
      );

      SELECT SCOPE_IDENTITY() AS ID_FOTO;
      `,
      [
        dto.idTimelog ?? null,
        idUsuario,
        suc,
        relativePath.replaceAll('\\', '/'),
        payload.mimeType,
        sha256,
      ],
    );

    return {
      ok: true,
      idFoto: this.toInt(this.readValue(insertRows?.[0] ?? null, 'ID_FOTO')),
      idUsuario,
      suc,
      rutaArchivo: relativePath.replaceAll('\\', '/'),
      mimeType: payload.mimeType,
      sha256,
      actorId: ctx.actorId,
      ip: ctx.ip,
    };
  }

  async cleanupAsistenciaFotos(days: number, ctx: RequestContext) {
    const safeDays = Number.isFinite(days) && days > 0 ? Math.trunc(days) : 90;

    const rows = await this.dataSource.query(
      `
      IF OBJECT_ID('dbo.ATT_ASISTENCIA_FOTO', 'U') IS NULL
      BEGIN
        SELECT CAST(NULL AS INT) AS id, CAST(NULL AS VARCHAR(500)) AS ruta_archivo
        WHERE 1 = 0;
        RETURN;
      END

      SELECT
        f.id,
        f.ruta_archivo
      FROM dbo.ATT_ASISTENCIA_FOTO f
      WHERE f.fecha_creacion < DATEADD(DAY, -@0, GETDATE());
      `,
      [safeDays],
    );

    const files = (rows as Record<string, unknown>[]) ?? [];
    for (const row of files) {
      const relative = String(this.readValue(row, 'ruta_archivo') ?? '').trim();
      if (!relative.length) continue;
      const absolute = path.resolve(process.cwd(), relative);
      try {
        await fs.unlink(absolute);
      } catch {
        // archivo no existe o no se pudo borrar, continuamos
      }
    }

    const deleteRows = await this.dataSource.query(
      `
      IF OBJECT_ID('dbo.ATT_ASISTENCIA_FOTO', 'U') IS NULL
      BEGIN
        SELECT 0 AS DELETED;
        RETURN;
      END

      DELETE FROM dbo.ATT_ASISTENCIA_FOTO
      WHERE fecha_creacion < DATEADD(DAY, -@0, GETDATE());

      SELECT @@ROWCOUNT AS DELETED;
      `,
      [safeDays],
    );

    const deleted =
      this.toInt(this.readValue(deleteRows?.[0] ?? null, 'DELETED')) ?? 0;

    return {
      ok: true,
      deleted,
      days: safeDays,
      actorId: ctx.actorId,
      ip: ctx.ip,
    };
  }

  private async ingestEvents(input: {
    events: SucursalEventDto[];
    fallbackSuc?: string;
    deviceId?: string | null;
    timezone: string;
    source: 'USB_IMPORT' | 'ADMS_PUSH';
    ctx: RequestContext;
  }) {
    const fallbackSuc = this.normalizeNullable(input.fallbackSuc);
    const fallbackDevice = this.normalizeNullable(input.deviceId ?? null);
    const timezone = this.normalizeTimezone(input.timezone);
    const userSucCache = new Map<number, string | null>();

    let inserted = 0;
    let skippedDuplicate = 0;
    let skippedScope = 0;
    let securePinRejected = 0;
    let duressAlerts = 0;
    let invalid = 0;
    const errors: string[] = [];

    for (const event of input.events) {
      try {
        const rawUserId = Number(event.idUsuario);
        if (!Number.isFinite(rawUserId) || rawUserId <= 0) {
          throw new BadRequestException('idUsuario invalido');
        }
        const userId = Math.trunc(rawUserId);

        const userSuc = await this.resolveUserSuc(userId, userSucCache);
        const targetSuc =
          this.normalizeNullable(event.suc) ??
          fallbackSuc ??
          this.normalizeNullable(userSuc);
        const normalized = await this.normalizeEvent(
          event,
          fallbackDevice,
          targetSuc,
        );

        if (targetSuc == null || userSuc == null) {
          skippedScope += 1;
          continue;
        }

        // Segregacion por area: empleado solo sincroniza en su sucursal.
        if (userSuc !== targetSuc) {
          skippedScope += 1;
          continue;
        }

        const securePinValidation = await this.authManager.validateSecurePin({
          idUsuario: normalized.idUsuario,
          securePin: normalized.securePin,
        });
        if (!securePinValidation.accepted) {
          securePinRejected += 1;
          errors.push(securePinValidation.reason ?? 'PIN seguro inválido');
          continue;
        }

        const duress = await this.authManager.detectDuressFingerprint({
          idUsuario: normalized.idUsuario,
          fingerprintId: normalized.fingerprintId,
        });

        const duplicated = await this.existsDuplicatedTimelog({
          idUsuario: normalized.idUsuario,
          tipo: normalized.tipo,
          fechaIso: normalized.fechaIso,
          suc: targetSuc,
        });
        if (duplicated) {
          skippedDuplicate += 1;
          continue;
        }

        const saved = await this.insertTimelog({
          idUsuario: normalized.idUsuario,
          suc: targetSuc,
          tipo: normalized.tipo,
          fechaIso: normalized.fechaIso,
          authMethod: normalized.authMethod,
          deviceId: normalized.deviceId,
          gpsCoordinates: normalized.gpsCoordinates,
          temperature: normalized.temperature,
          verificationMode: normalized.verificationMode,
          verifyMode: normalized.verifyMode,
          eventPhoto: normalized.eventPhoto,
          isOffline: normalized.isOffline,
          timezone,
          source: input.source,
          ip: input.ctx.ip,
          silentAlert: duress.isDuress,
        });

        const payload: PunchRealtimePayload = {
          idTimeLog: saved.idTimeLog,
          idUsuario: normalized.idUsuario,
          suc: targetSuc,
          tipo: normalized.tipo,
          punchTime: normalized.fechaIso,
          terminalId: normalized.deviceId,
          eventPhoto: normalized.eventPhoto,
          expedientePhoto: null,
          bodyTemp: normalized.temperature,
          verifyMode: normalized.verifyMode,
          verifyModeLabel: normalized.verificationMode,
          isOffline: normalized.isOffline,
          requiresReview: saved.requiresReview,
          silentAlert: duress.isDuress,
          source: input.source,
        };
        this.realtimeGateway.emitNewPunch(payload);
        if (duress.isDuress) {
          duressAlerts += 1;
          this.realtimeGateway.emitSilentAlert({
            ...payload,
            reason: duress.reason ?? 'Huella de coacción detectada',
          });
          await this.persistSilentAlert({
            idUsuario: normalized.idUsuario,
            suc: targetSuc,
            mensaje:
              duress.reason ?? 'Huella de coacción detectada en terminal',
          });
        }

        inserted += 1;
      } catch (error) {
        invalid += 1;
        errors.push(this.extractError(error));
      }
    }

    return {
      ok: true,
      source: input.source,
      timezone,
      summary: {
        total: input.events.length,
        inserted,
        skippedDuplicate,
        skippedScope,
        securePinRejected,
        duressAlerts,
        invalid,
      },
      errors: errors.slice(0, 20),
    };
  }

  private async loadDeviceStatusBySuc() {
    const rows = await this.dataSource.query(
      `
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))) AS SUC,
        UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, '')))) AS DEVICE_ID,
        MAX(tl.FCNR) AS LAST_SEEN_UTC
      FROM dbo.ATT_TIME_LOG tl
      WHERE NULLIF(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))), '') IS NOT NULL
      GROUP BY
        UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))),
        UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))))
      ORDER BY SUC ASC, DEVICE_ID ASC;
      `,
    );

    const map = new Map<string, DeviceStatus[]>();
    const nowMs = Date.now();

    for (const row of rows as Record<string, unknown>[]) {
      const suc = this.normalizeNullable(this.readString(row, 'SUC'));
      const deviceId = this.normalizeNullable(
        this.readString(row, 'DEVICE_ID'),
      );
      const lastSeenRaw = this.readValue(row, 'LAST_SEEN_UTC');

      if (suc == null || deviceId == null || lastSeenRaw == null) continue;

      const lastDate = new Date(lastSeenRaw as string);
      if (Number.isNaN(lastDate.getTime())) continue;

      const minutesSince = Math.max(
        0,
        Math.floor((nowMs - lastDate.getTime()) / 60000),
      );
      const secondsSince = Math.max(
        0,
        Math.floor((nowMs - lastDate.getTime()) / 1000),
      );
      const status: DeviceStatus = {
        deviceId,
        lastSeenUtc: lastDate.toISOString(),
        connected: secondsSince <= 300,
        secondsSinceLastSeen: secondsSince,
        minutesSinceLastSeen: minutesSince,
        timezone: 'America/Mexico_City',
      };

      const bucket = map.get(suc) ?? [];
      bucket.push(status);
      map.set(suc, bucket);
    }

    return map;
  }

  private async loadPendingCommandsBySuc(): Promise<PendingCommandsBySuc> {
    if (!(await this.comandosTableExists())) {
      return new Map<string, number>();
    }

    const rows = await this.dataSource.query(
      `
      ;WITH device_suc AS (
        SELECT
          UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, '')))) AS DEVICE_ID,
          UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))) AS SUC,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))))
            ORDER BY tl.FCNR DESC
          ) AS rn
        FROM dbo.ATT_TIME_LOG tl
        WHERE NULLIF(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))), '') IS NOT NULL
      )
      SELECT
        ds.SUC,
        COUNT(1) AS PENDIENTES
      FROM dbo.COMANDOS_ADMS c
      INNER JOIN device_suc ds
        ON ds.DEVICE_ID = UPPER(LTRIM(RTRIM(ISNULL(c.dispositivo_id, ''))))
       AND ds.rn = 1
      WHERE UPPER(LTRIM(RTRIM(ISNULL(c.estado, '')))) = 'PENDIENTE'
      GROUP BY ds.SUC;
      `,
    );

    const map = new Map<string, number>();
    for (const row of (rows as Record<string, unknown>[]) ?? []) {
      const suc = this.normalizeNullable(this.readString(row, 'SUC'));
      const pending = this.toInt(this.readValue(row, 'PENDIENTES')) ?? 0;
      if (suc != null) map.set(suc, pending);
    }
    return map;
  }

  private async resolveUserSuc(
    idUsuario: number,
    cache: Map<number, string | null>,
  ) {
    if (cache.has(idUsuario)) return cache.get(idUsuario) ?? null;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 UPPER(LTRIM(RTRIM(ISNULL(u.SUC, '')))) AS SUC
      FROM dbo.USUARIO u
      WHERE u.IDUSUARIO = @0
      `,
      [idUsuario],
    );
    const row = rows?.[0] as Record<string, unknown> | undefined;
    const suc = this.normalizeNullable(this.readString(row ?? null, 'SUC'));
    cache.set(idUsuario, suc);
    return suc;
  }

  private async normalizeEvent(
    event: SucursalEventDto,
    fallbackDevice?: string | null,
    targetSucHint?: string | null,
  ): Promise<NormalizedEvent> {
    const idUsuario = Number(event.idUsuario);
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) {
      throw new BadRequestException('idUsuario invalido');
    }

    const fechaIso = this.normalizeDateToIso(event.fecha);
    const tipo = await this.resolveTipoAutoClassified(
      event.tipo,
      Math.trunc(idUsuario),
      targetSucHint,
      fechaIso,
    );
    const verifyMode = this.normalizeVerifyModeInt(event.verifyMode);
    const verificationMode = this.normalizeVerificationMode(
      event.verificationMode,
      verifyMode,
    );
    const authMethod = this.normalizeAuthMethod(event.authMethod);
    const suc = this.normalizeNullable(event.suc);
    const deviceId =
      this.normalizeNullable(event.deviceId) ??
      this.normalizeNullable(fallbackDevice ?? null);
    const gpsCoordinates = this.normalizeNullable(event.gpsCoordinates);
    const temperature =
      event.temperature != null && Number.isFinite(Number(event.temperature))
        ? Number(event.temperature)
        : null;
    const securePin = this.normalizeNullable(event.securePin);
    const fingerprintId = this.normalizeNullable(event.fingerprintId);
    const eventPhoto = this.normalizeCaseSensitiveText(event.eventPhoto);
    const isOffline = event.isOffline === true;

    return {
      idUsuario: Math.trunc(idUsuario),
      tipo,
      authMethod,
      fechaIso,
      suc,
      deviceId,
      gpsCoordinates,
      temperature,
      verificationMode,
      verifyMode,
      securePin,
      fingerprintId,
      eventPhoto,
      isOffline,
    };
  }

  private async existsDuplicatedTimelog(input: {
    idUsuario: number;
    tipo: string;
    fechaIso: string;
    suc: string;
  }) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 tl.IDTIMELOG
      FROM dbo.ATT_TIME_LOG tl
      WHERE tl.IDUSUARIO = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(tl.TIPO, '')))) = @1
        AND UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))) = @2
        AND tl.FCNR >= '20000101'
        AND tl.FCNR < '21000101'
        AND TRY_CONVERT(DATETIME2(0), @3, 126) >= '20000101'
        AND TRY_CONVERT(DATETIME2(0), @3, 126) < '21000101'
        AND (
          CASE
            WHEN tl.FCNR IS NULL THEN 0
            WHEN tl.FCNR < '20000101' THEN 0
            WHEN tl.FCNR >= '21000101' THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), @3, 126) IS NULL THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), @3, 126) < '20000101' THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), @3, 126) >= '21000101' THEN 0
            ELSE ABS(
              DATEDIFF(
                SECOND,
                tl.FCNR,
                TRY_CONVERT(DATETIME2(0), @3, 126)
              )
            )
          END
        ) <= 300;
      `,
      [input.idUsuario, input.tipo, input.suc, input.fechaIso],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async insertTimelog(input: {
    idUsuario: number;
    suc: string;
    tipo: string;
    fechaIso: string;
    authMethod: string;
    deviceId: string | null;
    gpsCoordinates: string | null;
    temperature: number | null;
    verificationMode: string | null;
    verifyMode: number | null;
    eventPhoto: string | null;
    isOffline: boolean;
    timezone: string;
    source: 'USB_IMPORT' | 'ADMS_PUSH';
    ip: string | null;
    silentAlert: boolean;
  }) {
    const gps = this.parseGpsCoordinates(input.gpsCoordinates);
    const lat = gps?.lat ?? null;
    const lon = gps?.lon ?? null;
    const geoReview = await this.resolveRequiresReview({
      idUsuario: input.idUsuario,
      suc: input.suc,
      lat,
      lon,
      referenceDateIso: input.fechaIso,
    });
    const verificationMode =
      input.verificationMode ??
      this.verificationModeFromCode(input.verifyMode) ??
      null;
    const authMethod = this.resolveAuthMethod(
      input.authMethod,
      verificationMode,
    );
    const verifyMode =
      this.normalizeVerifyModeInt(input.verifyMode) ??
      this.verifyModeFromLabel(verificationMode) ??
      this.verifyModeFromLabel(authMethod) ??
      3;
    const pinText = await this.resolveMarcajePinByUsuario(input.idUsuario);
    const notes = this.composeIngestNotes(input.source, {
      timezone: input.timezone,
      verificationMode,
      temperature: input.temperature,
      gpsCoordinates: input.gpsCoordinates,
      requiresReview: geoReview.requiresReview,
      distanceM: geoReview.distanceM,
      commissionBypass: geoReview.commissionBypass,
      silentAlert: input.silentAlert,
    });
    const canonicalTimestampIso = buildCanonicalTimelogTimestampIso(
      input.fechaIso,
    );
    const hashVerificacion = buildTimelogVerificationHash({
      idUsuario: input.idUsuario,
      timestampIso: canonicalTimestampIso,
      tipoEvento: input.tipo,
      lat,
      lon,
    });

    const rows = await this.dataSource.query(
      `
      DECLARE @fechaUtc DATETIME2(0) = TRY_CONVERT(DATETIME2(0), @0, 127);
      DECLARE @inserted TABLE (IDTIMELOG BIGINT);

      INSERT INTO dbo.ATT_TIME_LOG (
        IDUSUARIO,
        SUC,
        TIPO,
        FCNR,
        AUTH_METHOD,
        LIVENESS_OK,
        LAT,
        LON,
        DEVICE_ID,
        CLIENT_IP,
        NOTES,
        hash_verificacion,
        WITHIN_GEOFENCE,
        LOCKED
      )
      OUTPUT INSERTED.IDTIMELOG INTO @inserted (IDTIMELOG)
      VALUES (
        @1,
        @2,
        @3,
        @fechaUtc,
        @4,
        0,
        @5,
        @6,
        @7,
        @8,
        @9,
        @10,
        @11,
        1
      );

      SELECT TOP 1 IDTIMELOG FROM @inserted;
      `,
      [
        canonicalTimestampIso,
        input.idUsuario,
        input.suc,
        input.tipo,
        authMethod,
        lat,
        lon,
        input.deviceId,
        input.ip,
        notes,
        hashVerificacion,
        geoReview.requiresReview ? 0 : 1,
      ],
    );
    const idTimeLog =
      this.toInt(this.readValue(rows?.[0] ?? null, 'IDTIMELOG')) ?? null;
    if (idTimeLog != null) {
      await this.applyRequiresReviewFlag(idTimeLog, geoReview.requiresReview);
    }

    await this.insertMarcajeRecord({
      idUsuario: input.idUsuario,
      idTimeLog,
      suc: input.suc,
      tipo: input.tipo,
      fechaIso: input.fechaIso,
      terminalId: input.deviceId,
      eventPhoto: input.eventPhoto,
      expedientePhoto: null,
      bodyTemp: input.temperature,
      verifyMode,
      verifyModeLabel: verificationMode,
      gpsCoordinates: input.gpsCoordinates,
      isOffline: input.isOffline,
      pinText,
      source: input.source,
      requiresReview: geoReview.requiresReview,
      silentAlert: input.silentAlert,
    });

    return {
      idTimeLog,
      requiresReview: geoReview.requiresReview,
      distanceM: geoReview.distanceM,
      commissionBypass: geoReview.commissionBypass,
    };
  }

  private async insertMarcajeRecord(input: {
    idUsuario: number | null;
    idTimeLog: number | null;
    suc: string | null;
    tipo: string | null;
    fechaIso: string;
    terminalId: string | null;
    eventPhoto: string | null;
    expedientePhoto: string | null;
    bodyTemp: number | null;
    verifyMode: number | null;
    verifyModeLabel: string | null;
    gpsCoordinates: string | null;
    isOffline: boolean;
    pinText: string | null;
    source: 'USB_IMPORT' | 'ADMS_PUSH' | 'KIOSCO_VISITA' | 'SELF_SERVICE';
    requiresReview: boolean;
    silentAlert: boolean;
  }) {
    if (!(await this.marcajesTableExists())) return;

    const gps = this.parseGpsCoordinates(input.gpsCoordinates);
    const lat = gps?.lat ?? null;
    const lon = gps?.lon ?? null;

    await this.dataSource.query(
      `
      IF COL_LENGTH('dbo.MARCAJES', 'pin') IS NULL
      BEGIN
        INSERT INTO dbo.MARCAJES (
          punch_time,
          terminal_id,
          event_photo,
          expediente_photo,
          body_temp,
          verify_mode,
          verify_mode_label,
          gps_location,
          is_offline,
          id_usuario,
          suc,
          tipo,
          id_timelog,
          requires_review,
          silent_alert,
          source,
          created_at
        )
        VALUES (
          CONVERT(DATETIME2(0), @0, 126),
          @1,
          @2,
          @3,
          @4,
          @5,
          @6,
          CASE
            WHEN @7 IS NULL OR @8 IS NULL THEN NULL
            ELSE geography::Point(@7, @8, 4326)
          END,
          @9,
          @10,
          @11,
          @12,
          @13,
          @14,
          @15,
          @16,
          GETDATE()
        );
      END
      ELSE
      BEGIN
        INSERT INTO dbo.MARCAJES (
          punch_time,
          terminal_id,
          event_photo,
          expediente_photo,
          body_temp,
          verify_mode,
          verify_mode_label,
          gps_location,
          is_offline,
          id_usuario,
          suc,
          tipo,
          id_timelog,
          requires_review,
          silent_alert,
          source,
          created_at,
          pin
        )
        VALUES (
          CONVERT(DATETIME2(0), @0, 126),
          @1,
          @2,
          @3,
          @4,
          @5,
          @6,
          CASE
            WHEN @7 IS NULL OR @8 IS NULL THEN NULL
            ELSE geography::Point(@7, @8, 4326)
          END,
          @9,
          @10,
          @11,
          @12,
          @13,
          @14,
          @15,
          @16,
          GETDATE(),
          CONVERT(VARCHAR(255), @17)
        );
      END
      `,
      [
        input.fechaIso,
        input.terminalId,
        input.eventPhoto,
        input.expedientePhoto,
        input.bodyTemp,
        input.verifyMode,
        input.verifyModeLabel,
        lat,
        lon,
        input.isOffline ? 1 : 0,
        input.idUsuario,
        input.suc,
        input.tipo,
        input.idTimeLog,
        input.requiresReview ? 1 : 0,
        input.silentAlert ? 1 : 0,
        input.source,
        input.pinText,
      ],
    );
  }

  private async resolveMarcajePinByUsuario(idUsuario: number | null) {
    const userId = Number(idUsuario ?? 0);
    if (!Number.isFinite(userId) || userId <= 0) return null;

    const rows = await this.dataSource.query(
      `
      IF OBJECT_ID('dbo.COLABORADORES', 'U') IS NULL
      BEGIN
        SELECT CAST(NULL AS VARCHAR(255)) AS pin;
        RETURN;
      END

      SELECT TOP 1 LTRIM(RTRIM(ISNULL(c.pin, ''))) AS pin
      FROM dbo.COLABORADORES c
      LEFT JOIN dbo.USUARIO u
        ON u.IDUSUARIO = @0
      WHERE c.id = @0
         OR (
              COL_LENGTH('dbo.COLABORADORES', 'id_empleado') IS NOT NULL
              AND u.USERNAME IS NOT NULL
              AND UPPER(LTRIM(RTRIM(ISNULL(c.id_empleado, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, ''))))
            )
      ORDER BY
        CASE WHEN c.id = @0 THEN 0 ELSE 1 END,
        c.id ASC;
      `,
      [userId],
    );

    const value = String(rows?.[0]?.pin ?? rows?.[0]?.PIN ?? '').trim();
    return value.length ? value : null;
  }

  private async marcajesTableExists() {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN OBJECT_ID('dbo.MARCAJES', 'U') IS NULL THEN 0 ELSE 1 END AS EXISTS_FLAG
      `,
    );
    const exists = this.toInt(this.readValue(rows?.[0] ?? null, 'EXISTS_FLAG'));
    return exists === 1;
  }

  private async persistSilentAlert(input: {
    idUsuario: number;
    suc: string;
    mensaje: string;
  }) {
    const existsRows = await this.dataSource.query(
      `
      SELECT CASE WHEN OBJECT_ID('dbo.ATT_ALERTA', 'U') IS NULL THEN 0 ELSE 1 END AS EXISTS_FLAG
      `,
    );
    const exists =
      this.toInt(this.readValue(existsRows?.[0] ?? null, 'EXISTS_FLAG')) === 1;
    if (!exists) return;

    await this.dataSource.query(
      `
      INSERT INTO dbo.ATT_ALERTA (
        IDUSUARIO,
        SUC,
        TIPO,
        MESSAGE,
        METADATA_JSON
      )
      VALUES (
        @0,
        @1,
        'COACCION',
        @2,
        @3
      );
      `,
      [
        input.idUsuario,
        input.suc,
        input.mensaje.substring(0, 250),
        JSON.stringify({ source: 'ADMS_PUSH', silent: true }),
      ],
    );
  }

  private ensureVisitorCleanupCronRegistered() {
    let job: CronJob | null = null;
    try {
      job = this.schedulerRegistry.getCronJob(this.visitorCleanupCronName);
    } catch {
      job = null;
    }

    if (job == null) {
      const newJob = new CronJob(
        '30 2 * * *',
        () => {
          void this.runVisitorPhotoCleanupCron();
        },
        null,
        false,
        'America/Mexico_City',
      );
      this.schedulerRegistry.addCronJob(this.visitorCleanupCronName, newJob);
      newJob.start();
      this.logger.log(
        `Cron registrado: ${this.visitorCleanupCronName} (02:30 America/Mexico_City)`,
      );
      return;
    }

    job.start();
    this.logger.log(
      `Cron ya existente y activo: ${this.visitorCleanupCronName} (02:30 America/Mexico_City)`,
    );
  }

  private async runVisitorPhotoCleanupCron() {
    try {
      const result = await this.cleanupAsistenciaFotos(30, {
        actorId: null,
        ip: null,
      });
      this.logger.log(
        `Limpieza auto fotos visitante ejecutada. eliminadas=${result.deleted}`,
      );
    } catch (error) {
      this.logger.error(
        `Limpieza auto fotos visitante falló: ${this.extractError(error)}`,
      );
    }
  }

  private async ensureTelemetryColumns() {
    try {
      await this.dataSource.query(
        `
        IF OBJECT_ID('dbo.SUCURSALES', 'U') IS NULL RETURN;

        IF COL_LENGTH('dbo.SUCURSALES', 'sucursal_token') IS NULL
          ALTER TABLE dbo.SUCURSALES ADD sucursal_token VARCHAR(64) NULL;

        IF COL_LENGTH('dbo.SUCURSALES', 'last_seen_at') IS NULL
          ALTER TABLE dbo.SUCURSALES ADD last_seen_at DATETIME2(0) NULL;
        `,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo asegurar columnas de telemetria SUCURSALES: ${this.extractError(error)}`,
      );
    }
  }

  private async sucursalTokenColumnExists() {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN COL_LENGTH('dbo.SUCURSALES', 'sucursal_token') IS NULL THEN 0 ELSE 1 END AS EXISTS_FLAG
      `,
    );
    return (
      (this.toInt(this.readValue(rows?.[0] ?? null, 'EXISTS_FLAG')) ?? 0) === 1
    );
  }

  private async lastSeenColumnExists() {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN COL_LENGTH('dbo.SUCURSALES', 'last_seen_at') IS NULL THEN 0 ELSE 1 END AS EXISTS_FLAG
      `,
    );
    return (
      (this.toInt(this.readValue(rows?.[0] ?? null, 'EXISTS_FLAG')) ?? 0) === 1
    );
  }

  private async validateSucursalToken(suc: string, token: string) {
    if (!(await this.sucursalTokenColumnExists())) return;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 sucursal_token
      FROM dbo.SUCURSALES
      WHERE UPPER(LTRIM(RTRIM(ISNULL(codigo, '')))) = @0;
      `,
      [suc],
    );
    const current = this.normalizeNullable(
      this.readString(rows?.[0] ?? null, 'sucursal_token'),
    );
    if (current == null) return;
    if (current !== token) {
      throw new BadRequestException('sucursal_token invalido');
    }
  }

  private async touchSucursalLastSeen(suc: string) {
    if (!(await this.lastSeenColumnExists())) return;
    await this.dataSource.query(
      `
      UPDATE dbo.SUCURSALES
      SET last_seen_at = GETDATE()
      WHERE UPPER(LTRIM(RTRIM(ISNULL(codigo, '')))) = @0;
      `,
      [suc],
    );
  }

  private hashAsUuid(value: string) {
    const hash = createHash('sha256').update(`SUC:${value}`).digest('hex');
    return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(
      12,
      16,
    )}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
  }

  private async loadDeviceMetadataBySuc(suc: string) {
    return (await this.resolveDeviceIdsForSuc(suc)).map((deviceId) => ({
      device_id: deviceId,
      modelo: null,
      firmware: null,
      sn: null,
    }));
  }

  private async logAudit(input: {
    adminId: number | null;
    accion: string;
    ip: string | null;
    detalles: unknown;
  }) {
    if (!(await this.tableExists('dbo.LOGS_AUDITORIA'))) return;

    await this.dataSource.query(
      `
      INSERT INTO dbo.LOGS_AUDITORIA (
        admin_id,
        accion,
        modulo,
        ip_origen,
        detalles,
        fecha
      )
      VALUES (@0, @1, 'sucursales', @2, @3, GETDATE());
      `,
      [
        input.adminId,
        input.accion.substring(0, 150),
        input.ip,
        JSON.stringify(input.detalles ?? {}),
      ],
    );
  }

  private async tableExists(tableName: string) {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN OBJECT_ID(@0, 'U') IS NULL THEN 0 ELSE 1 END AS EXISTS_FLAG
      `,
      [tableName],
    );
    return (
      (this.toInt(this.readValue(rows?.[0] ?? null, 'EXISTS_FLAG')) ?? 0) === 1
    );
  }

  private async resolveDeviceIdsForSuc(suc: string) {
    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT
        UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, '')))) AS DEVICE_ID
      FROM dbo.ATT_TIME_LOG tl
      WHERE UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))) = @0
        AND NULLIF(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))), '') IS NOT NULL
      ORDER BY DEVICE_ID ASC;
      `,
      [suc],
    );
    const values = new Set<string>();
    for (const row of (rows as Record<string, unknown>[]) ?? []) {
      const deviceId = this.normalizeNullable(
        this.readString(row, 'DEVICE_ID'),
      );
      if (deviceId != null) values.add(deviceId);
    }
    return [...values];
  }

  private async enqueueCommand(input: {
    deviceId: string;
    comando: string;
    estado: 'PENDIENTE' | 'ENVIADO';
  }) {
    if (!(await this.comandosTableExists())) return;

    await this.dataSource.query(
      `
      INSERT INTO dbo.COMANDOS_ADMS (
        dispositivo_id,
        comando,
        estado,
        fecha_creacion
      )
      VALUES (
        @0,
        @1,
        @2,
        GETDATE()
      );
      `,
      [input.deviceId, input.comando, input.estado],
    );
  }

  private async markPendingCommandsAsSent(deviceIdRaw: string) {
    if (!(await this.comandosTableExists())) return;
    const deviceId = this.normalizeNullable(deviceIdRaw);
    if (deviceId == null) return;

    await this.dataSource.query(
      `
      UPDATE dbo.COMANDOS_ADMS
      SET estado = 'ENVIADO'
      WHERE UPPER(LTRIM(RTRIM(ISNULL(dispositivo_id, '')))) = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(estado, '')))) = 'PENDIENTE';
      `,
      [deviceId],
    );
  }

  private async comandosTableExists() {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN OBJECT_ID('dbo.COMANDOS_ADMS', 'U') IS NULL THEN 0 ELSE 1 END AS EXISTS_FLAG
      `,
    );
    const exists = this.toInt(this.readValue(rows?.[0] ?? null, 'EXISTS_FLAG'));
    return exists === 1;
  }

  private resolvePhotoPayload(dto: UploadAsistenciaFotoDto, file: any) {
    if (file?.buffer && Buffer.isBuffer(file.buffer)) {
      return {
        buffer: file.buffer as Buffer,
        mimeType: String(file?.mimetype ?? 'image/jpeg').trim() || 'image/jpeg',
      };
    }

    const raw = String(dto.fotoBase64 ?? '').trim();
    if (!raw.length) {
      throw new BadRequestException('Enviar file multipart o fotoBase64');
    }

    let base64 = raw;
    let mimeType = 'image/jpeg';
    const match = raw.match(/^data:(.+);base64,(.+)$/i);
    if (match) {
      mimeType = match[1]?.trim() || mimeType;
      base64 = match[2]?.trim() || '';
    }

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      throw new BadRequestException('fotoBase64 invalido');
    }

    return { buffer, mimeType };
  }

  private resolvePhotoExtension(mimeType: string, fileName?: string) {
    const mime = String(mimeType ?? '').toLowerCase();
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('bmp')) return 'bmp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';

    const rawName = String(fileName ?? '').trim();
    const ext = path.extname(rawName).replace('.', '').toLowerCase();
    if (ext.length && /^[a-z0-9]{2,5}$/.test(ext)) return ext;

    return 'jpg';
  }

  private validateGeofence(
    latitud?: number,
    longitud?: number,
    radioMetros?: number,
  ) {
    void latitud;
    void longitud;
    void radioMetros;
  }

  private normalizeTipo(value: unknown) {
    const tipo = this.normalizeNullable(value);
    if (
      tipo == null ||
      !['ENTRADA', 'SALIDA_COMER', 'REGRESO_COMER', 'SALIDA'].includes(tipo)
    ) {
      throw new BadRequestException(`TIPO invalido: ${String(value ?? '')}`);
    }
    return tipo;
  }

  private async resolveTipoAutoClassified(
    tipoRaw: unknown,
    idUsuario: number,
    sucHint: string | null | undefined,
    fechaIso: string,
  ) {
    const explicit = this.normalizeNullable(tipoRaw);
    if (explicit != null) {
      return this.normalizeTipo(explicit);
    }

    const eventDate = new Date(fechaIso);
    const suc = this.normalizeNullable(sucHint);
    const lastTipoRows = await this.dataSource.query(
      `
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(tl.TIPO, '')))) AS TIPO
      FROM dbo.ATT_TIME_LOG tl
      WHERE tl.IDUSUARIO = @0
        AND (@1 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))) = @1)
      ORDER BY tl.FCNR DESC;
      `,
      [idUsuario, suc],
    );
    const lastTipo = this.normalizeNullable(
      this.readString(lastTipoRows?.[0] ?? null, 'TIPO'),
    );

    if (lastTipo === 'ENTRADA') {
      // Si ya entró, por horario de comida intentamos salida de comida.
      return eventDate.getHours() < 14 ? 'SALIDA_COMER' : 'SALIDA';
    }
    if (lastTipo === 'SALIDA_COMER') return 'REGRESO_COMER';
    if (lastTipo === 'REGRESO_COMER') return 'SALIDA';
    if (lastTipo === 'SALIDA') return 'ENTRADA';

    // Primer evento del día: aproxima por hora de entrada/salida configurada.
    const horarioRows = await this.dataSource.query(
      `
      IF OBJECT_ID('dbo.COLABORADORES', 'U') IS NULL
         OR OBJECT_ID('dbo.ATT_RULES_HORARIOS', 'U') IS NULL
      BEGIN
        SELECT CAST(NULL AS VARCHAR(8)) AS hora_entrada, CAST(NULL AS VARCHAR(8)) AS hora_salida;
        RETURN;
      END

      SELECT TOP 1
        h.hora_entrada,
        h.hora_salida
      FROM dbo.COLABORADORES c
      LEFT JOIN dbo.ATT_RULES_HORARIOS h
        ON h.id = c.horario_id
      LEFT JOIN dbo.USUARIO u
        ON u.IDUSUARIO = @0
      WHERE c.id = @0
         OR UPPER(LTRIM(RTRIM(ISNULL(c.pin, '')))) = UPPER(CONVERT(VARCHAR(30), @0))
         OR (
              u.USERNAME IS NOT NULL
              AND UPPER(LTRIM(RTRIM(ISNULL(c.pin, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, ''))))
            )
      ORDER BY
        CASE WHEN c.id = @0 THEN 0 ELSE 1 END,
        c.id ASC;
      `,
      [idUsuario],
    );

    const horaEntrada = this.readString(
      horarioRows?.[0] ?? null,
      'hora_entrada',
    );
    const horaSalida = this.readString(horarioRows?.[0] ?? null, 'hora_salida');
    const hourMinutes = eventDate.getHours() * 60 + eventDate.getMinutes();
    const entradaMinutes = this.toTimeMinutes(horaEntrada);
    const salidaMinutes = this.toTimeMinutes(horaSalida);

    if (entradaMinutes != null && salidaMinutes != null) {
      const middle = Math.trunc((entradaMinutes + salidaMinutes) / 2);
      return hourMinutes <= middle ? 'ENTRADA' : 'SALIDA';
    }

    return hourMinutes < 14 * 60 ? 'ENTRADA' : 'SALIDA';
  }

  private normalizeAuthMethod(value: unknown) {
    const auth = this.normalizeNullable(value) ?? 'PIN';
    if (!['FACE', 'FINGER', 'PIN', 'CARD', 'QR', 'PASSWORD'].includes(auth)) {
      throw new BadRequestException(
        `AUTH_METHOD invalido: ${String(value ?? '')}`,
      );
    }
    return auth;
  }

  private normalizeVerificationMode(
    value: unknown,
    verifyMode?: number | null,
  ) {
    const mode = this.normalizeNullable(value);
    if (mode == null) {
      return this.verificationModeFromCode(verifyMode);
    }
    const allowed = ['FACE', 'FINGER', 'PIN', 'CARD', 'QR', 'PASSWORD'];
    return allowed.includes(mode) ? mode : null;
  }

  private normalizeVerifyModeInt(value: unknown) {
    const code = this.toInt(value);
    if (code == null) return null;
    if (![1, 3, 15].includes(code)) return null;
    return code;
  }

  private verifyModeFromLabel(value: string | null) {
    if (value === 'FINGER') return 1;
    if (value === 'FACE') return 15;
    if (value === 'PIN') return 3;
    return null;
  }

  private verificationModeFromCode(value: number | null | undefined) {
    const code = this.toInt(value);
    if (code === 1) return 'FINGER';
    if (code === 15) return 'FACE';
    if (code === 3) return 'PIN';
    return null;
  }

  private resolveAuthMethod(
    authMethod: string,
    verificationMode: string | null,
  ) {
    if (verificationMode === 'FACE') return 'FACE';
    if (verificationMode === 'FINGER') return 'FINGER';
    // ATT_TIME_LOG check constraint historico solo permite FACE|FINGER|PIN.
    if (authMethod === 'FACE') return 'FACE';
    if (authMethod === 'FINGER') return 'FINGER';
    return 'PIN';
  }

  private toTimeMinutes(value?: string | null) {
    const text = String(value ?? '').trim();
    if (!text.length) return null;
    const match = text.match(/^(\d{2}):(\d{2})(:\d{2})?$/);
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  private normalizeCaseSensitiveText(value: unknown) {
    const text = String(value ?? '').trim();
    return text.length ? text : null;
  }

  private parseGpsCoordinates(value?: string | null) {
    const raw = String(value ?? '').trim();
    if (!raw.length) return null;
    const parts = raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (parts.length !== 2) return null;

    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  }

  private composeIngestNotes(
    source: 'USB_IMPORT' | 'ADMS_PUSH' | 'KIOSCO_VISITA' | 'SELF_SERVICE',
    extra: {
      timezone: string;
      verificationMode: string | null;
      temperature: number | null;
      gpsCoordinates: string | null;
      requiresReview: boolean;
      distanceM: number | null;
      commissionBypass: boolean;
      silentAlert: boolean;
    },
  ) {
    const chunks: string[] = [`${source}|timezone=${extra.timezone}`];
    if (extra.verificationMode != null) {
      chunks.push(`verification_mode=${extra.verificationMode}`);
    }
    if (extra.temperature != null && Number.isFinite(extra.temperature)) {
      chunks.push(`temperature_c=${extra.temperature.toFixed(1)}`);
    }
    if (String(extra.gpsCoordinates ?? '').trim().length) {
      chunks.push(`gps_coordinates=${String(extra.gpsCoordinates).trim()}`);
    }
    chunks.push(`requires_review=${extra.requiresReview ? 1 : 0}`);
    chunks.push(`commission_bypass=${extra.commissionBypass ? 1 : 0}`);
    chunks.push(`silent_alert=${extra.silentAlert ? 1 : 0}`);
    if (extra.distanceM != null && Number.isFinite(extra.distanceM)) {
      chunks.push(`distance_m=${extra.distanceM.toFixed(1)}`);
      chunks.push('threshold_m=200');
    }
    const note = chunks.join('|');
    return note.length > 250 ? note.substring(0, 250) : note;
  }

  private async resolveRequiresReview(input: {
    idUsuario: number;
    suc: string;
    lat: number | null;
    lon: number | null;
    referenceDateIso: string;
  }) {
    void input;
    return {
      requiresReview: false,
      distanceM: null as number | null,
      commissionBypass: false,
    };
  }

  private async hasCommissionBypass(
    idUsuario: number,
    dateIso: string | null,
  ): Promise<boolean> {
    if (dateIso == null) return false;
    const rows = await this.dataSource.query(
      `
      DECLARE @colaboradorId INT = NULL;

      IF OBJECT_ID('dbo.COLABORADORES', 'U') IS NOT NULL
      BEGIN
        SELECT TOP 1 @colaboradorId = c.id
        FROM dbo.COLABORADORES c
        LEFT JOIN dbo.USUARIO u
          ON u.IDUSUARIO = @0
        WHERE c.id = @0
           OR UPPER(LTRIM(RTRIM(ISNULL(c.pin, '')))) = UPPER(CONVERT(VARCHAR(30), @0))
           OR (
             u.USERNAME IS NOT NULL
             AND UPPER(LTRIM(RTRIM(ISNULL(c.pin, '')))) = UPPER(LTRIM(RTRIM(u.USERNAME)))
           )
        ORDER BY
          CASE WHEN c.id = @0 THEN 0 ELSE 1 END,
          c.id ASC;
      END

      IF @colaboradorId IS NULL
      BEGIN
        SELECT CAST(0 AS BIT) AS has_bypass;
        RETURN;
      END

      IF OBJECT_ID('dbo.ATT_SOLICITUDES', 'U') IS NULL
         OR OBJECT_ID('dbo.ATT_PERMISOS_TIPOS', 'U') IS NULL
      BEGIN
        SELECT CAST(0 AS BIT) AS has_bypass;
        RETURN;
      END

      SELECT CAST(
        CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.ATT_SOLICITUDES s
          INNER JOIN dbo.ATT_PERMISOS_TIPOS t
            ON t.id = s.tipo_id
          WHERE s.colaborador_id = @colaboradorId
            AND UPPER(LTRIM(RTRIM(ISNULL(s.estatus, '')))) = 'APROBADO'
            AND @1 BETWEEN s.fecha_inicio AND s.fecha_fin
            AND UPPER(LTRIM(RTRIM(ISNULL(t.nombre, ''))))
                IN ('COMISION', 'COMISIÓN', 'TRABAJO CAMPO')
        ) THEN 1 ELSE 0 END
      AS BIT) AS has_bypass;
      `,
      [idUsuario, dateIso],
    );
    return (
      (this.toInt(this.readValue(rows?.[0] ?? null, 'has_bypass')) ?? 0) === 1
    );
  }

  private async applyRequiresReviewFlag(
    idTimeLog: number,
    requiresReview: boolean,
  ) {
    await this.dataSource.query(
      `
      IF COL_LENGTH('dbo.ATT_TIME_LOG', 'REQUIERE_REVISION') IS NOT NULL
      BEGIN
        UPDATE dbo.ATT_TIME_LOG
        SET REQUIERE_REVISION = @1
        WHERE IDTIMELOG = @0;
      END
      `,
      [idTimeLog, requiresReview ? 1 : 0],
    );
  }

  private haversineMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ) {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const r = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return r * c;
  }

  private normalizeDateToIso(value: unknown) {
    const text = String(value ?? '').trim();
    if (!text.length) {
      throw new BadRequestException('fecha requerida');
    }

    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime())) {
      const y = direct.getFullYear().toString().padStart(4, '0');
      const m = (direct.getMonth() + 1).toString().padStart(2, '0');
      const d = direct.getDate().toString().padStart(2, '0');
      const hh = direct.getHours().toString().padStart(2, '0');
      const mm = direct.getMinutes().toString().padStart(2, '0');
      const ss = direct.getSeconds().toString().padStart(2, '0');
      return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
    }

    // fallback basico para DDMMYYYY o DDMMYYYYHHMMSS
    const compact = text.replace(/\D/g, '');
    if (compact.length === 8 || compact.length === 14) {
      const dd = compact.substring(0, 2);
      const mm = compact.substring(2, 4);
      const yyyy = compact.substring(4, 8);
      const hh = compact.length === 14 ? compact.substring(8, 10) : '00';
      const mi = compact.length === 14 ? compact.substring(10, 12) : '00';
      const ss = compact.length === 14 ? compact.substring(12, 14) : '00';
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }

    throw new BadRequestException(`fecha invalida: ${text}`);
  }

  private normalizeTimezone(value: unknown) {
    const tz = String(value ?? '').trim();
    return tz.length ? tz : 'America/Mexico_City';
  }

  private normalizeNullable(value: unknown) {
    const text = String(value ?? '')
      .trim()
      .toUpperCase();
    return text.length ? text : null;
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

  private toInt(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : null;
  }

  private toNumber(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private extractError(error: unknown) {
    if (!error) return 'Error desconocido';
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      const asAny = error as Record<string, unknown>;
      if (typeof asAny.message === 'string') {
        return asAny.message;
      }
    }
    return String(error);
  }
}
