import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AsistenciaReporteRow } from './asistencia.service';

type JornadaTipo = 'DIURNA' | 'NOCTURNA' | 'MIXTA';

type EnrichedAsistenciaRow = AsistenciaReporteRow & {
  jornada_tipo: JornadaTipo;
  jornada_horas_objetivo: number;
  cumple_jornada_lft: boolean;
  horas_extra_dobles: number;
  horas_extra_triples: number;
  aplica_prima_dominical: boolean;
  aplica_septimo_dia_descanso: boolean;
};

@Injectable()
export class LaborLawService {
  constructor(private readonly dataSource: DataSource) {}

  async enrichReporteRows(
    rows: AsistenciaReporteRow[],
  ): Promise<EnrichedAsistenciaRow[]> {
    if (!rows.length) return [];

    const colaboradorIds = [
      ...new Set(
        rows
          .map((row) => Number(row.colaborador_id))
          .filter((value) => Number.isFinite(value) && value > 0),
      ),
    ];

    const jornadaMap = await this.loadJornadaByColaborador(colaboradorIds);
    const weeklyExtraAccumulator = new Map<string, number>();
    const weeklyAssistanceAccumulator = new Map<string, number>();

    const sortedRows = [...rows].sort((a, b) => {
      const byColab = Number(a.colaborador_id) - Number(b.colaborador_id);
      if (byColab !== 0) return byColab;
      return String(a.fecha).localeCompare(String(b.fecha));
    });

    const precomputed = new Map<string, EnrichedAsistenciaRow>();

    for (const row of sortedRows) {
      const colaboradorId = Number(row.colaborador_id);
      const fechaIso = String(row.fecha).substring(0, 10);
      const weekStart = this.mondayOf(fechaIso);
      const weekKey = `${colaboradorId}|${weekStart}`;

      const jornada = jornadaMap.get(colaboradorId) ?? 'DIURNA';
      const jornadaHoursObjetivo = this.jornadaHours(jornada);
      const minutosObjetivo = Math.round(jornadaHoursObjetivo * 60);
      const minutosTrabajados = Number(row.minutos_trabajados ?? 0) || 0;
      const cumpleJornada = minutosTrabajados >= minutosObjetivo;

      const minutosExtra = Math.max(0, Number(row.minutos_extra ?? 0) || 0);
      const accumulatedBefore = weeklyExtraAccumulator.get(weekKey) ?? 0;
      const doblesRemaining = Math.max(0, 540 - accumulatedBefore);
      const doblesMin = Math.min(minutosExtra, doblesRemaining);
      const triplesMin = Math.max(0, minutosExtra - doblesMin);
      weeklyExtraAccumulator.set(weekKey, accumulatedBefore + minutosExtra);

      const weekday = this.weekday(fechaIso);
      const hasSundayMarks =
        weekday === 0 &&
        ((row.entrada ?? '').trim().length > 0 ||
          (row.salida ?? '').trim().length > 0);

      const estatus = String(row.estatus ?? '').trim().toUpperCase();
      const workedOrJustified = !['FALTA', 'ERROR_MARCAJE'].includes(estatus);
      if (workedOrJustified) {
        weeklyAssistanceAccumulator.set(
          weekKey,
          (weeklyAssistanceAccumulator.get(weekKey) ?? 0) + 1,
        );
      }

      const key = `${colaboradorId}|${fechaIso}`;
      precomputed.set(key, {
        ...row,
        jornada_tipo: jornada,
        jornada_horas_objetivo: jornadaHoursObjetivo,
        cumple_jornada_lft: cumpleJornada,
        horas_extra_dobles: this.round2(doblesMin / 60),
        horas_extra_triples: this.round2(triplesMin / 60),
        aplica_prima_dominical: hasSundayMarks,
        aplica_septimo_dia_descanso: false,
      });
    }

    for (const row of sortedRows) {
      const colaboradorId = Number(row.colaborador_id);
      const fechaIso = String(row.fecha).substring(0, 10);
      const weekStart = this.mondayOf(fechaIso);
      const weekKey = `${colaboradorId}|${weekStart}`;
      const assistanceCount = weeklyAssistanceAccumulator.get(weekKey) ?? 0;
      const seventhDay = assistanceCount >= 6;
      const key = `${colaboradorId}|${fechaIso}`;
      const current = precomputed.get(key);
      if (!current) continue;
      current.aplica_septimo_dia_descanso = seventhDay;
      precomputed.set(key, current);
    }

    return rows.map((row) => {
      const key = `${Number(row.colaborador_id)}|${String(row.fecha).substring(0, 10)}`;
      return precomputed.get(key) ?? ({
        ...row,
        jornada_tipo: 'DIURNA',
        jornada_horas_objetivo: 8,
        cumple_jornada_lft: false,
        horas_extra_dobles: 0,
        horas_extra_triples: 0,
        aplica_prima_dominical: false,
        aplica_septimo_dia_descanso: false,
      } satisfies EnrichedAsistenciaRow);
    });
  }

  async registerSeventhDayPaidRest(
    rows: Array<AsistenciaReporteRow | EnrichedAsistenciaRow>,
  ): Promise<void> {
    if (!(await this.tableExists('dbo.NOTIFICACIONES'))) return;
    if (!rows.length) return;

    const byWeek = new Map<
      string,
      {
        colaboradorId: number;
        pin: string;
        weekStart: string;
        weekEnd: string;
        qualifyingDays: number;
      }
    >();

    for (const row of rows) {
      const colaboradorId = Number(row.colaborador_id);
      if (!Number.isFinite(colaboradorId) || colaboradorId <= 0) continue;

      const fechaIso = String(row.fecha).substring(0, 10);
      const weekStart = this.mondayOf(fechaIso);
      const weekEnd = this.sundayOf(weekStart);
      const weekKey = `${colaboradorId}|${weekStart}`;

      const estatus = String(row.estatus ?? '').trim().toUpperCase();
      const workedOrJustified = !['FALTA', 'ERROR_MARCAJE'].includes(estatus);
      const pin = String(row.pin ?? '').trim();

      const bucket = byWeek.get(weekKey) ?? {
        colaboradorId,
        pin,
        weekStart,
        weekEnd,
        qualifyingDays: 0,
      };

      if (workedOrJustified) {
        bucket.qualifyingDays += 1;
      }

      byWeek.set(weekKey, bucket);
    }

    for (const week of byWeek.values()) {
      if (week.qualifyingDays < 6) continue;
      if (!week.pin.length) continue;

      await this.dataSource.query(
        `
        IF NOT EXISTS (
          SELECT 1
          FROM dbo.NOTIFICACIONES n
          WHERE UPPER(LTRIM(RTRIM(ISNULL(n.pin, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@0, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(n.tipo, '')))) = 'SEPTIMO_DIA_PAGADO'
            AND n.fecha_referencia = @1
        )
        BEGIN
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
          VALUES (
            @2,
            @0,
            'SEPTIMO_DIA_PAGADO',
            'Día de descanso pagado',
            CONCAT(
              'Se generó séptimo día pagado para semana ',
              @3,
              ' a ',
              @1,
              ' (LFT).'
            ),
            0,
            @1,
            GETDATE()
          );
        END
        `,
        [week.pin, week.weekEnd, week.colaboradorId, week.weekStart],
      );
    }
  }

  private async loadJornadaByColaborador(colaboradorIds: number[]) {
    const map = new Map<number, JornadaTipo>();
    if (!colaboradorIds.length) return map;
    if (!(await this.columnExists('dbo.COLABORADORES', 'jornada_tipo'))) {
      return map;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        c.id,
        UPPER(LTRIM(RTRIM(ISNULL(c.jornada_tipo, 'DIURNA')))) AS jornada_tipo
      FROM dbo.COLABORADORES c
      WHERE c.id IN (${colaboradorIds.join(',')});
      `,
    );

    for (const row of (rows as Record<string, unknown>[]) ?? []) {
      const id = Number(row.id ?? row.ID ?? 0);
      if (!Number.isFinite(id) || id <= 0) continue;
      const jornada = this.normalizeJornada(row.jornada_tipo ?? row.JORNADA_TIPO);
      map.set(id, jornada);
    }

    return map;
  }

  private normalizeJornada(value: unknown): JornadaTipo {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (normalized === 'NOCTURNA') return 'NOCTURNA';
    if (normalized === 'MIXTA') return 'MIXTA';
    return 'DIURNA';
  }

  private jornadaHours(jornada: JornadaTipo): number {
    if (jornada === 'NOCTURNA') return 7;
    if (jornada === 'MIXTA') return 7.5;
    return 8;
  }

  private mondayOf(dateIso: string): string {
    const date = this.parseDate(dateIso);
    const weekday = date.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    date.setDate(date.getDate() + mondayOffset);
    return this.toDateIso(date);
  }

  private sundayOf(mondayIso: string): string {
    const date = this.parseDate(mondayIso);
    date.setDate(date.getDate() + 6);
    return this.toDateIso(date);
  }

  private weekday(dateIso: string): number {
    return this.parseDate(dateIso).getDay();
  }

  private parseDate(value: string): Date {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return new Date();
    return date;
  }

  private toDateIso(value: Date): string {
    const y = value.getFullYear().toString().padStart(4, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const d = value.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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

  private async columnExists(qualifiedName: string, columnName: string) {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN COL_LENGTH(@0, @1) IS NULL THEN 0 ELSE 1 END AS exists_flag;
      `,
      [qualifiedName, columnName],
    );
    return Number(rows?.[0]?.exists_flag ?? rows?.[0]?.EXISTS_FLAG ?? 0) === 1;
  }
}
