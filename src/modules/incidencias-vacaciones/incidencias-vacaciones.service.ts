import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { DataSource, In, Repository } from 'typeorm';
import { ColaboradorEntity } from '../colaboradores/colaborador.entity';
import { AttPermisoTipoEntity } from './att-permiso-tipo.entity';
import { AttSolicitudEntity } from './att-solicitud.entity';
import { AttVacacionesSaldoEntity } from './att-vacaciones-saldo.entity';
import { AusenciasCalendarioDto } from './dto/ausencias-calendario.dto';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { ListSolicitudesDto } from './dto/list-solicitudes.dto';
import { UpdateSolicitudEstatusDto } from './dto/update-solicitud-estatus.dto';

type RequestContext = {
  actorId: number | null;
  ip: string | null;
};

type DateRange = {
  inicio: string;
  fin: string;
  inicioSql: string;
  finSql: string;
};

@Injectable()
export class IncidenciasVacacionesService {
  constructor(
    @InjectRepository(AttPermisoTipoEntity)
    private readonly tiposRepo: Repository<AttPermisoTipoEntity>,
    @InjectRepository(AttSolicitudEntity)
    private readonly solicitudesRepo: Repository<AttSolicitudEntity>,
    @InjectRepository(AttVacacionesSaldoEntity)
    private readonly saldosRepo: Repository<AttVacacionesSaldoEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findTipos() {
    await this.ensureTable('dbo.ATT_PERMISOS_TIPOS');
    const rows = await this.tiposRepo.find({ order: { nombre: 'ASC' } });
    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      codigo: this.buildPermisoCode(row.nombre),
      goce_sueldo: row.goceSueldo ?? false,
      justifica_asistencia: row.justificaAsistencia ?? false,
    }));
  }

  async createSolicitud(dto: CreateSolicitudDto, ctx: RequestContext) {
    await this.ensureCoreTables();

    const range = this.resolveRange(dto.fecha_inicio, dto.fecha_fin);
    const colaboradorId = Number(dto.colaborador_id ?? 0);
    const tipoId = Number(dto.tipo_id ?? 0);

    await this.ensureColaboradorExists(colaboradorId);

    const tipo = await this.tiposRepo.findOne({ where: { id: tipoId } });
    if (!tipo) {
      throw new NotFoundException(`Tipo de permiso ${tipoId} no existe`);
    }

    await this.validateNoOverlap(colaboradorId, range.inicio, range.fin);

    const insertedRows = await this.dataSource.query(
      `
      INSERT INTO dbo.ATT_SOLICITUDES (
        colaborador_id,
        tipo_id,
        fecha_inicio,
        fecha_fin,
        motivo,
        evidencia_url,
        estatus,
        aprobado_por,
        creado_en,
        actualizado_en
      )
      OUTPUT
        INSERTED.id,
        INSERTED.colaborador_id,
        INSERTED.tipo_id,
        INSERTED.fecha_inicio,
        INSERTED.fecha_fin,
        INSERTED.motivo,
        INSERTED.evidencia_url,
        INSERTED.estatus,
        INSERTED.aprobado_por,
        INSERTED.creado_en,
        INSERTED.actualizado_en
      VALUES (
        @0,
        @1,
        CAST(@2 AS DATETIME),
        CAST(@3 AS DATETIME),
        @4,
        @5,
        'PENDIENTE',
        NULL,
        GETDATE(),
        GETDATE()
      );
      `,
      [
        colaboradorId,
        tipoId,
        range.inicioSql,
        range.finSql,
        this.cleanText(dto.motivo, 500),
        this.cleanText(dto.evidencia_url, 500),
      ],
    );

    const inserted = (insertedRows?.[0] ?? null) as Record<
      string,
      unknown
    > | null;
    if (inserted == null) {
      throw new BadRequestException('No se pudo insertar solicitud');
    }

    const saved = this.solicitudesRepo.create({
      id: Number(inserted.id ?? inserted.ID ?? 0),
      colaboradorId: Number(
        inserted.colaborador_id ?? inserted.COLABORADOR_ID ?? colaboradorId,
      ),
      tipoId: Number(inserted.tipo_id ?? inserted.TIPO_ID ?? tipoId),
      fechaInicio: String(
        inserted.fecha_inicio ?? inserted.FECHA_INICIO ?? range.inicio,
      ),
      fechaFin: String(inserted.fecha_fin ?? inserted.FECHA_FIN ?? range.fin),
      motivo: this.cleanText(inserted.motivo ?? inserted.MOTIVO, 500),
      evidenciaUrl: this.cleanText(
        inserted.evidencia_url ?? inserted.EVIDENCIA_URL,
        500,
      ),
      estatus: String(inserted.estatus ?? inserted.ESTATUS ?? 'PENDIENTE'),
      aprobadoPor: this.toInt(inserted.aprobado_por ?? inserted.APROBADO_POR),
      creadoEn: inserted.creado_en
        ? new Date(String(inserted.creado_en))
        : inserted.CREADO_EN
          ? new Date(String(inserted.CREADO_EN))
          : null,
      actualizadoEn: inserted.actualizado_en
        ? new Date(String(inserted.actualizado_en))
        : inserted.ACTUALIZADO_EN
          ? new Date(String(inserted.ACTUALIZADO_EN))
          : null,
    });

    await this.logAudit('CREATE_SOLICITUD', ctx, {
      solicitudId: saved.id,
      colaboradorId,
      tipoId,
      fecha_inicio: range.inicio,
      fecha_fin: range.fin,
    });
    await this.syncIncidenciasMirror(saved, tipo.nombre ?? null);

    return this.toSolicitudView(saved, tipo);
  }

  async listSolicitudes(query: ListSolicitudesDto) {
    await this.ensureCoreTables();
    const qb = this.solicitudesRepo
      .createQueryBuilder('s')
      .innerJoin(AttPermisoTipoEntity, 't', 't.id = s.tipo_id')
      .leftJoin(ColaboradorEntity, 'c', 'c.id = s.colaborador_id')
      .select([
        's.id AS id',
        's.colaborador_id AS colaborador_id',
        's.tipo_id AS tipo_id',
        's.fecha_inicio AS fecha_inicio',
        's.fecha_fin AS fecha_fin',
        's.motivo AS motivo',
        's.evidencia_url AS evidencia_url',
        's.estatus AS estatus',
        's.aprobado_por AS aprobado_por',
        's.creado_en AS creado_en',
        's.actualizado_en AS actualizado_en',
        't.nombre AS tipo_nombre',
        't.goce_sueldo AS tipo_goce_sueldo',
        't.justifica_asistencia AS tipo_justifica_asistencia',
        "CONCAT(ISNULL(c.nombre, ''), ' ', ISNULL(c.apellido, '')) AS colaborador_nombre",
        'c.pin AS pin',
        'c.sucursal_id AS sucursal_id',
      ]);

    if (query.colaborador_id != null) {
      qb.andWhere('s.colaborador_id = :colaboradorId', {
        colaboradorId: query.colaborador_id,
      });
    }
    if ((query.estatus ?? '').trim().length) {
      qb.andWhere('UPPER(s.estatus) = :estatus', {
        estatus: this.normalizeEnumCode(query.estatus),
      });
    }

    if (
      (query.fecha_inicio ?? '').trim().length &&
      (query.fecha_fin ?? '').trim().length
    ) {
      const range = this.resolveRange(query.fecha_inicio!, query.fecha_fin!);
      qb.andWhere('(s.fecha_inicio <= :fin AND s.fecha_fin >= :inicio)', {
        inicio: range.inicio,
        fin: range.fin,
      });
    }

    qb.orderBy('s.creado_en', 'DESC');

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((row) => ({
      id: Number(row.id ?? 0),
      colaborador_id: Number(row.colaborador_id ?? 0),
      colaborador_nombre: String(row.colaborador_nombre ?? '').trim(),
      pin: String(row.pin ?? '').trim(),
      sucursal_id: this.toInt(row.sucursal_id),
      tipo_id: Number(row.tipo_id ?? 0),
      tipo_nombre: String(row.tipo_nombre ?? '').trim(),
      tipo_codigo: this.buildPermisoCode(row.tipo_nombre),
      tipo_goce_sueldo: this.toBool(row.tipo_goce_sueldo),
      tipo_justifica_asistencia: this.toBool(row.tipo_justifica_asistencia),
      fecha_inicio: this.toDateIsoFromUnknown(row.fecha_inicio),
      fecha_fin: this.toDateIsoFromUnknown(row.fecha_fin),
      motivo: this.cleanText(row.motivo, 500),
      evidencia_url: this.cleanText(row.evidencia_url, 500),
      estatus: String(row.estatus ?? 'PENDIENTE').toUpperCase(),
      aprobado_por: this.toInt(row.aprobado_por),
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
    }));
  }

  async updateSolicitudEstatus(
    id: number,
    dto: UpdateSolicitudEstatusDto,
    ctx: RequestContext,
  ) {
    await this.ensureCoreTables();
    const solicitud = await this.solicitudesRepo.findOne({ where: { id } });
    if (!solicitud) {
      throw new NotFoundException(`Solicitud ${id} no existe`);
    }

    const nextStatus = String(dto.estatus ?? 'PENDIENTE').trim();
    const normalizedStatus = this.normalizeEnumCode(nextStatus);
    if (!['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(normalizedStatus)) {
      throw new BadRequestException('Estatus inválido');
    }
    const nextStatusFinal = normalizedStatus as
      | 'PENDIENTE'
      | 'APROBADO'
      | 'RECHAZADO';
    solicitud.estatus = nextStatusFinal;
    solicitud.aprobadoPor =
      nextStatusFinal === 'APROBADO'
        ? Number(dto.aprobado_por ?? ctx.actorId ?? 0) || null
        : null;

    if ((dto.motivo_resolucion ?? '').trim().length) {
      const merged = [solicitud.motivo ?? '', dto.motivo_resolucion ?? '']
        .filter((v) => String(v).trim().length > 0)
        .join(' | ');
      solicitud.motivo = this.cleanText(merged, 500);
    }

    const saved = await this.solicitudesRepo.save(solicitud);
    const tipo = await this.tiposRepo.findOne({ where: { id: saved.tipoId } });

    if (saved.estatus?.toUpperCase() === 'APROBADO' && tipo != null) {
      await this.refreshVacationBalanceForDate(
        saved.colaboradorId ?? 0,
        saved.fechaInicio,
      );
    }

    await this.logAudit('UPDATE_SOLICITUD_ESTATUS', ctx, {
      solicitudId: saved.id,
      estatus: saved.estatus,
      aprobado_por: saved.aprobadoPor,
    });
    await this.syncIncidenciasMirror(saved, tipo?.nombre ?? null);

    return this.toSolicitudView(saved, tipo ?? undefined);
  }

  async uploadEvidencia(file: Express.Multer.File, ctx: RequestContext) {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException('Archivo de evidencia requerido');
    }

    const uploadsDir = path.resolve(process.cwd(), 'uploads', 'incidencias');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = this.resolveExtension(file.originalname);
    const fileName = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const absPath = path.join(uploadsDir, fileName);
    writeFileSync(absPath, file.buffer);

    const publicUrl = `/uploads/incidencias/${fileName}`;
    await this.logAudit('UPLOAD_EVIDENCIA', ctx, {
      fileName,
      bytes: file.size,
      mime: file.mimetype,
    });

    return {
      ok: true,
      evidencia_url: publicUrl,
      file_name: fileName,
      bytes: file.size,
    };
  }

  async getAusenciasCalendario(query: AusenciasCalendarioDto) {
    await this.ensureCoreTables();

    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const range = this.resolveRange(
      query.fecha_inicio ?? this.toDateIso(defaultStart),
      query.fecha_fin ?? this.toDateIso(defaultEnd),
    );
    const hasColaboradorSucursalId = await this.columnExists(
      'dbo.COLABORADORES',
      'sucursal_id',
    );
    const hasDocCompleta = await this.columnExists(
      'dbo.COLABORADORES',
      'documentacion_completa',
    );
    const hasColabSucTable = await this.tableExists(
      'dbo.COLABORADORES_SUCURSALES',
    );

    const colabSucApply = hasColabSucTable
      ? `
      OUTER APPLY (
        SELECT TOP 1 csx.sucursal_id
        FROM dbo.COLABORADORES_SUCURSALES csx
        WHERE csx.colaborador_id = c.id
        ORDER BY csx.id DESC
      ) cs
      `
      : '';

    const sucursalExpr = hasColabSucTable
      ? hasColaboradorSucursalId
        ? 'COALESCE(cs.sucursal_id, c.sucursal_id)'
        : 'cs.sucursal_id'
      : hasColaboradorSucursalId
        ? 'c.sucursal_id'
        : 'NULL';

    const docCompletaExpr = hasDocCompleta
      ? 'ISNULL(c.documentacion_completa, 0)'
      : 'CAST(0 AS BIT)';

    try {
      const rows = await this.dataSource.query(
        `
        SELECT
          s.id,
          s.colaborador_id,
          c.pin,
          CONCAT(ISNULL(c.nombre, ''), ' ', ISNULL(c.apellido, '')) AS colaborador_nombre,
          ${sucursalExpr} AS sucursal_id,
          ${docCompletaExpr} AS documentacion_completa,
          t.id AS tipo_id,
          t.nombre AS tipo_nombre,
          s.fecha_inicio,
          s.fecha_fin
        FROM dbo.ATT_SOLICITUDES s
        INNER JOIN dbo.ATT_PERMISOS_TIPOS t
          ON t.id = s.tipo_id
        LEFT JOIN dbo.COLABORADORES c
          ON c.id = s.colaborador_id
        ${colabSucApply}
        WHERE UPPER(LTRIM(RTRIM(ISNULL(s.estatus, '')))) = 'APROBADO'
          AND s.fecha_inicio <= @1
          AND s.fecha_fin >= @0
          AND (@2 IS NULL OR ${sucursalExpr} = @2)
        ORDER BY s.fecha_inicio ASC, colaborador_nombre ASC;
        `,
        [range.inicio, range.fin, query.sucursal_id ?? null],
      );

      const safeRows = Array.isArray(rows)
        ? (rows as Record<string, unknown>[])
        : [];

      return {
        ok: true,
        fecha_inicio: range.inicio,
        fecha_fin: range.fin,
        total: safeRows.length,
        rows: safeRows.map((row) => ({
          id: Number(row.id ?? 0),
          colaborador_id: Number(row.colaborador_id ?? 0),
          pin: String(row.pin ?? '').trim(),
          colaborador_nombre: String(row.colaborador_nombre ?? '').trim(),
          sucursal_id: this.toInt(row.sucursal_id),
          tipo_id: Number(row.tipo_id ?? 0),
          tipo_nombre: String(row.tipo_nombre ?? '').trim(),
          tipo_codigo: this.buildPermisoCode(row.tipo_nombre),
          fecha_inicio: this.toDateIsoFromUnknown(row.fecha_inicio),
          fecha_fin: this.toDateIsoFromUnknown(row.fecha_fin),
        })),
      };
    } catch (error) {
      console.error('ERROR INCIDENCIAS CALENDARIO:', {
        range,
        sucursal_id: query.sucursal_id ?? null,
        error,
      });
      throw new InternalServerErrorException(
        'No se pudo cargar calendario de ausencias. Intenta de nuevo.',
      );
    }
  }

  async getVacationDashboard(colaboradorId: number, anio?: number) {
    await this.ensureCoreTables();
    await this.ensureColaboradorExists(colaboradorId);

    const year = Number(anio ?? new Date().getFullYear());
    if (!Number.isFinite(year) || year < 2000 || year > 2200) {
      throw new BadRequestException(
        'Año inválido para dashboard de vacaciones',
      );
    }

    try {
      const diasTotales =
        await this.calculateVacationDaysBySeniority(colaboradorId);
      const diasUsados = await this.calculateVacationDaysUsed(
        colaboradorId,
        year,
      );
      const upcomingRows = await this.dataSource.query(
        `
        SELECT TOP 5
          s.id,
          s.fecha_inicio,
          s.fecha_fin,
          t.nombre AS tipo_nombre
        FROM dbo.ATT_SOLICITUDES s
        INNER JOIN dbo.ATT_PERMISOS_TIPOS t
          ON t.id = s.tipo_id
        WHERE s.colaborador_id = @0
          AND UPPER(LTRIM(RTRIM(ISNULL(s.estatus, '')))) = 'APROBADO'
          AND CAST(s.fecha_inicio AS DATE) >= CAST(GETDATE() AS DATE)
        ORDER BY s.fecha_inicio ASC;
        `,
        [colaboradorId],
      );

      await this.upsertVacationBalance(
        colaboradorId,
        year,
        diasTotales,
        diasUsados,
      );

      return {
        ok: true,
        colaborador_id: colaboradorId,
        anio: year,
        dias_disponibles: Math.max(0, diasTotales - diasUsados),
        dias_tomados: diasUsados,
        dias_totales: diasTotales,
        proximas_vacaciones: (
          (upcomingRows as Record<string, unknown>[]) ?? []
        ).map((row) => ({
          id: Number(row.id ?? 0),
          tipo: this.cleanText(row.tipo_nombre, 120) ?? '',
          fecha_inicio: this.toDateIsoFromUnknown(row.fecha_inicio),
          fecha_fin: this.toDateIsoFromUnknown(row.fecha_fin),
        })),
      };
    } catch (error) {
      console.error('ERROR VACACIONES DASHBOARD:', {
        colaboradorId,
        anio: year,
        error,
      });
      throw new InternalServerErrorException(
        'No se pudo calcular saldo de vacaciones. Intenta nuevamente.',
      );
    }
  }

  async getApprovedPermissionCodeForDate(
    colaboradorId: number,
    dateIso: string,
  ): Promise<string | null> {
    const map = await this.getApprovedPermissionCodeMapForDate(dateIso, [
      colaboradorId,
    ]);
    return map.get(colaboradorId) ?? null;
  }

  async getApprovedPermissionCodeMapForDate(
    dateIso: string,
    colaboradorIds: number[],
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (!colaboradorIds.length) return map;
    if (!(await this.tableExists('dbo.ATT_SOLICITUDES'))) return map;
    if (!(await this.tableExists('dbo.ATT_PERMISOS_TIPOS'))) return map;

    const unique = [
      ...new Set(colaboradorIds.filter((v) => Number.isFinite(v) && v > 0)),
    ];
    if (!unique.length) return map;

    const rows = await this.dataSource.query(
      `
      ;WITH ranked AS (
        SELECT
          s.colaborador_id,
          t.nombre AS tipo_nombre,
          ROW_NUMBER() OVER (
            PARTITION BY s.colaborador_id
            ORDER BY s.fecha_inicio DESC, s.id DESC
          ) AS rn
        FROM dbo.ATT_SOLICITUDES s
        INNER JOIN dbo.ATT_PERMISOS_TIPOS t
          ON t.id = s.tipo_id
        WHERE s.colaborador_id IN (${unique.join(',')})
          AND UPPER(LTRIM(RTRIM(ISNULL(s.estatus, '')))) = 'APROBADO'
          AND CAST(@0 AS DATE) BETWEEN CAST(s.fecha_inicio AS DATE) AND CAST(s.fecha_fin AS DATE)
          AND ISNULL(t.justifica_asistencia, 0) = 1
      )
      SELECT colaborador_id, tipo_nombre
      FROM ranked
      WHERE rn = 1;
      `,
      [dateIso],
    );

    for (const row of (rows as Record<string, unknown>[]) ?? []) {
      const colabId = Number(row.colaborador_id ?? 0);
      if (!Number.isFinite(colabId) || colabId <= 0) continue;
      const code = this.buildPermisoCode(row.tipo_nombre);
      if (code.length) {
        map.set(colabId, code);
      }
    }
    return map;
  }

  async hasGpsBypassForDate(colaboradorId: number, dateIso: string) {
    if (!(await this.tableExists('dbo.ATT_SOLICITUDES'))) return false;
    if (!(await this.tableExists('dbo.ATT_PERMISOS_TIPOS'))) return false;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 t.nombre AS tipo_nombre
      FROM dbo.ATT_SOLICITUDES s
      INNER JOIN dbo.ATT_PERMISOS_TIPOS t
        ON t.id = s.tipo_id
      WHERE s.colaborador_id = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(s.estatus, '')))) = 'APROBADO'
        AND CAST(@1 AS DATE) BETWEEN CAST(s.fecha_inicio AS DATE) AND CAST(s.fecha_fin AS DATE)
      ORDER BY s.fecha_inicio DESC, s.id DESC;
      `,
      [colaboradorId, dateIso],
    );

    const tipoNombre = this.cleanText(rows?.[0]?.tipo_nombre, 120) ?? '';
    const code = this.buildPermisoCode(tipoNombre);
    return code === 'COMISION' || code === 'TRABAJO_CAMPO';
  }

  private async validateNoOverlap(
    colaboradorId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 id
      FROM dbo.ATT_SOLICITUDES
      WHERE colaborador_id = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(estatus, '')))) IN ('PENDIENTE', 'APROBADO')
        AND fecha_inicio <= @2
        AND fecha_fin >= @1
      ORDER BY id DESC;
      `,
      [colaboradorId, fechaInicio, fechaFin],
    );

    if (Array.isArray(rows) && rows.length) {
      throw new BadRequestException(
        'Ya existe solicitud aprobada o pendiente en ese rango de fechas',
      );
    }
  }

  private async ensureColaboradorExists(colaboradorId: number) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 id
      FROM dbo.COLABORADORES
      WHERE id = @0;
      `,
      [colaboradorId],
    );
    if (!Array.isArray(rows) || !rows.length) {
      throw new NotFoundException(`Colaborador ${colaboradorId} no existe`);
    }
  }

  private async calculateVacationDaysBySeniority(colaboradorId: number) {
    const ingreso = await this.resolveIngresoDate(colaboradorId);
    const today = new Date();
    const safeIngreso =
      ingreso.getTime() < new Date('2000-01-01T00:00:00').getTime()
        ? new Date('2000-01-01T00:00:00')
        : ingreso;
    const diffYears = Math.max(
      0,
      Math.floor(
        (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
          Date.UTC(
            safeIngreso.getFullYear(),
            safeIngreso.getMonth(),
            safeIngreso.getDate(),
          )) /
          (365.2425 * 24 * 60 * 60 * 1000),
      ),
    );
    const years = diffYears + 1;

    if (years <= 1) return 12;
    if (years === 2) return 14;
    if (years === 3) return 16;
    if (years === 4) return 18;
    if (years === 5) return 20;

    const extraBlocks = Math.floor((years - 6) / 5) + 1;
    return 20 + extraBlocks * 2;
  }

  private async calculateVacationDaysUsed(colaboradorId: number, anio: number) {
    const rows = await this.dataSource.query(
      `
      SELECT
        SUM(
          CASE
            WHEN TRY_CONVERT(DATETIME2(0), s.fecha_inicio) IS NULL THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), s.fecha_fin) IS NULL THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), s.fecha_inicio) < '20000101' THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), s.fecha_fin) < '20000101' THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), s.fecha_inicio) >= '21000101' THEN 0
            WHEN TRY_CONVERT(DATETIME2(0), s.fecha_fin) >= '21000101' THEN 0
            ELSE DATEDIFF(
              SECOND,
              CASE
                WHEN YEAR(s.fecha_inicio) < @1
                  THEN DATEFROMPARTS(@1, 1, 1)
                ELSE s.fecha_inicio
              END,
              DATEADD(
                DAY,
                1,
                CASE
                  WHEN YEAR(s.fecha_fin) > @1
                    THEN DATEFROMPARTS(@1, 12, 31)
                  ELSE s.fecha_fin
                END
              )
            ) / 86400
          END
        ) AS used_days
      FROM dbo.ATT_SOLICITUDES s
      INNER JOIN dbo.ATT_PERMISOS_TIPOS t
        ON t.id = s.tipo_id
      WHERE s.colaborador_id = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(s.estatus, '')))) = 'APROBADO'
        AND UPPER(LTRIM(RTRIM(ISNULL(t.nombre, '')))) LIKE '%VACACION%'
        AND YEAR(s.fecha_fin) >= @1
        AND YEAR(s.fecha_inicio) <= @1;
      `,
      [colaboradorId, anio],
    );

    const value = Number(rows?.[0]?.used_days ?? rows?.[0]?.USED_DAYS ?? 0);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
  }

  private async upsertVacationBalance(
    colaboradorId: number,
    anio: number,
    diasTotales: number,
    diasUsados: number,
  ) {
    if (!(await this.tableExists('dbo.ATT_VACACIONES_SALDOS'))) return;

    await this.dataSource.query(
      `
      MERGE dbo.ATT_VACACIONES_SALDOS AS tgt
      USING (
        SELECT
          @0 AS colaborador_id,
          @1 AS anio,
          @2 AS dias_totales,
          @3 AS dias_usados
      ) AS src
      ON tgt.colaborador_id = src.colaborador_id
       AND tgt.anio = src.anio
      WHEN MATCHED THEN
        UPDATE SET
          tgt.dias_totales = src.dias_totales,
          tgt.dias_usados = src.dias_usados
      WHEN NOT MATCHED THEN
        INSERT (colaborador_id, anio, dias_totales, dias_usados)
        VALUES (src.colaborador_id, src.anio, src.dias_totales, src.dias_usados);
      `,
      [colaboradorId, anio, diasTotales, diasUsados],
    );
  }

  private async refreshVacationBalanceForDate(
    colaboradorId: number,
    dateIso?: string,
  ) {
    const year = Number((dateIso ?? this.toDateIso(new Date())).slice(0, 4));
    if (!Number.isFinite(year) || year < 2000) return;
    const diasTotales =
      await this.calculateVacationDaysBySeniority(colaboradorId);
    const diasUsados = await this.calculateVacationDaysUsed(
      colaboradorId,
      year,
    );
    await this.upsertVacationBalance(
      colaboradorId,
      year,
      diasTotales,
      diasUsados,
    );
  }

  private async resolveIngresoDate(colaboradorId: number) {
    const hasFechaIngreso = await this.columnExists(
      'dbo.COLABORADORES',
      'fecha_ingreso',
    );
    const hasCreatedAt = await this.columnExists(
      'dbo.COLABORADORES',
      'creado_en',
    );

    const ingresoExpr = hasFechaIngreso
      ? 'c.fecha_ingreso'
      : hasCreatedAt
        ? 'c.creado_en'
        : 'NULL';

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        COALESCE(
          TRY_CONVERT(DATE, ${ingresoExpr}),
          (
            SELECT MIN(CAST(tl.FCNR AS DATE))
            FROM dbo.ATT_TIME_LOG tl
            WHERE tl.IDUSUARIO = c.id
          ),
          CAST(GETDATE() AS DATE)
        ) AS ingreso
      FROM dbo.COLABORADORES c
      WHERE c.id = @0;
      `,
      [colaboradorId],
    );

    const raw = String(rows?.[0]?.ingreso ?? rows?.[0]?.INGRESO ?? '').trim();
    const parsed = raw.length ? new Date(raw) : new Date();
    if (Number.isNaN(parsed.getTime())) return new Date();
    return parsed;
  }

  private toSolicitudView(
    solicitud: AttSolicitudEntity,
    tipo?: AttPermisoTipoEntity,
  ) {
    const tipoNombre = tipo?.nombre ?? '';
    return {
      id: solicitud.id,
      colaborador_id: solicitud.colaboradorId,
      tipo_id: solicitud.tipoId,
      tipo_nombre: tipoNombre,
      tipo_codigo: this.buildPermisoCode(tipoNombre),
      fecha_inicio: this.toDateIsoFromUnknown(solicitud.fechaInicio),
      fecha_fin: this.toDateIsoFromUnknown(solicitud.fechaFin),
      motivo: solicitud.motivo,
      evidencia_url: solicitud.evidenciaUrl,
      estatus: (solicitud.estatus ?? 'PENDIENTE').toUpperCase(),
      aprobado_por: solicitud.aprobadoPor,
      creado_en: solicitud.creadoEn,
      actualizado_en: solicitud.actualizadoEn,
    };
  }

  private resolveRange(startRaw: string, endRaw: string): DateRange {
    const start = this.parseIsoDateStrict(startRaw, 'fecha_inicio');
    const end = this.parseIsoDateStrict(endRaw, 'fecha_fin');

    const inicio = this.toDateIso(start);
    const fin = this.toDateIso(end);
    if (inicio > fin) {
      throw new BadRequestException(
        'fecha_inicio no puede ser mayor que fecha_fin',
      );
    }
    return {
      inicio,
      fin,
      inicioSql: this.toSqlServerDateTime(start, false),
      finSql: this.toSqlServerDateTime(end, true),
    };
  }

  private parseIsoDateStrict(raw: string, fieldName: string) {
    const value = String(raw ?? '').trim();
    if (!value.length) {
      throw new BadRequestException(`${fieldName} es requerido`);
    }

    const isoCandidate = value.includes('T') ? value : `${value}T00:00:00`;
    const parsed = new Date(isoCandidate);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        `${fieldName} inválido. Usa formato ISO-8601`,
      );
    }
    return parsed;
  }

  private toSqlServerDateTime(value: Date, endOfDay: boolean) {
    const date = new Date(value.getTime());
    if (endOfDay) {
      date.setHours(23, 59, 59, 0);
    } else {
      date.setHours(0, 0, 0, 0);
    }

    const y = date.getFullYear().toString().padStart(4, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  private toDateIso(value: Date) {
    const y = value.getFullYear().toString().padStart(4, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const d = value.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toDateIsoFromUnknown(value: unknown) {
    if (value == null) return '';

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return this.toDateIso(value);
    }

    const text = String(value).trim();
    if (!text.length) return '';
    const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch && isoMatch[1]) return isoMatch[1];

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return this.toDateIso(parsed);
    }
    return text.length >= 10 ? text.substring(0, 10) : text;
  }

  private buildPermisoCode(value: unknown) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 40);
  }

  private normalizeEnumCode(value: unknown) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  private cleanText(value: unknown, max: number) {
    const normalized = String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!normalized.length) return null;
    return normalized.length > max ? normalized.substring(0, max) : normalized;
  }

  private resolveExtension(originalName: string) {
    const ext = path.extname(String(originalName ?? '').trim()).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
    if (ext === '.png') return 'png';
    if (ext === '.pdf') return 'pdf';
    return 'bin';
  }

  private toInt(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  private toBool(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value ?? '')
      .trim()
      .toLowerCase();
    return text === '1' || text === 'true' || text === 'si' || text === 'sí';
  }

  private async syncIncidenciasMirror(
    solicitud: AttSolicitudEntity,
    tipoNombre: string | null,
  ) {
    if (!(await this.tableExists('dbo.INCIDENCIAS'))) return;
    const solicitudId = Number(solicitud.id ?? 0);
    const idUsuario = Number(solicitud.colaboradorId ?? 0);
    if (!Number.isFinite(solicitudId) || solicitudId <= 0) return;
    if (!Number.isFinite(idUsuario) || idUsuario <= 0) return;

    const tipo = this.cleanText(tipoNombre, 30) ?? 'Permiso';
    const inicio = this.toDateIsoFromUnknown(solicitud.fechaInicio);
    const fin = this.toDateIsoFromUnknown(solicitud.fechaFin);
    const estatus = this.normalizeEnumCode(solicitud.estatus ?? 'PENDIENTE');

    await this.dataSource.query(
      `
      MERGE dbo.INCIDENCIAS AS tgt
      USING (
        SELECT
          @0 AS solicitud_id,
          @1 AS idusuario,
          @2 AS tipo,
          CAST(@3 AS DATE) AS fecha_inicio,
          CAST(@4 AS DATE) AS fecha_fin,
          @5 AS estatus
      ) AS src
      ON tgt.solicitud_id = src.solicitud_id
      WHEN MATCHED THEN
        UPDATE SET
          tgt.idusuario = src.idusuario,
          tgt.tipo = src.tipo,
          tgt.fecha_inicio = src.fecha_inicio,
          tgt.fecha_fin = src.fecha_fin,
          tgt.estatus = src.estatus,
          tgt.actualizado_en = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (
          idusuario,
          tipo,
          fecha_inicio,
          fecha_fin,
          estatus,
          solicitud_id,
          creado_en,
          actualizado_en
        )
        VALUES (
          src.idusuario,
          src.tipo,
          src.fecha_inicio,
          src.fecha_fin,
          src.estatus,
          src.solicitud_id,
          GETDATE(),
          GETDATE()
        );
      `,
      [solicitudId, idUsuario, tipo, inicio, fin, estatus],
    );
  }

  private async ensureCoreTables() {
    await this.ensureTable('dbo.ATT_PERMISOS_TIPOS');
    await this.ensureTable('dbo.ATT_SOLICITUDES');
    await this.ensureTable('dbo.ATT_VACACIONES_SALDOS');
  }

  private async ensureTable(qualifiedName: string) {
    if (!(await this.tableExists(qualifiedName))) {
      throw new BadRequestException(
        `No existe ${qualifiedName}. Ejecuta script 126_ATT_INCIDENCIAS_VACACIONES_create.sql`,
      );
    }
  }

  private async tableExists(qualifiedName: string) {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN OBJECT_ID(@0, 'U') IS NULL THEN 0 ELSE 1 END AS exists_flag;
      `,
      [qualifiedName],
    );
    return Number(rows?.[0]?.exists_flag ?? rows?.[0]?.EXISTS_FLAG ?? 0) === 1;
  }

  private async columnExists(qualifiedTable: string, column: string) {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN COL_LENGTH(@0, @1) IS NULL THEN 0 ELSE 1 END AS exists_flag;
      `,
      [qualifiedTable, column],
    );
    return Number(rows?.[0]?.exists_flag ?? rows?.[0]?.EXISTS_FLAG ?? 0) === 1;
  }

  private async logAudit(
    accion: string,
    ctx: RequestContext,
    details: Record<string, unknown>,
  ) {
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
      VALUES (@0, @1, 'incidencias-vacaciones', @2, @3, GETDATE());
      `,
      [ctx.actorId, accion, ctx.ip, JSON.stringify(details)],
    );
  }
}
