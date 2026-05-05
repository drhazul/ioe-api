import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AttendanceRulesService,
  ResolvedAttendanceRule,
} from './attendance-rules.service';
import { ProcessCheckinDto } from './dto/process-checkin.dto';
import { IncidenciasVacacionesService } from '../incidencias-vacaciones/incidencias-vacaciones.service';

type CheckinStatus = 'OK' | 'RETARDO' | 'DESCANSO' | 'NO_CONFIGURADO' | string;

export type CheckinEvaluationResult = {
  ok: true;
  colaboradorId: number;
  pin: string;
  sucursalId: number | null;
  horarioId: number | null;
  tipo: string;
  checkinAt: string;
  workdayId: string;
  estatus: CheckinStatus;
  retardoMinutos: number;
  horasExtraAcumulablesMinutos: number;
  isHoliday: boolean;
  isRestDay: boolean;
  regla: ResolvedAttendanceRule;
  expectedStart: string | null;
  expectedEnd: string | null;
};

@Injectable()
export class CheckinsProcessorService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rulesService: AttendanceRulesService,
    private readonly incidenciasVacacionesService: IncidenciasVacacionesService,
  ) {}

  async processCheckIn(dto: ProcessCheckinDto): Promise<CheckinEvaluationResult> {
    const checkinAt = new Date(dto.checkin_at);
    if (Number.isNaN(checkinAt.getTime())) {
      throw new BadRequestException('checkin_at inválido');
    }

    const tipo = this.normalizeTipo(dto.tipo);
    const colaborador = await this.resolveColaborador(dto.colaborador_id);
    const workdayId = this.resolveWorkdayId(checkinAt);
    const permisoCode =
      await this.incidenciasVacacionesService.getApprovedPermissionCodeForDate(
        colaborador.id,
        workdayId,
      );

    const regla = await this.rulesService.resolveFor({
      sucursalId: colaborador.sucursalId,
      horarioId: colaborador.horarioId,
    });

    const isHoliday = await this.resolveIsHoliday(workdayId);
    const isRestDay = this.resolveIsRestDay(checkinAt);

    if ((isHoliday && !regla.aplicarDiasFestivos) || (isRestDay && !regla.aplicarDescanso)) {
      return {
        ok: true,
        colaboradorId: colaborador.id,
        pin: colaborador.pin,
        sucursalId: colaborador.sucursalId,
        horarioId: colaborador.horarioId,
        tipo,
        checkinAt: checkinAt.toISOString(),
        workdayId,
        estatus: 'DESCANSO',
        retardoMinutos: 0,
        horasExtraAcumulablesMinutos: 0,
        isHoliday,
        isRestDay,
        regla,
        expectedStart: null,
        expectedEnd: null,
      };
    }

    if ((permisoCode ?? '').trim().length) {
      return {
        ok: true,
        colaboradorId: colaborador.id,
        pin: colaborador.pin,
        sucursalId: colaborador.sucursalId,
        horarioId: colaborador.horarioId,
        tipo,
        checkinAt: checkinAt.toISOString(),
        workdayId,
        estatus: String(permisoCode).trim().toUpperCase(),
        retardoMinutos: 0,
        horasExtraAcumulablesMinutos: 0,
        isHoliday,
        isRestDay,
        regla,
        expectedStart: null,
        expectedEnd: null,
      };
    }

    let expectedStart = this.combineDateTime(workdayId, colaborador.horaEntrada);
    let expectedEnd = this.combineDateTimeWithCrossDay(
      workdayId,
      colaborador.horaEntrada,
      colaborador.horaSalida,
    );

    // Fallback defensivo para evitar NO_CONFIGURADO por tiempos nulos/ilegibles.
    if (expectedStart == null) {
      expectedStart = this.combineDateTime(workdayId, '08:00:00');
    }
    if (expectedEnd == null && expectedStart != null) {
      expectedEnd = new Date(
        expectedStart.getTime() + regla.horasJornadaMinutos * 60000,
      );
    }

    let estatus: CheckinStatus = 'NO_CONFIGURADO';
    let retardoMinutos = 0;
    let horasExtraAcumulablesMinutos = 0;

    if (expectedStart != null) {
      const limitStart = new Date(
        expectedStart.getTime() + regla.toleranciaRetardoMinutos * 60000,
      );
      if (checkinAt.getTime() >= limitStart.getTime()) {
        retardoMinutos = Math.max(
          0,
          Math.floor((checkinAt.getTime() - expectedStart.getTime()) / 60000),
        );
      } else {
        retardoMinutos = 0;
      }
      estatus = retardoMinutos > 0 ? 'RETARDO' : 'OK';
    } else {
      throw new BadRequestException(
        `Horario no configurable para colaborador ${colaborador.id}`,
      );
    }

    if (tipo === 'SALIDA' && expectedEnd != null) {
      const overtimeThreshold = new Date(
        expectedEnd.getTime() + regla.horasExtraMinimoMinutos * 60000,
      );
      if (
        checkinAt.getTime() > overtimeThreshold.getTime() &&
        !regla.horasExtraRequiereAutorizacion
      ) {
        horasExtraAcumulablesMinutos = Math.max(
          0,
          Math.floor((checkinAt.getTime() - expectedEnd.getTime()) / 60000),
        );
      }
    }

    return {
      ok: true,
      colaboradorId: colaborador.id,
      pin: colaborador.pin,
      sucursalId: colaborador.sucursalId,
      horarioId: colaborador.horarioId,
      tipo,
      checkinAt: checkinAt.toISOString(),
      workdayId,
      estatus,
      retardoMinutos,
      horasExtraAcumulablesMinutos,
      isHoliday,
      isRestDay,
      regla,
      expectedStart: expectedStart?.toISOString() ?? null,
      expectedEnd: expectedEnd?.toISOString() ?? null,
    };
  }

  private async resolveColaborador(colaboradorId: number) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        c.id,
        c.pin,
        c.sucursal_id,
        c.horario_id,
        h.hora_entrada,
        h.hora_salida
      FROM dbo.COLABORADORES c
      LEFT JOIN dbo.ATT_RULES_HORARIOS h
        ON h.id = c.horario_id
      WHERE c.id = @0
        AND ISNULL(c.estado, 0) = 1;
      `,
      [colaboradorId],
    );

    const row = rows?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new BadRequestException(
        `Colaborador ${colaboradorId} no existe o está inactivo`,
      );
    }

    return {
      id: this.toInt(this.readValue(row, 'id')) ?? colaboradorId,
      pin: this.readString(this.readValue(row, 'pin')) ?? '',
      sucursalId: this.toInt(this.readValue(row, 'sucursal_id')),
      horarioId: this.toInt(this.readValue(row, 'horario_id')),
      horaEntrada: this.readString(this.readValue(row, 'hora_entrada')),
      horaSalida: this.readString(this.readValue(row, 'hora_salida')),
    };
  }

  private async resolveIsHoliday(workdayId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `
      DECLARE @isHoliday BIT = 0;

      IF OBJECT_ID('dbo.DIAS_FESTIVOS', 'U') IS NOT NULL
         AND COL_LENGTH('dbo.DIAS_FESTIVOS', 'fecha') IS NOT NULL
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM dbo.DIAS_FESTIVOS f
          WHERE CAST(f.fecha AS DATE) = @0
        )
          SET @isHoliday = 1;
      END
      ELSE IF OBJECT_ID('dbo.FESTIVOS', 'U') IS NOT NULL
         AND COL_LENGTH('dbo.FESTIVOS', 'fecha') IS NOT NULL
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM dbo.FESTIVOS f
          WHERE CAST(f.fecha AS DATE) = @0
        )
          SET @isHoliday = 1;
      END

      SELECT @isHoliday AS is_holiday;
      `,
      [workdayId],
    );

    const value = rows?.[0]?.is_holiday ?? rows?.[0]?.IS_HOLIDAY ?? 0;
    return this.toBool(value);
  }

  private resolveIsRestDay(date: Date): boolean {
    const weekday = date.getDay();
    return weekday === 0 || weekday === 6;
  }

  private resolveWorkdayId(checkinAt: Date): string {
    const adjusted = new Date(checkinAt);
    if (adjusted.getHours() < 4) {
      adjusted.setDate(adjusted.getDate() - 1);
    }
    return this.toDateIso(adjusted);
  }

  private combineDateTime(dateIso: string, timeValue: string | null): Date | null {
    if (!timeValue) return null;

    const normalizedRaw = timeValue.trim();
    const match = normalizedRaw.match(/(\d{2}:\d{2}(?::\d{2})?)/);
    if (!match) return null;
    const normalized = match[1];

    const full = normalized.length === 5 ? `${normalized}:00` : normalized;
    const parsed = new Date(`${dateIso}T${full}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private combineDateTimeWithCrossDay(
    dateIso: string,
    entrada: string | null,
    salida: string | null,
  ): Date | null {
    const start = this.combineDateTime(dateIso, entrada);
    const end = this.combineDateTime(dateIso, salida);
    if (!end) return null;
    if (!start) return end;

    if (end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
    return end;
  }

  private normalizeTipo(tipoRaw?: string): string {
    const normalized = String(tipoRaw ?? 'ENTRADA').trim().toUpperCase();
    if (
      ['ENTRADA', 'SALIDA', 'SALIDA_COMER', 'REGRESO_COMER'].includes(
        normalized,
      )
    ) {
      return normalized;
    }
    throw new BadRequestException(`tipo inválido: ${tipoRaw ?? ''}`);
  }

  private toDateIso(value: Date): string {
    const y = value.getFullYear().toString().padStart(4, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const d = value.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
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
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'si' || normalized === 'sí';
  }
}
