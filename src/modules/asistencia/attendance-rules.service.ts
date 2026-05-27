import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type ResolvedAttendanceRule = {
  source: 'ATT_RULES' | 'HORARIOS_DEFAULT' | 'GLOBAL_DEFAULT';
  id: number | null;
  nombre: string;
  sucursalId: number | null;
  horarioId: number | null;
  toleranciaRetardoMinutos: number;
  horasJornadaMinutos: number;
  horasExtraMinimoMinutos: number;
  horasExtraRequiereAutorizacion: boolean;
  aplicarDiasFestivos: boolean;
  aplicarDescanso: boolean;
};

@Injectable()
export class AttendanceRulesService {
  constructor(private readonly dataSource: DataSource) {}

  async resolveFor(input: {
    sucursalId: number | null;
    horarioId: number | null;
  }): Promise<ResolvedAttendanceRule> {
    const fromRules = await this.resolveFromRulesTable(input);
    if (fromRules) return fromRules;

    const fromHorario = await this.resolveFromHorarioDefaults(input.horarioId);
    if (fromHorario) return fromHorario;

    return {
      source: 'GLOBAL_DEFAULT',
      id: null,
      nombre: 'Regla Global Default',
      sucursalId: input.sucursalId,
      horarioId: input.horarioId,
      toleranciaRetardoMinutos: 0,
      horasJornadaMinutos: 8 * 60,
      horasExtraMinimoMinutos: 0,
      horasExtraRequiereAutorizacion: false,
      aplicarDiasFestivos: true,
      aplicarDescanso: true,
    };
  }

  private async resolveFromRulesTable(input: {
    sucursalId: number | null;
    horarioId: number | null;
  }): Promise<ResolvedAttendanceRule | null> {
    const hasTable = await this.tableExists('dbo.ATT_RULES');
    if (!hasTable) return null;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        r.id,
        r.nombre,
        r.sucursal_id,
        r.horario_id,
        ISNULL(r.tolerancia_retardo_minutos, 0) AS tolerancia_retardo_minutos,
        ISNULL(r.horas_jornada_minutos, 480) AS horas_jornada_minutos,
        ISNULL(r.horas_extra_minimo_minutos, 0) AS horas_extra_minimo_minutos,
        ISNULL(r.horas_extra_requiere_autorizacion, 0) AS horas_extra_requiere_autorizacion,
        ISNULL(r.aplicar_dias_festivos, 1) AS aplicar_dias_festivos,
        ISNULL(r.aplicar_descanso, 1) AS aplicar_descanso
      FROM dbo.ATT_RULES r
      WHERE ISNULL(r.activo, 1) = 1
        AND (r.sucursal_id IS NULL OR r.sucursal_id = @0)
        AND (r.horario_id IS NULL OR r.horario_id = @1)
      ORDER BY
        CASE WHEN r.sucursal_id = @0 THEN 1 ELSE 0 END
        + CASE WHEN r.horario_id = @1 THEN 1 ELSE 0 END DESC,
        r.id DESC;
      `,
      [input.sucursalId, input.horarioId],
    );

    const row = rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      source: 'ATT_RULES',
      id: this.toInt(this.readValue(row, 'id')),
      nombre:
        this.readString(this.readValue(row, 'nombre')) ?? 'Regla ATT_RULES',
      sucursalId: this.toInt(this.readValue(row, 'sucursal_id')),
      horarioId: this.toInt(this.readValue(row, 'horario_id')),
      toleranciaRetardoMinutos:
        this.toInt(this.readValue(row, 'tolerancia_retardo_minutos')) ?? 0,
      horasJornadaMinutos:
        this.toInt(this.readValue(row, 'horas_jornada_minutos')) ?? 8 * 60,
      horasExtraMinimoMinutos:
        this.toInt(this.readValue(row, 'horas_extra_minimo_minutos')) ?? 0,
      horasExtraRequiereAutorizacion: this.toBool(
        this.readValue(row, 'horas_extra_requiere_autorizacion'),
      ),
      aplicarDiasFestivos: this.toBool(
        this.readValue(row, 'aplicar_dias_festivos'),
      ),
      aplicarDescanso: this.toBool(this.readValue(row, 'aplicar_descanso')),
    };
  }

  private async resolveFromHorarioDefaults(
    horarioId: number | null,
  ): Promise<ResolvedAttendanceRule | null> {
    if (horarioId == null) return null;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        h.id,
        h.nombre,
        ISNULL(h.tolerancia_minutos, 0) AS tolerancia_minutos,
        ISNULL(h.ot_minimo_minutos, 0) AS ot_minimo_minutos,
        ISNULL(h.ot_requiere_autorizacion, 0) AS ot_requiere_autorizacion,
        h.hora_entrada,
        h.hora_salida,
        ISNULL(h.dia_festivo, 0) AS dia_festivo
      FROM dbo.ATT_RULES_HORARIOS h
      WHERE h.id = @0;
      `,
      [horarioId],
    );

    const row = rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const jornadaMinutos = this.estimateJornadaMinutes(
      this.readString(this.readValue(row, 'hora_entrada')),
      this.readString(this.readValue(row, 'hora_salida')),
    );

    return {
      source: 'HORARIOS_DEFAULT',
      id: this.toInt(this.readValue(row, 'id')),
      nombre:
        this.readString(this.readValue(row, 'nombre')) ??
        'Regla desde HORARIOS',
      sucursalId: null,
      horarioId,
      toleranciaRetardoMinutos:
        this.toInt(this.readValue(row, 'tolerancia_minutos')) ?? 0,
      horasJornadaMinutos: jornadaMinutos,
      horasExtraMinimoMinutos:
        this.toInt(this.readValue(row, 'ot_minimo_minutos')) ?? 0,
      horasExtraRequiereAutorizacion: this.toBool(
        this.readValue(row, 'ot_requiere_autorizacion'),
      ),
      aplicarDiasFestivos: !this.toBool(this.readValue(row, 'dia_festivo')),
      aplicarDescanso: true,
    };
  }

  private estimateJornadaMinutes(
    horaEntrada: string | null,
    horaSalida: string | null,
  ): number {
    if (!horaEntrada || !horaSalida) return 8 * 60;

    const start = this.parseTimeMinutes(horaEntrada);
    const end = this.parseTimeMinutes(horaSalida);
    if (start == null || end == null) return 8 * 60;

    let diff = end - start;
    if (diff <= 0) diff += 24 * 60;
    return diff;
  }

  private parseTimeMinutes(value: string): number | null {
    const match = value.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;

    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  }

  private async tableExists(qualifiedName: string) {
    const rows = await this.dataSource.query(
      `SELECT CASE WHEN OBJECT_ID(@0, 'U') IS NULL THEN 0 ELSE 1 END AS exists_flag;`,
      [qualifiedName],
    );
    return Number(rows?.[0]?.exists_flag ?? rows?.[0]?.EXISTS_FLAG ?? 0) === 1;
  }

  private readValue(row: Record<string, unknown>, key: string) {
    return row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
  }

  private readString(value: unknown): string | null {
    if (value == null) return null;
    const normalized = String(value).trim();
    return normalized.length ? normalized : null;
  }

  private toInt(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  private toBool(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    return (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'si' ||
      normalized === 'sí'
    );
  }
}
