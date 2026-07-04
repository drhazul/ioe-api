import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DataSource } from 'typeorm';

type SourceDefinition = {
  table: string;
  userColumn: string;
  dateColumn: string;
};

@Injectable()
export class NotificacionesService implements OnModuleInit {
  private readonly logger = new Logger(NotificacionesService.name);
  private readonly cronName = 'notificaciones-faltas-23-59';
  private readonly contractsCronName = 'notificaciones-contratos-08-00';

  constructor(
    private readonly dataSource: DataSource,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    this.ensureCronRegistered();
    this.ensureContractsCronRegistered();
  }

  async cronFaltasDelDia() {
    const today = new Date();
    const dateIso = this.toDateIso(today);

    try {
      const result = await this.generarFaltasDelDia(dateIso);
      this.logger.log(
        `Cron faltas ejecutado. fecha=${dateIso} inserted=${result.inserted}`,
      );
    } catch (error) {
      this.logger.error(`Cron faltas falló: ${this.extractError(error)}`);
    }
  }

  async runManual(dateIso?: string) {
    const effectiveDate = dateIso?.trim().length
      ? this.toDateIso(new Date(dateIso))
      : this.toDateIso(new Date());

    return this.generarFaltasDelDia(effectiveDate);
  }

  async cronContratosPorVencer() {
    const todayIso = this.toDateIso(new Date());
    try {
      const result = await this.generarContratosPorVencer(todayIso);
      this.logger.log(
        `Cron contratos ejecutado. fecha=${todayIso} inserted=${result.inserted}`,
      );
    } catch (error) {
      this.logger.error(`Cron contratos falló: ${this.extractError(error)}`);
    }
  }

  private ensureCronRegistered() {
    let job: CronJob | null = null;
    try {
      job = this.schedulerRegistry.getCronJob(this.cronName);
    } catch {
      job = null;
    }

    if (job == null) {
      const newJob = new CronJob(
        '59 23 * * *',
        () => {
          void this.cronFaltasDelDia();
        },
        null,
        false,
        'America/Mexico_City',
      );
      this.schedulerRegistry.addCronJob(this.cronName, newJob);
      newJob.start();
      this.logger.log(
        `Cron registrado: ${this.cronName} (23:59 America/Mexico_City)`,
      );
      return;
    }

    job.start();
    this.logger.log(
      `Cron ya existente y activo: ${this.cronName} (23:59 America/Mexico_City)`,
    );
  }

  private ensureContractsCronRegistered() {
    let job: CronJob | null = null;
    try {
      job = this.schedulerRegistry.getCronJob(this.contractsCronName);
    } catch {
      job = null;
    }

    if (job == null) {
      const newJob = new CronJob(
        '0 8 * * *',
        () => {
          void this.cronContratosPorVencer();
        },
        null,
        false,
        'America/Mexico_City',
      );
      this.schedulerRegistry.addCronJob(this.contractsCronName, newJob);
      newJob.start();
      this.logger.log(
        `Cron registrado: ${this.contractsCronName} (08:00 America/Mexico_City)`,
      );
      return;
    }

    job.start();
    this.logger.log(
      `Cron ya existente y activo: ${this.contractsCronName} (08:00 America/Mexico_City)`,
    );
  }

  async listByPin(pin: string) {
    const normalizedPin = this.normalizePin(pin);

    await this.ensureNotificacionesTable();

    const rows = await this.dataSource.query(
      `
      SELECT
        n.id,
        n.pin,
        n.tipo,
        n.titulo,
        n.mensaje,
        n.leida,
        n.fecha_referencia,
        n.fecha_creacion,
        n.fecha_leida
      FROM dbo.NOTIFICACIONES n
      WHERE UPPER(LTRIM(RTRIM(ISNULL(n.pin, '')))) = @0
      ORDER BY n.fecha_creacion DESC;
      `,
      [normalizedPin],
    );

    return {
      ok: true,
      pin: normalizedPin,
      total: Array.isArray(rows) ? rows.length : 0,
      rows,
    };
  }

  async markAsRead(id: number) {
    await this.ensureNotificacionesTable();

    const existing = await this.dataSource.query(
      `
      SELECT TOP 1 id
      FROM dbo.NOTIFICACIONES
      WHERE id = @0;
      `,
      [id],
    );

    if (!existing?.length) {
      throw new NotFoundException(`Notificación ${id} no existe`);
    }

    await this.dataSource.query(
      `
      UPDATE dbo.NOTIFICACIONES
      SET leida = 1,
          fecha_leida = GETDATE()
      WHERE id = @0;
      `,
      [id],
    );

    return { ok: true, id, leida: true };
  }

  private async generarFaltasDelDia(dateIso: string) {
    await this.ensureNotificacionesTable();

    const source = await this.resolveSourceDefinition();
    const query = this.buildInsertMissingAttendanceQuery(source);

    const rows = await this.dataSource.query(query, [dateIso]);

    return {
      ok: true,
      date: dateIso,
      source: source.table,
      inserted: Number(rows?.[0]?.inserted ?? rows?.[0]?.INSERTED ?? 0) || 0,
    };
  }

  private async generarContratosPorVencer(dateIso: string) {
    await this.ensureNotificacionesTable();

    const hasContratos = await this.tableExists('dbo.CONTRATOS');

    if (hasContratos) {
      const rows = await this.dataSource.query(
        `
        DECLARE @hoy DATE = @0;

        INSERT INTO dbo.NOTIFICACIONES (
          colaborador_id,
          pin,
          tipo,
          titulo,
          mensaje,
          leida,
          fecha_referencia,
          fecha_creacion
        )
        SELECT
          c.id,
          c.pin,
          'CONTRATO_POR_VENCER',
          'Contrato por vencer',
          CONCAT(
            'Contrato vence el ',
            CONVERT(VARCHAR(10), ct.fecha_vencimiento, 23),
            '. Restan ',
            DATEDIFF(DAY, @hoy, ct.fecha_vencimiento),
            ' día(s).'
          ),
          0,
          ct.fecha_vencimiento,
          GETDATE()
        FROM dbo.CONTRATOS ct
        INNER JOIN dbo.COLABORADORES c
          ON c.id = ct.colaborador_id
        WHERE DATEDIFF(DAY, @hoy, ct.fecha_vencimiento) BETWEEN 0 AND 5
          AND UPPER(LTRIM(RTRIM(ISNULL(ct.estatus, 'ACTIVO')))) = 'ACTIVO'
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.NOTIFICACIONES n
            WHERE UPPER(LTRIM(RTRIM(ISNULL(n.pin, '')))) = UPPER(LTRIM(RTRIM(ISNULL(c.pin, ''))))
              AND UPPER(LTRIM(RTRIM(ISNULL(n.tipo, '')))) = 'CONTRATO_POR_VENCER'
              AND n.fecha_referencia = ct.fecha_vencimiento
          );

        SELECT @@ROWCOUNT AS inserted;
        `,
        [dateIso],
      );

      return {
        ok: true,
        mode: 'CONTRATOS',
        date: dateIso,
        inserted: Number(rows?.[0]?.inserted ?? rows?.[0]?.INSERTED ?? 0) || 0,
      };
    }

    const rows = await this.dataSource.query(
      `
      DECLARE @hoy DATE = @0;
      DECLARE @has_estatus_contrato BIT =
        CASE WHEN COL_LENGTH('dbo.COLABORADORES', 'estatus_contrato') IS NULL THEN 0 ELSE 1 END;

      INSERT INTO dbo.NOTIFICACIONES (
        colaborador_id,
        pin,
        tipo,
        titulo,
        mensaje,
        leida,
        fecha_referencia,
        fecha_creacion
      )
      SELECT
        c.id,
        c.pin,
        'CONTRATO_POR_VENCER',
        'Contrato por vencer',
        CONCAT(
          'Contrato de prueba vence el ',
          CONVERT(VARCHAR(10), c.vencimiento_contrato, 23),
          '. Restan ',
          DATEDIFF(DAY, @hoy, c.vencimiento_contrato),
          ' día(s).'
        ),
        0,
        c.vencimiento_contrato,
        GETDATE()
      FROM dbo.COLABORADORES c
      WHERE c.vencimiento_contrato IS NOT NULL
        AND DATEDIFF(DAY, @hoy, c.vencimiento_contrato) BETWEEN 0 AND 5
        AND (
          @has_estatus_contrato = 0
          OR UPPER(LTRIM(RTRIM(ISNULL(c.estatus_contrato, 'PLANTA')))) IN ('PRUEBA_30', 'PRUEBA_90')
        )
        AND ISNULL(c.estado, 1) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.NOTIFICACIONES n
          WHERE UPPER(LTRIM(RTRIM(ISNULL(n.pin, '')))) = UPPER(LTRIM(RTRIM(ISNULL(c.pin, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(n.tipo, '')))) = 'CONTRATO_POR_VENCER'
            AND n.fecha_referencia = c.vencimiento_contrato
        );

      SELECT @@ROWCOUNT AS inserted;
      `,
      [dateIso],
    );

    return {
      ok: true,
      mode: 'COLABORADORES',
      date: dateIso,
      inserted: Number(rows?.[0]?.inserted ?? rows?.[0]?.INSERTED ?? 0) || 0,
    };
  }

  private buildInsertMissingAttendanceQuery(source: SourceDefinition) {
    const table = this.safeIdentifier(source.table);
    const userColumn = this.safeIdentifier(source.userColumn);
    const dateColumn = this.safeIdentifier(source.dateColumn);

    return `
      DECLARE @fecha DATE = @0;

      ;WITH marcas_dia AS (
        SELECT DISTINCT
          c.id AS colaborador_id,
          c.pin
        FROM dbo.[${table}] src
        INNER JOIN dbo.COLABORADORES c
          ON (
            TRY_CONVERT(INT, c.pin) = TRY_CONVERT(INT, src.[${userColumn}])
            OR c.pin = CONVERT(VARCHAR(30), src.[${userColumn}])
            OR c.id = TRY_CONVERT(INT, src.[${userColumn}])
          )
        WHERE CAST(src.[${dateColumn}] AS DATE) = @fecha
      )
      INSERT INTO dbo.NOTIFICACIONES (
        colaborador_id,
        pin,
        tipo,
        titulo,
        mensaje,
        leida,
        fecha_referencia,
        fecha_creacion
      )
      SELECT
        c.id,
        c.pin,
        'FALTA_ASISTENCIA',
        'Falta de asistencia',
        CONCAT('No se detectó marcaje el día ', CONVERT(VARCHAR(10), @fecha, 23)),
        0,
        @fecha,
        GETDATE()
      FROM dbo.COLABORADORES c
      LEFT JOIN marcas_dia m
        ON m.colaborador_id = c.id
      WHERE c.estado = 1
        AND m.colaborador_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.NOTIFICACIONES n
          WHERE UPPER(LTRIM(RTRIM(ISNULL(n.pin, '')))) = UPPER(LTRIM(RTRIM(ISNULL(c.pin, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(n.tipo, '')))) = 'FALTA_ASISTENCIA'
            AND n.fecha_referencia = @fecha
        );

      SELECT @@ROWCOUNT AS inserted;
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

    for (const candidate of ['ATT_ASISTENCIA', 'ATT_TIME_LOG']) {
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

      if (userColumn && dateColumn) {
        return { table: candidate, userColumn, dateColumn };
      }
    }

    throw new BadRequestException(
      'No existe tabla fuente de asistencia para generar notificaciones.',
    );
  }

  private async ensureNotificacionesTable() {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN OBJECT_ID('dbo.NOTIFICACIONES', 'U') IS NULL THEN 0 ELSE 1 END AS exists_flag;
      `,
    );

    const exists = Number(
      rows?.[0]?.exists_flag ?? rows?.[0]?.EXISTS_FLAG ?? 0,
    );
    if (exists !== 1) {
      throw new BadRequestException(
        'No existe dbo.NOTIFICACIONES. Ejecuta script 123_NOTIFICACIONES_create.sql',
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

  private pickColumn(
    columns: Map<string, string>,
    candidates: string[],
  ): string | null {
    for (const candidate of candidates) {
      if (columns.has(candidate)) return columns.get(candidate) ?? null;
    }
    return null;
  }

  private safeIdentifier(value: string) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      throw new BadRequestException(`Identificador SQL inválido: ${value}`);
    }
    return value;
  }

  private normalizePin(value: string) {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');

    if (!normalized.length) {
      throw new BadRequestException('PIN inválido');
    }

    return normalized;
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

  private readString(row: Record<string, unknown>, key: string) {
    const direct = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    if (direct == null) return null;
    const value = String(direct).trim();
    return value.length ? value : null;
  }

  private extractError(error: unknown) {
    if (!error) return 'Error desconocido';
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      const anyError = error as Record<string, unknown>;
      if (typeof anyError.message === 'string') return anyError.message;
    }
    return String(error);
  }
}
