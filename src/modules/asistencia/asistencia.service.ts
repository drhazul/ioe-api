import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AsistenciaReporteDto } from './dto/asistencia-reporte.dto';
import { IncidenciasVacacionesService } from '../incidencias-vacaciones/incidencias-vacaciones.service';
import { LaborLawService } from './labor-law.service';

export type AsistenciaReporteRow = {
  fecha: string;
  workday_id: string;
  colaborador_id: number;
  sucursal_id: number | null;
  pin: string;
  nombre: string;
  rfc: string | null;
  curp: string | null;
  entrada: string | null;
  salida: string | null;
  estatus: 'OK' | 'RETARDO' | 'FALTA' | 'SALIDA_TEMPRANA' | 'ERROR_MARCAJE';
  suc: string | null;
  horario_nombre: string | null;
  minutos_trabajados: number;
  minutos_extra: number;
  retardo_minutos: number;
  salida_temprana_minutos: number;
  flexible_cumplido: boolean;
  jornada_tipo?: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
  jornada_horas_objetivo?: number;
  cumple_jornada_lft?: boolean;
  horas_extra_dobles?: number;
  horas_extra_triples?: number;
  aplica_prima_dominical?: boolean;
  aplica_septimo_dia_descanso?: boolean;
};

export type AsistenciaReporteResult = {
  ok: true;
  source: string;
  desde: string;
  hasta: string;
  total: number;
  rows: AsistenciaReporteRow[];
};

type SourceDefinition = {
  table: string;
  userColumn: string;
  dateColumn: string;
  tipoColumn: string;
};

export type TimelogHashInput = {
  idUsuario: number;
  timestampIso: string;
  tipoEvento: string;
  lat: number | null;
  lon: number | null;
};

export function buildCanonicalTimelogTimestampIso(timestampIso?: string): string {
  const base = timestampIso != null ? new Date(timestampIso) : new Date();
  if (Number.isNaN(base.getTime())) {
    throw new BadRequestException('timestampIso invalido para hash de marcaje');
  }
  const atSecond = Math.trunc(base.getTime() / 1000) * 1000;
  return new Date(atSecond).toISOString();
}

export function buildTimelogVerificationHash(input: TimelogHashInput): string {
  const timestamp = buildCanonicalTimelogTimestampIso(input.timestampIso);
  const tipo = String(input.tipoEvento ?? '').trim().toUpperCase();
  const lat =
    input.lat == null || !Number.isFinite(input.lat)
      ? 'NULL'
      : Number(input.lat).toFixed(7);
  const lon =
    input.lon == null || !Number.isFinite(input.lon)
      ? 'NULL'
      : Number(input.lon).toFixed(7);
  const payload = `${Math.trunc(input.idUsuario)}|${timestamp}|${tipo}|${lat},${lon}`;
  return createHash('sha256').update(payload).digest('hex');
}

@Injectable()
export class AsistenciaService implements OnModuleInit {
  private readonly logger = new Logger(AsistenciaService.name);
  private readonly cronName = 'asistencia-estatus-01-00';
  private readonly orphanCronName = 'asistencia-huerfanos-23-58';

  constructor(
    private readonly dataSource: DataSource,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly incidenciasVacacionesService: IncidenciasVacacionesService,
    private readonly laborLawService: LaborLawService,
  ) {}

  onModuleInit() {
    this.ensureNightlyCronRegistered();
    this.ensureOrphanCronRegistered();
  }

  async reporte(query: AsistenciaReporteDto): Promise<AsistenciaReporteResult> {
    const filters = this.resolveFilters(query);
    const source = await this.resolveSourceDefinition();
    const hasColaboradorHorarios = await this.tableExists(
      'dbo.COLABORADORES_HORARIOS',
    );

    const rows = await this.dataSource.query(
      this.buildReporteQuery(source, hasColaboradorHorarios),
      [
        filters.fechaInicio,
        filters.fechaFin,
        filters.sucursalId,
        filters.pin,
        filters.departamentoId,
        filters.cargoId,
      ],
    );

    const normalizedRows = ((rows as Record<string, unknown>[]) ?? []).map(
      (row): AsistenciaReporteRow => ({
        fecha: this.readString(row, 'fecha') ?? filters.fechaInicio,
        workday_id: this.readString(row, 'workday_id') ?? filters.fechaInicio,
        colaborador_id: this.readInt(row, 'colaborador_id') ?? 0,
        sucursal_id: this.readInt(row, 'sucursal_id'),
        pin: this.readString(row, 'pin') ?? '',
        nombre: this.readString(row, 'nombre') ?? '',
        rfc: this.readString(row, 'rfc'),
        curp: this.readString(row, 'curp'),
        entrada: this.readString(row, 'entrada'),
        salida: this.readString(row, 'salida'),
        estatus: this.normalizeEstatus(this.readString(row, 'estatus')),
        suc: this.readString(row, 'suc'),
        horario_nombre: this.readString(row, 'horario_nombre'),
        minutos_trabajados: this.readInt(row, 'minutos_trabajados') ?? 0,
        minutos_extra: this.readInt(row, 'minutos_extra') ?? 0,
        retardo_minutos: this.readInt(row, 'retardo_minutos') ?? 0,
        salida_temprana_minutos:
          this.readInt(row, 'salida_temprana_minutos') ?? 0,
        flexible_cumplido: this.readBool(row, 'flexible_cumplido'),
      }),
    );

    const enrichedRows = await this.laborLawService.enrichReporteRows(normalizedRows);

    return {
      ok: true,
      source: source.table,
      desde: filters.fechaInicio,
      hasta: filters.fechaFin,
      total: enrichedRows.length,
      rows: enrichedRows,
    };
  }

  async processDailyAttendance(dateIso?: string) {
    const effectiveDate = dateIso?.trim().length
      ? this.toDateIso(new Date(dateIso))
      : this.toDateIso(new Date(Date.now() - 24 * 60 * 60 * 1000));

    await this.ensureEstatusTable();

    const report = await this.reporte({
      fecha_inicio: effectiveDate,
      fecha_fin: effectiveDate,
    });
    const permisoCodesByColaborador =
      await this.incidenciasVacacionesService.getApprovedPermissionCodeMapForDate(
        effectiveDate,
        report.rows.map((row) => row.colaborador_id),
      );

    let upserted = 0;

    for (const row of report.rows) {
      const permisoCode = permisoCodesByColaborador.get(row.colaborador_id);
      const orphanMark = row.entrada != null && row.salida == null;
      const definitive = orphanMark
        ? 'ERROR_MARCAJE'
        : this.toDefinitiveStatus(row.estatus, permisoCode);

      await this.dataSource.query(
        `
        MERGE dbo.ATT_ASISTENCIA_ESTATUS AS tgt
        USING (
          SELECT
            @0 AS colaborador_id,
            @1 AS sucursal_id,
            @2 AS workday_id,
            @3 AS fecha,
            @4 AS entrada,
            @5 AS salida,
            @6 AS minutos_trabajados,
            @7 AS minutos_extra,
            @8 AS retardo_minutos,
            @9 AS salida_temprana_minutos,
            @10 AS estatus,
            @11 AS flexible_cumplido
        ) AS src
        ON tgt.colaborador_id = src.colaborador_id
         AND tgt.workday_id = src.workday_id
        WHEN MATCHED THEN
          UPDATE SET
            tgt.sucursal_id = src.sucursal_id,
            tgt.fecha = src.fecha,
            tgt.entrada = src.entrada,
            tgt.salida = src.salida,
            tgt.minutos_trabajados = src.minutos_trabajados,
            tgt.minutos_extra = src.minutos_extra,
            tgt.retardo_minutos = src.retardo_minutos,
            tgt.salida_temprana_minutos = src.salida_temprana_minutos,
            tgt.estatus = src.estatus,
            tgt.flexible_cumplido = src.flexible_cumplido,
            tgt.actualizado_en = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (
            colaborador_id,
            sucursal_id,
            workday_id,
            fecha,
            entrada,
            salida,
            minutos_trabajados,
            minutos_extra,
            retardo_minutos,
            salida_temprana_minutos,
            estatus,
            flexible_cumplido,
            creado_en,
            actualizado_en
          )
          VALUES (
            src.colaborador_id,
            src.sucursal_id,
            src.workday_id,
            src.fecha,
            src.entrada,
            src.salida,
            src.minutos_trabajados,
            src.minutos_extra,
            src.retardo_minutos,
            src.salida_temprana_minutos,
            src.estatus,
            src.flexible_cumplido,
            GETDATE(),
            GETDATE()
          );
        `,
        [
          row.colaborador_id,
          row.sucursal_id,
          row.workday_id,
          row.fecha,
          row.entrada,
          row.salida,
          row.minutos_trabajados,
          row.minutos_extra,
          row.retardo_minutos,
          row.salida_temprana_minutos,
          definitive,
          row.flexible_cumplido ? 1 : 0,
        ],
      );

      upserted += 1;
    }

    await this.laborLawService.registerSeventhDayPaidRest(report.rows);

    return {
      ok: true,
      date: effectiveDate,
      source: report.source,
      total: report.total,
      upserted,
    };
  }

  async markOrphanMarks(dateIso?: string) {
    const effectiveDate = dateIso?.trim().length
      ? this.toDateIso(new Date(dateIso))
      : this.toDateIso(new Date());

    await this.ensureEstatusTable();

    const report = await this.reporte({
      fecha_inicio: effectiveDate,
      fecha_fin: effectiveDate,
    });

    const orphanRows = report.rows.filter(
      (row) => row.entrada != null && row.salida == null,
    );

    let upserted = 0;
    for (const row of orphanRows) {
      await this.dataSource.query(
        `
        MERGE dbo.ATT_ASISTENCIA_ESTATUS AS tgt
        USING (
          SELECT
            @0 AS colaborador_id,
            @1 AS sucursal_id,
            @2 AS workday_id,
            @3 AS fecha,
            @4 AS entrada,
            @5 AS salida,
            @6 AS minutos_trabajados,
            @7 AS minutos_extra,
            @8 AS retardo_minutos,
            @9 AS salida_temprana_minutos,
            @10 AS estatus,
            @11 AS flexible_cumplido
        ) AS src
        ON tgt.colaborador_id = src.colaborador_id
         AND tgt.workday_id = src.workday_id
        WHEN MATCHED THEN
          UPDATE SET
            tgt.sucursal_id = src.sucursal_id,
            tgt.fecha = src.fecha,
            tgt.entrada = src.entrada,
            tgt.salida = src.salida,
            tgt.minutos_trabajados = src.minutos_trabajados,
            tgt.minutos_extra = src.minutos_extra,
            tgt.retardo_minutos = src.retardo_minutos,
            tgt.salida_temprana_minutos = src.salida_temprana_minutos,
            tgt.estatus = src.estatus,
            tgt.flexible_cumplido = src.flexible_cumplido,
            tgt.actualizado_en = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (
            colaborador_id,
            sucursal_id,
            workday_id,
            fecha,
            entrada,
            salida,
            minutos_trabajados,
            minutos_extra,
            retardo_minutos,
            salida_temprana_minutos,
            estatus,
            flexible_cumplido,
            creado_en,
            actualizado_en
          )
          VALUES (
            src.colaborador_id,
            src.sucursal_id,
            src.workday_id,
            src.fecha,
            src.entrada,
            src.salida,
            src.minutos_trabajados,
            src.minutos_extra,
            src.retardo_minutos,
            src.salida_temprana_minutos,
            src.estatus,
            src.flexible_cumplido,
            GETDATE(),
            GETDATE()
          );
        `,
        [
          row.colaborador_id,
          row.sucursal_id,
          row.workday_id,
          row.fecha,
          row.entrada,
          row.salida,
          row.minutos_trabajados,
          row.minutos_extra,
          row.retardo_minutos,
          row.salida_temprana_minutos,
          'ERROR_MARCAJE',
          row.flexible_cumplido ? 1 : 0,
        ],
      );

      upserted += 1;
    }

    return {
      ok: true,
      date: effectiveDate,
      totalOrphans: orphanRows.length,
      upserted,
    };
  }

  async setPeriodoCierre(input: {
    fechaInicio: string;
    fechaFin: string;
    cerrado: boolean;
    motivo?: string | null;
    actorId?: number | null;
  }) {
    await this.ensurePeriodosTable();

    const fechaInicio = this.toDateIso(new Date(input.fechaInicio));
    const fechaFin = this.toDateIso(new Date(input.fechaFin));
    if (fechaInicio > fechaFin) {
      throw new BadRequestException(
        'fecha_inicio no puede ser mayor a fecha_fin',
      );
    }

    const rows = await this.dataSource.query(
      `
      MERGE dbo.PERIODOS_CIERRE AS tgt
      USING (
        SELECT
          @0 AS fecha_inicio,
          @1 AS fecha_fin,
          @2 AS estatus,
          @3 AS motivo,
          @4 AS updated_by
      ) AS src
      ON tgt.fecha_inicio = src.fecha_inicio
       AND tgt.fecha_fin = src.fecha_fin
      WHEN MATCHED THEN
        UPDATE SET
          tgt.estatus = src.estatus,
          tgt.motivo = src.motivo,
          tgt.updated_by = src.updated_by,
          tgt.updated_at = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (
          fecha_inicio,
          fecha_fin,
          estatus,
          motivo,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          src.fecha_inicio,
          src.fecha_fin,
          src.estatus,
          src.motivo,
          src.updated_by,
          src.updated_by,
          GETDATE(),
          GETDATE()
        )
      OUTPUT
        inserted.id,
        inserted.fecha_inicio,
        inserted.fecha_fin,
        inserted.estatus,
        inserted.motivo,
        inserted.created_by,
        inserted.updated_by,
        inserted.created_at,
        inserted.updated_at;
      `,
      [
        fechaInicio,
        fechaFin,
        input.cerrado ? 'CERRADO' : 'ABIERTO',
        (input.motivo ?? '').trim() || null,
        input.actorId ?? null,
      ],
    );

    return {
      ok: true,
      item: rows?.[0] ?? null,
    };
  }

  async listPeriodosCierre() {
    await this.ensurePeriodosTable();
    const rows = await this.dataSource.query(
      `
      SELECT
        id,
        fecha_inicio,
        fecha_fin,
        estatus,
        motivo,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM dbo.PERIODOS_CIERRE
      ORDER BY fecha_inicio DESC, fecha_fin DESC;
      `,
    );
    return {
      ok: true,
      total: Array.isArray(rows) ? rows.length : 0,
      rows,
    };
  }

  private resolveFilters(query: AsistenciaReporteDto) {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const hasInicio = (query.fecha_inicio ?? '').trim().length > 0;
    const hasFin = (query.fecha_fin ?? '').trim().length > 0;

    if (hasInicio !== hasFin) {
      throw new BadRequestException(
        'fecha_inicio y fecha_fin deben enviarse juntas en formato ISO',
      );
    }

    const start = hasInicio
      ? new Date(String(query.fecha_inicio))
      : defaultStart;
    const end = hasFin ? new Date(String(query.fecha_fin)) : defaultEnd;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Fechas inválidas. Usa formato ISO YYYY-MM-DD');
    }

    const startIso = this.toDateIso(start);
    const endIso = this.toDateIso(end);

    if (startIso > endIso) {
      throw new BadRequestException('fecha_inicio no puede ser mayor a fecha_fin');
    }

    const rangeDays =
      Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (rangeDays > 370) {
      throw new BadRequestException('Rango demasiado amplio. Máximo 370 días.');
    }

    return {
      fechaInicio: startIso,
      fechaFin: endIso,
      sucursalId: query.sucursal_id ?? null,
      pin: this.normalizeUpperNullable(query.pin),
      departamentoId: query.departamento_id ?? null,
      cargoId: query.cargo_id ?? null,
    };
  }

  private buildReporteQuery(
    source: SourceDefinition,
    hasColaboradorHorarios: boolean,
  ) {
    const table = this.safeIdentifier(source.table);
    const userColumn = this.safeIdentifier(source.userColumn);
    const dateColumn = this.safeIdentifier(source.dateColumn);
    const tipoColumn = this.safeIdentifier(source.tipoColumn);

    const unionHorarios = hasColaboradorHorarios
      ? `
      UNION ALL
      SELECT
        ch.colaborador_id,
        h.id AS horario_id,
        h.nombre AS horario_nombre,
        CAST(h.hora_entrada AS TIME) AS hora_entrada,
        CAST(h.hora_salida AS TIME) AS hora_salida,
        ISNULL(h.tolerancia_minutos, 0) AS tolerancia_minutos,
        CAST(ISNULL(h.inicio_entrada, h.hora_entrada) AS TIME) AS inicio_entrada,
        CAST(ISNULL(h.fin_entrada, h.hora_entrada) AS TIME) AS fin_entrada,
        ISNULL(h.minutos_almuerzo, 0) AS minutos_almuerzo,
        ISNULL(h.redondeo_entrada, 0) AS redondeo_entrada,
        ISNULL(h.es_flexible, 0) AS es_flexible,
        ISNULL(h.ot_minimo_minutos, 0) AS ot_minimo_minutos,
        ISNULL(h.ot_requiere_autorizacion, 0) AS ot_requiere_autorizacion,
        ISNULL(ch.prioridad, 1) AS prioridad
      FROM dbo.COLABORADORES_HORARIOS ch
      INNER JOIN dbo.ATT_RULES_HORARIOS h
        ON h.id = ch.horario_id
      WHERE ISNULL(ch.activo, 1) = 1
      `
      : '';

    return `
      DECLARE @start DATE = @0;
      DECLARE @end DATE = @1;
      DECLARE @sucursal_id INT = @2;
      DECLARE @pin VARCHAR(30) = @3;
      DECLARE @departamento_id INT = @4;
      DECLARE @cargo_id INT = @5;

      ;WITH colaboradores_scope AS (
        SELECT
          c.id,
          c.pin,
          c.nombre,
          c.apellido,
          c.rfc,
          c.curp,
          c.sucursal_id,
          sc.codigo AS suc_codigo,
          c.horario_id
        FROM dbo.COLABORADORES c
        LEFT JOIN dbo.SUCURSALES sc
          ON sc.id = c.sucursal_id
        LEFT JOIN dbo.DEPARTAMENTO d
          ON d.ACTIVO = 1
         AND UPPER(LTRIM(RTRIM(ISNULL(d.NOMBRE, '')))) =
             UPPER(LTRIM(RTRIM(ISNULL(c.departamento, ''))))
        WHERE c.estado = 1
          AND (@pin IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(c.pin, '')))) = @pin)
          AND (@sucursal_id IS NULL OR c.sucursal_id = @sucursal_id)
          AND (@departamento_id IS NULL OR d.IDDEPTO = @departamento_id)
      ),
      fechas AS (
        SELECT @start AS fecha
        UNION ALL
        SELECT DATEADD(DAY, 1, fecha)
        FROM fechas
        WHERE fecha < @end
      ),
      base AS (
        SELECT
          cs.id,
          cs.pin,
          cs.nombre,
          cs.apellido,
          cs.rfc,
          cs.curp,
          cs.suc_codigo,
          cs.sucursal_id,
          f.fecha
        FROM colaboradores_scope cs
        CROSS JOIN fechas f
      ),
      marcas AS (
        SELECT
          cs.id AS colaborador_id,
          CAST(
            DATEADD(
              DAY,
              CASE
                WHEN CAST(src.[${dateColumn}] AS TIME) < '04:00:00' THEN -1
                ELSE 0
              END,
              CAST(src.[${dateColumn}] AS DATE)
            ) AS DATE
          ) AS workday_id,
          MIN(
            CASE
              WHEN UPPER(LTRIM(RTRIM(ISNULL(src.[${tipoColumn}], '')))) IN ('ENTRADA', 'REGRESO_COMER')
                THEN CAST(src.[${dateColumn}] AS DATETIME2(0))
            END
          ) AS entrada,
          MAX(
            CASE
              WHEN UPPER(LTRIM(RTRIM(ISNULL(src.[${tipoColumn}], '')))) IN ('SALIDA', 'SALIDA_COMER')
                THEN CAST(src.[${dateColumn}] AS DATETIME2(0))
            END
          ) AS salida
        FROM dbo.[${table}] src
        INNER JOIN colaboradores_scope cs
          ON (
            TRY_CONVERT(INT, cs.pin) = TRY_CONVERT(INT, src.[${userColumn}])
            OR cs.pin = CONVERT(VARCHAR(30), src.[${userColumn}])
            OR cs.id = TRY_CONVERT(INT, src.[${userColumn}])
          )
        WHERE CAST(
            DATEADD(
              DAY,
              CASE
                WHEN CAST(src.[${dateColumn}] AS TIME) < '04:00:00' THEN -1
                ELSE 0
              END,
              CAST(src.[${dateColumn}] AS DATE)
            ) AS DATE
          ) BETWEEN @start AND @end
        GROUP BY
          cs.id,
          CAST(
            DATEADD(
              DAY,
              CASE
                WHEN CAST(src.[${dateColumn}] AS TIME) < '04:00:00' THEN -1
                ELSE 0
              END,
              CAST(src.[${dateColumn}] AS DATE)
            ) AS DATE
          )
      ),
      horarios_pool AS (
        SELECT
          c.id AS colaborador_id,
          h.id AS horario_id,
          h.nombre AS horario_nombre,
          CAST(h.hora_entrada AS TIME) AS hora_entrada,
          CAST(h.hora_salida AS TIME) AS hora_salida,
          ISNULL(h.tolerancia_minutos, 0) AS tolerancia_minutos,
          CAST(ISNULL(h.inicio_entrada, h.hora_entrada) AS TIME) AS inicio_entrada,
          CAST(ISNULL(h.fin_entrada, h.hora_entrada) AS TIME) AS fin_entrada,
          ISNULL(h.minutos_almuerzo, 0) AS minutos_almuerzo,
          ISNULL(h.redondeo_entrada, 0) AS redondeo_entrada,
          ISNULL(h.es_flexible, 0) AS es_flexible,
          ISNULL(h.ot_minimo_minutos, 0) AS ot_minimo_minutos,
          ISNULL(h.ot_requiere_autorizacion, 0) AS ot_requiere_autorizacion,
          0 AS prioridad
        FROM dbo.COLABORADORES c
        INNER JOIN dbo.ATT_RULES_HORARIOS h
          ON h.id = c.horario_id
        ${unionHorarios}
      )
      SELECT
        CONVERT(VARCHAR(10), b.fecha, 23) AS fecha,
        CONVERT(VARCHAR(10), b.fecha, 23) AS workday_id,
        b.id AS colaborador_id,
        b.sucursal_id,
        b.pin,
        CONCAT(ISNULL(b.nombre, ''), ' ', ISNULL(b.apellido, '')) AS nombre,
        NULLIF(LTRIM(RTRIM(ISNULL(b.rfc, ''))), '') AS rfc,
        NULLIF(LTRIM(RTRIM(ISNULL(b.curp, ''))), '') AS curp,
        CASE
          WHEN m.entrada IS NULL THEN NULL
          ELSE CONVERT(VARCHAR(8), CAST(m.entrada AS TIME), 108)
        END AS entrada,
        CASE
          WHEN m.salida IS NULL THEN NULL
          ELSE CONVERT(VARCHAR(8), CAST(m.salida AS TIME), 108)
        END AS salida,
        eval.estatus,
        b.suc_codigo AS suc,
        hs.horario_nombre,
        mins.minutos_trabajados,
        penalties.minutos_extra,
        penalties.retardo_minutos,
        penalties.salida_temprana_minutos,
        eval.flexible_cumplido
      FROM base b
      LEFT JOIN marcas m
        ON m.colaborador_id = b.id
       AND m.workday_id = b.fecha
      OUTER APPLY (
        SELECT TOP 1 hp.*
        FROM horarios_pool hp
        WHERE hp.colaborador_id = b.id
        ORDER BY
          CASE
            WHEN m.entrada IS NULL THEN ISNULL(hp.prioridad, 9999)
            ELSE ABS(DATEDIFF(MINUTE, hp.hora_entrada, CAST(m.entrada AS TIME)))
          END,
          ISNULL(hp.prioridad, 9999),
          hp.horario_id
      ) hs
      OUTER APPLY (
        SELECT
          CASE
            WHEN hs.hora_entrada IS NULL THEN NULL
            ELSE DATEADD(
              SECOND,
              DATEDIFF(SECOND, CAST('00:00:00' AS TIME), hs.hora_entrada),
              CAST(b.fecha AS DATETIME2(0))
            )
          END AS shift_start_dt,
          CASE
            WHEN hs.hora_salida IS NULL THEN NULL
            ELSE DATEADD(
              DAY,
              CASE
                WHEN hs.hora_entrada IS NOT NULL AND hs.hora_salida <= hs.hora_entrada THEN 1
                ELSE 0
              END,
              DATEADD(
                SECOND,
                DATEDIFF(SECOND, CAST('00:00:00' AS TIME), hs.hora_salida),
                CAST(b.fecha AS DATETIME2(0))
              )
            )
          END AS shift_end_dt
      ) shift
      OUTER APPLY (
        SELECT
          CASE
            WHEN m.entrada IS NULL THEN NULL
            WHEN ISNULL(hs.redondeo_entrada, 0) <= 0 THEN CAST(m.entrada AS DATETIME2(0))
            ELSE DATEADD(
              MINUTE,
              ((DATEDIFF(MINUTE, 0, m.entrada) + hs.redondeo_entrada - 1) / hs.redondeo_entrada) * hs.redondeo_entrada,
              0
            )
          END AS entrada_redondeada,
          CASE
            WHEN m.entrada IS NOT NULL AND m.salida IS NOT NULL AND m.salida > m.entrada
              THEN DATEDIFF(MINUTE, m.entrada, m.salida)
            ELSE 0
          END AS minutos_brutos,
          CASE
            WHEN shift.shift_start_dt IS NOT NULL
              AND shift.shift_end_dt IS NOT NULL
              AND shift.shift_end_dt > shift.shift_start_dt
              THEN DATEDIFF(MINUTE, shift.shift_start_dt, shift.shift_end_dt)
            ELSE 0
          END AS minutos_turno_base
      ) met
      OUTER APPLY (
        SELECT
          CASE
            WHEN met.minutos_brutos - ISNULL(hs.minutos_almuerzo, 0) > 0
              THEN met.minutos_brutos - ISNULL(hs.minutos_almuerzo, 0)
            ELSE 0
          END AS minutos_trabajados,
          CASE
            WHEN met.minutos_turno_base - ISNULL(hs.minutos_almuerzo, 0) > 0
              THEN met.minutos_turno_base - ISNULL(hs.minutos_almuerzo, 0)
            ELSE 0
          END AS minutos_turno
      ) mins
      OUTER APPLY (
        SELECT
          CASE
            WHEN m.salida IS NULL OR shift.shift_end_dt IS NULL THEN 0
            WHEN m.salida <= shift.shift_end_dt THEN 0
            WHEN DATEDIFF(MINUTE, shift.shift_end_dt, m.salida) < ISNULL(hs.ot_minimo_minutos, 0) THEN 0
            WHEN ISNULL(hs.ot_requiere_autorizacion, 0) = 1 THEN 0
            ELSE DATEDIFF(MINUTE, shift.shift_end_dt, m.salida)
          END AS minutos_extra,
          CASE
            WHEN m.salida IS NULL OR shift.shift_end_dt IS NULL THEN 0
            WHEN m.salida >= shift.shift_end_dt THEN 0
            ELSE DATEDIFF(MINUTE, m.salida, shift.shift_end_dt)
          END AS salida_temprana_minutos,
          CASE
            WHEN met.entrada_redondeada IS NULL OR hs.hora_entrada IS NULL OR shift.shift_start_dt IS NULL THEN 0
            WHEN met.entrada_redondeada < DATEADD(MINUTE, ISNULL(hs.tolerancia_minutos, 0), shift.shift_start_dt) THEN 0
            ELSE DATEDIFF(
              MINUTE,
              shift.shift_start_dt,
              met.entrada_redondeada
            )
          END AS retardo_minutos
      ) penalties
      OUTER APPLY (
        SELECT
          CASE
            WHEN m.entrada IS NULL AND m.salida IS NULL THEN 'FALTA'
            WHEN ISNULL(hs.es_flexible, 0) = 1
              THEN CASE
                     WHEN mins.minutos_trabajados >= mins.minutos_turno THEN 'OK'
                     ELSE 'SALIDA_TEMPRANA'
                   END
            WHEN penalties.salida_temprana_minutos > 0 THEN 'SALIDA_TEMPRANA'
            WHEN penalties.retardo_minutos > 0 THEN 'RETARDO'
            ELSE 'OK'
          END AS estatus,
          CASE
            WHEN ISNULL(hs.es_flexible, 0) = 1
              AND m.entrada IS NOT NULL
              AND m.salida IS NOT NULL
              AND mins.minutos_trabajados >= mins.minutos_turno
              THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
          END AS flexible_cumplido
      ) eval
      ORDER BY b.fecha ASC, nombre ASC
      OPTION (MAXRECURSION 370);
    `;
  }

  private async resolveSourceDefinition(): Promise<SourceDefinition> {
    const availableRows = await this.dataSource.query(`
      SELECT name
      FROM sys.tables
      WHERE schema_id = SCHEMA_ID('dbo')
        AND name IN ('ATT_ASISTENCIA', 'ATT_TIME_LOG');
    `);

    const names = new Set(
      ((availableRows as Record<string, unknown>[]) ?? [])
        .map((row) => this.readString(row, 'name'))
        .filter((value): value is string => value != null)
        .map((value) => value.toUpperCase()),
    );

    const candidates = ['ATT_ASISTENCIA', 'ATT_TIME_LOG'];

    for (const candidate of candidates) {
      if (!names.has(candidate)) continue;

      const columnsRows = await this.dataSource.query(
        `
        SELECT c.name
        FROM sys.columns c
        INNER JOIN sys.tables t
          ON t.object_id = c.object_id
        WHERE t.schema_id = SCHEMA_ID('dbo')
          AND t.name = @0;
        `,
        [candidate],
      );

      const columns = new Map<string, string>();
      for (const row of (columnsRows as Record<string, unknown>[]) ?? []) {
        const value = this.readString(row, 'name');
        if (value != null) {
          columns.set(value.toUpperCase(), value);
        }
      }

      const userColumn = this.pickColumn(columns, [
        'IDUSUARIO',
        'ID_USUARIO',
        'USUARIO_ID',
        'PIN',
      ]);
      const dateColumn = this.pickColumn(columns, [
        'FCNR',
        'FECHA_MARCA',
        'FECHA_MARCAJE',
        'FECHA_HORA',
        'FECHA',
      ]);
      const tipoColumn = this.pickColumn(columns, ['TIPO', 'EVENTO']);

      if (userColumn && dateColumn && tipoColumn) {
        return {
          table: candidate,
          userColumn,
          dateColumn,
          tipoColumn,
        };
      }
    }

    throw new BadRequestException(
      'No hay tabla fuente válida para reporte. Requiere ATT_ASISTENCIA o ATT_TIME_LOG.',
    );
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

  private async ensureEstatusTable() {
    const exists = await this.tableExists('dbo.ATT_ASISTENCIA_ESTATUS');
    if (!exists) {
      throw new BadRequestException(
        'No existe ATT_ASISTENCIA_ESTATUS. Ejecuta script 124_HORARIOS_REGLAS_ASISTENCIA_AVANZADAS_create.sql',
      );
    }
  }

  private ensureNightlyCronRegistered() {
    let job: CronJob | null = null;
    try {
      job = this.schedulerRegistry.getCronJob(this.cronName);
    } catch {
      job = null;
    }

    if (job == null) {
      const newJob = new CronJob(
        '0 1 * * *',
        () => {
          void this.runNightlyProcessing();
        },
        null,
        false,
        'America/Mexico_City',
      );
      this.schedulerRegistry.addCronJob(this.cronName, newJob);
      newJob.start();
      this.logger.log(
        `Cron registrado: ${this.cronName} (01:00 America/Mexico_City)`,
      );
      return;
    }

    job.start();
    this.logger.log(
      `Cron ya existente y activo: ${this.cronName} (01:00 America/Mexico_City)`,
    );
  }

  private ensureOrphanCronRegistered() {
    let job: CronJob | null = null;
    try {
      job = this.schedulerRegistry.getCronJob(this.orphanCronName);
    } catch {
      job = null;
    }

    if (job == null) {
      const newJob = new CronJob(
        '58 23 * * *',
        () => {
          void this.runOrphanNightlyProcessing();
        },
        null,
        false,
        'America/Mexico_City',
      );
      this.schedulerRegistry.addCronJob(this.orphanCronName, newJob);
      newJob.start();
      this.logger.log(
        `Cron registrado: ${this.orphanCronName} (23:58 America/Mexico_City)`,
      );
      return;
    }

    job.start();
    this.logger.log(
      `Cron ya existente y activo: ${this.orphanCronName} (23:58 America/Mexico_City)`,
    );
  }

  private async runNightlyProcessing() {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const dateIso = this.toDateIso(target);

    try {
      const result = await this.processDailyAttendance(dateIso);
      this.logger.log(
        `Cron estatus ejecutado. fecha=${dateIso} upserted=${result.upserted}`,
      );
    } catch (error) {
      this.logger.error(`Cron estatus falló: ${this.extractError(error)}`);
    }
  }

  private async runOrphanNightlyProcessing() {
    const dateIso = this.toDateIso(new Date());
    try {
      const result = await this.markOrphanMarks(dateIso);
      this.logger.log(
        `Cron huérfanos ejecutado. fecha=${dateIso} upserted=${result.upserted}`,
      );
    } catch (error) {
      this.logger.error(`Cron huérfanos falló: ${this.extractError(error)}`);
    }
  }

  private toDefinitiveStatus(
    estatus: 'OK' | 'RETARDO' | 'FALTA' | 'SALIDA_TEMPRANA' | 'ERROR_MARCAJE',
    permisoCode?: string | null,
  ): string {
    if (estatus === 'ERROR_MARCAJE') return 'ERROR_MARCAJE';
    if (estatus === 'FALTA' && (permisoCode ?? '').trim().length) {
      return String(permisoCode).trim().toUpperCase();
    }
    if (estatus === 'FALTA') return 'FALTA';
    if (estatus === 'RETARDO') return 'RETARDO';
    if (estatus === 'SALIDA_TEMPRANA') return 'SALIDA_TEMPRANA';
    return 'ASISTIO';
  }

  private async ensurePeriodosTable() {
    const exists = await this.tableExists('dbo.PERIODOS_CIERRE');
    if (!exists) {
      throw new BadRequestException(
        'No existe PERIODOS_CIERRE. Ejecuta script 127_AUTOSERVICIO_CIERRE_AUDIT_create.sql',
      );
    }
  }

  private pickColumn(
    columns: Map<string, string>,
    candidates: string[],
  ): string | null {
    for (const candidate of candidates) {
      if (columns.has(candidate)) {
        return columns.get(candidate) ?? null;
      }
    }
    return null;
  }

  private safeIdentifier(value: string) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      throw new BadRequestException(`Identificador SQL inválido: ${value}`);
    }
    return value;
  }

  private normalizeUpperNullable(value: unknown) {
    const text = String(value ?? '').trim().toUpperCase();
    return text.length ? text : null;
  }

  private toDateIso(value: Date) {
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('Fecha inválida');
    }
    const y = value.getFullYear().toString().padStart(4, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const d = value.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private normalizeEstatus(
    value: string | null,
  ): 'OK' | 'RETARDO' | 'FALTA' | 'SALIDA_TEMPRANA' | 'ERROR_MARCAJE' {
    const normalized = (value ?? '').trim().toUpperCase();
    if (normalized === 'RETARDO') return 'RETARDO';
    if (normalized === 'FALTA') return 'FALTA';
    if (normalized === 'SALIDA_TEMPRANA') return 'SALIDA_TEMPRANA';
    if (normalized === 'ERROR_MARCAJE') return 'ERROR_MARCAJE';
    return 'OK';
  }

  private readValue(row: Record<string, unknown>, key: string) {
    return row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
  }

  private readString(row: Record<string, unknown>, key: string) {
    const direct = this.readValue(row, key);
    if (direct == null) return null;
    const value = String(direct).trim();
    return value.length ? value : null;
  }

  private readInt(row: Record<string, unknown>, key: string) {
    const value = this.readValue(row, key);
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  private readBool(row: Record<string, unknown>, key: string) {
    const value = this.readValue(row, key);
    if (value == null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'si' || text === 'sí';
  }

  private extractError(error: unknown) {
    if (!error) return 'Error desconocido';
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      const obj = error as Record<string, unknown>;
      if (typeof obj.message === 'string' && obj.message.trim().length) {
        return obj.message;
      }
    }
    return String(error);
  }
}
