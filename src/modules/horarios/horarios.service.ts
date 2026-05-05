import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { HorarioEntity } from './horario.entity';
import { CreateHorarioDto } from './dto/create-horario.dto';
import { CreateTurnoCatalogoDto } from './dto/create-turno-catalogo.dto';
import { SetHorarioConfirmacionDto } from './dto/set-horario-confirmacion.dto';
import { UpdateHorarioDto } from './dto/update-horario.dto';

type TurnoCatalogoRow = {
  id: number;
  nombre: string;
  hr_entrada: string;
  hr_salida_comida: string;
  hr_regreso_comida: string;
  hr_salida: string;
};

type ColaboradorHorarioRow = {
  colaborador_id: number;
  id_empleado: string;
  nombre_completo: string;
  sucursal: string;
  departamento: string;
  cargo: string;
  turno_predeterminado: string;
  hora_entrada: string;
  hora_salida: string;
  minutos_almuerzo: number;
};

@Injectable()
export class HorariosService {
  private readonly logger = new Logger(HorariosService.name);
  private static readonly WEEKLY_LIMITS: Record<'DIURNA' | 'NOCTURNA' | 'MIXTA', number> = {
    DIURNA: 48,
    NOCTURNA: 42,
    MIXTA: 45,
  };

  constructor(
    @InjectRepository(HorarioEntity)
    private readonly repo: Repository<HorarioEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 0 2 * * 4', { timeZone: 'America/Mexico_City' })
  async generateNextWeekSchedulesCron() {
    try {
      const summary = await this.generateNextWeekSchedules();
      this.logger.log(
        `Cron semanal horarios ejecutado: ${JSON.stringify(summary)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Cron semanal horarios falló: ${message}`);
    }
  }

  async findAll() {
    const rows = await this.repo.find({ order: { id: 'ASC' } });
    return rows.map((row) => this.mapRow(row));
  }

  async create(dto: CreateHorarioDto) {
    const horaEntrada = this.normalizeTime(dto.hora_entrada);
    const entity = this.repo.create({
      nombre: dto.nombre.trim(),
      horaEntrada,
      horaSalida: this.normalizeTime(dto.hora_salida),
      toleranciaMinutos: dto.tolerancia_minutos ?? 0,
      diaFestivo: dto.dia_festivo ?? false,
      inicioEntrada: this.normalizeTime(dto.inicio_entrada ?? horaEntrada),
      finEntrada: this.normalizeTime(dto.fin_entrada ?? horaEntrada),
      minutosAlmuerzo: dto.minutos_almuerzo ?? 0,
      redondeoEntrada: dto.redondeo_entrada ?? 0,
      esFlexible: dto.es_flexible ?? false,
      otMinimoMinutos: dto.ot_minimo_minutos ?? 0,
      otRequiereAutorizacion: dto.ot_requiere_autorizacion ?? false,
      horasJornadaMinutos: dto.horas_jornada_minutos ?? 480,
      horasExtraMinimoMinutos: dto.horas_extra_minimo_minutos ?? 0,
      horasExtraRequiereAutorizacion: dto.horas_extra_requiere_autorizacion ?? false,
      activo: dto.activo ?? true,
    });

    this.assertLftForHorario(entity);
    const saved = await this.repo.save(entity);
    return this.mapRow(saved);
  }

  async update(id: number, dto: UpdateHorarioDto) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Horario ${id} no existe`);
    }

    if (dto.nombre !== undefined) {
      row.nombre = dto.nombre.trim();
    }
    if (dto.hora_entrada !== undefined) {
      row.horaEntrada = this.normalizeTime(dto.hora_entrada);
    }
    if (dto.hora_salida !== undefined) {
      row.horaSalida = this.normalizeTime(dto.hora_salida);
    }
    if (dto.tolerancia_minutos !== undefined) {
      row.toleranciaMinutos = dto.tolerancia_minutos;
    }
    if (dto.dia_festivo !== undefined) {
      row.diaFestivo = dto.dia_festivo;
    }
    if (dto.inicio_entrada !== undefined) {
      row.inicioEntrada = this.normalizeTime(dto.inicio_entrada);
    }
    if (dto.fin_entrada !== undefined) {
      row.finEntrada = this.normalizeTime(dto.fin_entrada);
    }
    if (dto.minutos_almuerzo !== undefined) {
      row.minutosAlmuerzo = dto.minutos_almuerzo;
    }
    if (dto.redondeo_entrada !== undefined) {
      row.redondeoEntrada = dto.redondeo_entrada;
    }
    if (dto.es_flexible !== undefined) {
      row.esFlexible = dto.es_flexible;
    }
    if (dto.ot_minimo_minutos !== undefined) {
      row.otMinimoMinutos = dto.ot_minimo_minutos;
    }
    if (dto.ot_requiere_autorizacion !== undefined) {
      row.otRequiereAutorizacion = dto.ot_requiere_autorizacion;
    }
    if (dto.horas_jornada_minutos !== undefined) {
      row.horasJornadaMinutos = dto.horas_jornada_minutos;
    }
    if (dto.horas_extra_minimo_minutos !== undefined) {
      row.horasExtraMinimoMinutos = dto.horas_extra_minimo_minutos;
    }
    if (dto.horas_extra_requiere_autorizacion !== undefined) {
      row.horasExtraRequiereAutorizacion = dto.horas_extra_requiere_autorizacion;
    }
    if (dto.activo !== undefined) {
      row.activo = dto.activo;
    }

    this.assertLftForHorario(row);
    const saved = await this.repo.save(row);
    return this.mapRow(saved);
  }

  async remove(id: number) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Horario ${id} no existe`);
    }

    await this.repo.remove(row);
    return { deleted: true, id };
  }

  async findTurnosCatalogo() {
    const rows = await this.dataSource.query(
      `
      SELECT
        h.id,
        h.nombre,
        CONVERT(VARCHAR(8), ISNULL(h.hora_entrada, '09:00:00'), 108) AS hr_entrada,
        CONVERT(
          VARCHAR(8),
          DATEADD(
            MINUTE,
            240,
            CAST(CONVERT(VARCHAR(8), ISNULL(h.hora_entrada, '09:00:00'), 108) AS DATETIME)
          ),
          108
        ) AS hr_salida_comida,
        CONVERT(
          VARCHAR(8),
          DATEADD(
            MINUTE,
            300,
            CAST(CONVERT(VARCHAR(8), ISNULL(h.hora_entrada, '09:00:00'), 108) AS DATETIME)
          ),
          108
        ) AS hr_regreso_comida,
        CONVERT(VARCHAR(8), ISNULL(h.hora_salida, '18:00:00'), 108) AS hr_salida
      FROM dbo.ATT_RULES_HORARIOS h
      ORDER BY h.nombre ASC;
      `,
    );
    return ((rows as Record<string, unknown>[]) ?? []).map((row) =>
      this.mapTurnoCatalogoRow(row),
    );
  }

  async createTurnoCatalogo(dto: CreateTurnoCatalogoDto) {
    const turno = this.normalizeTurnoDto(dto);
    this.assertLftForTurno(turno);

    await this.upsertHorarioFromTurno(turno);
    const horarioRows = await this.dataSource.query(
      `
      SELECT TOP 1 id
      FROM dbo.ATT_RULES_HORARIOS
      WHERE UPPER(LTRIM(RTRIM(ISNULL(nombre, '')))) = @0
      ORDER BY id DESC;
      `,
      [turno.nombre.trim().toUpperCase()],
    );
    const insertedId = Number(horarioRows?.[0]?.id ?? horarioRows?.[0]?.ID ?? 0);

    return {
      id: insertedId,
      ...turno,
      jornada_tipo: this.inferJornadaByName(turno.nombre),
    };
  }

  async getWeeklySchedule(input: {
    weekStart?: string;
    sucursal?: string;
    departamento?: string;
  }) {
    try {
      const monday = this.resolveWeekMonday(input.weekStart);
      const days = Array.from({ length: 7 }, (_, idx) =>
        this.toIsoDateOnly(this.addDays(monday, idx)),
      );

      const colaboradores = await this.loadActiveColaboradores(
        input.sucursal,
        input.departamento,
      );
      const turnosByName = await this.loadTurnosCatalogByName();
      const rows: Array<Record<string, unknown>> = [];

      for (const colab of colaboradores) {
        const expanded = this.expandEventsByWeek(colab, turnosByName, days);
        rows.push(...expanded);
      }

      const confirmaciones = await this.getConfirmacionesByWeek(
        this.toIsoDateOnly(monday),
      );

      return {
        week_start: this.toIsoDateOnly(monday),
        week_end: this.toIsoDateOnly(this.addDays(monday, 6)),
        days,
        rows,
        confirmaciones,
      };
    } catch (error) {
      console.error('ERROR getWeeklySchedule horarios:', error);
      throw error;
    }
  }

  async setConfirmacion(dto: SetHorarioConfirmacionDto) {
    const semana = this.resolveWeekMonday(dto.semana);
    const semanaIso = this.toIsoDateOnly(semana);
    const sucursal = this.normalizeUpper(dto.sucursal, 40);
    const departamento = this.normalizeUpper(dto.departamento, 80);
    const estatus = this.normalizeUpper(dto.estatus, 20);

    return {
      ok: true,
      sucursal,
      departamento,
      semana: semanaIso,
      estatus,
      persisted: false,
    };
  }

  async generateNextWeekSchedules() {
    const nextMonday = this.addDays(this.resolveWeekMonday(), 7);
    const semanaIso = this.toIsoDateOnly(nextMonday);
    const colaboradores = await this.loadActiveColaboradores();
    const turnosByName = await this.loadTurnosCatalogByName();
    const warnings: string[] = [];
    const buckets = new Map<string, { sucursal: string; departamento: string }>();

    for (const colab of colaboradores) {
      const jornada = this.resolveJornadaTipo(colab.turno_predeterminado);
      const minutes = this.resolveDailyMinutes(colab, turnosByName);
      const weeklyHours = (minutes * 6) / 60;
      const maxHours = HorariosService.WEEKLY_LIMITS[jornada];
      if (weeklyHours > maxHours) {
        warnings.push(
          `Colaborador ${colab.id_empleado} excede límite LFT (${weeklyHours.toFixed(2)}h > ${maxHours}h)`,
        );
      }

      const key = `${colab.sucursal}|${colab.departamento}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          sucursal: colab.sucursal,
          departamento: colab.departamento,
        });
      }
    }

    const generated = buckets.size;

    return {
      ok: true,
      semana: semanaIso,
      generated,
      warnings,
      persisted: false,
    };
  }

  private normalizeTime(value: string) {
    const text = String(value ?? '').trim();
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
      return `${text}:00`;
    }
    return text;
  }

  private mapRow(row: HorarioEntity) {
    return {
      id: row.id,
      nombre: row.nombre,
      hora_entrada: row.horaEntrada,
      hora_salida: row.horaSalida,
      tolerancia_minutos: row.toleranciaMinutos,
      dia_festivo: row.diaFestivo,
      inicio_entrada: row.inicioEntrada,
      fin_entrada: row.finEntrada,
      minutos_almuerzo: row.minutosAlmuerzo,
      redondeo_entrada: row.redondeoEntrada,
      es_flexible: row.esFlexible,
      ot_minimo_minutos: row.otMinimoMinutos,
      ot_requiere_autorizacion: row.otRequiereAutorizacion,
      horas_jornada_minutos: row.horasJornadaMinutos,
      horas_extra_minimo_minutos: row.horasExtraMinimoMinutos,
      horas_extra_requiere_autorizacion: row.horasExtraRequiereAutorizacion,
      activo: row.activo,
      creado_en: row.creadoEn,
      actualizado_en: row.actualizadoEn,
    };
  }

  private mapTurnoCatalogoRow(row: Record<string, unknown>): TurnoCatalogoRow {
    return {
      id: Number(row.id ?? row.ID ?? 0),
      nombre: String(row.nombre ?? row.NOMBRE ?? '').trim(),
      hr_entrada: this.normalizeTime(String(row.hr_entrada ?? row.HR_ENTRADA ?? '00:00:00')),
      hr_salida_comida: this.normalizeTime(
        String(row.hr_salida_comida ?? row.HR_SALIDA_COMIDA ?? '00:00:00'),
      ),
      hr_regreso_comida: this.normalizeTime(
        String(row.hr_regreso_comida ?? row.HR_REGRESO_COMIDA ?? '00:00:00'),
      ),
      hr_salida: this.normalizeTime(String(row.hr_salida ?? row.HR_SALIDA ?? '00:00:00')),
    };
  }

  private normalizeTurnoDto(dto: CreateTurnoCatalogoDto) {
    return {
      nombre: this.normalizeText(dto.nombre, 120),
      hr_entrada: this.normalizeTime(dto.hr_entrada),
      hr_salida_comida: this.normalizeTime(dto.hr_salida_comida),
      hr_regreso_comida: this.normalizeTime(dto.hr_regreso_comida),
      hr_salida: this.normalizeTime(dto.hr_salida),
    };
  }

  private assertLftForHorario(row: HorarioEntity) {
    const jornada = this.resolveJornadaTipo(row.nombre ?? '');
    const entrada = this.normalizeTime(row.horaEntrada ?? '00:00:00');
    const salida = this.normalizeTime(row.horaSalida ?? '00:00:00');
    const lunch = Math.max(0, Number(row.minutosAlmuerzo ?? 0));
    const dailyMinutes = this.diffMinutes(entrada, salida) - lunch;
    const weeklyHours = (Math.max(0, dailyMinutes) * 6) / 60;
    const max = HorariosService.WEEKLY_LIMITS[jornada];
    if (weeklyHours > max) {
      throw new BadRequestException(
        `Turno excede jornada legal LFT para ${jornada}: ${weeklyHours.toFixed(2)}h/semana > ${max}h`,
      );
    }
  }

  private assertLftForTurno(row: {
    nombre: string;
    hr_entrada: string;
    hr_salida_comida: string;
    hr_regreso_comida: string;
    hr_salida: string;
  }) {
    const jornada = this.resolveJornadaTipo(row.nombre);
    const lunch = this.diffMinutes(row.hr_salida_comida, row.hr_regreso_comida);
    const dailyMinutes = this.diffMinutes(row.hr_entrada, row.hr_salida) - lunch;
    const weeklyHours = (Math.max(0, dailyMinutes) * 6) / 60;
    const max = HorariosService.WEEKLY_LIMITS[jornada];
    if (weeklyHours > max) {
      throw new BadRequestException(
        `Plantilla excede jornada legal LFT para ${jornada}: ${weeklyHours.toFixed(2)}h/semana > ${max}h`,
      );
    }
  }

  private inferJornadaByName(name: string): 'DIURNA' | 'NOCTURNA' | 'MIXTA' {
    const normalized = this.normalizeUpper(name, 120);
    if (normalized.includes('NOCT')) return 'NOCTURNA';
    if (normalized.includes('MIXT')) return 'MIXTA';
    return 'DIURNA';
  }

  private resolveJornadaTipo(name: string): 'DIURNA' | 'NOCTURNA' | 'MIXTA' {
    return this.inferJornadaByName(name);
  }

  private diffMinutes(startTime: string, endTime: string) {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    let diff = end - start;
    if (diff < 0) {
      diff += 24 * 60;
    }
    return diff;
  }

  private timeToMinutes(raw: string) {
    const text = this.normalizeTime(raw);
    const parts = text.split(':');
    const hh = Number(parts[0] ?? 0);
    const mm = Number(parts[1] ?? 0);
    return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
  }

  private resolveWeekMonday(raw?: string) {
    const base = raw ? new Date(`${raw}T00:00:00`) : new Date();
    if (Number.isNaN(base.getTime())) {
      throw new BadRequestException('week_start inválido');
    }
    const day = base.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return this.addDays(new Date(base.getFullYear(), base.getMonth(), base.getDate()), diff);
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private toIsoDateOnly(value: Date) {
    const y = value.getFullYear().toString().padStart(4, '0');
    const m = (value.getMonth() + 1).toString().padStart(2, '0');
    const d = value.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private normalizeText(raw: unknown, max: number) {
    const text = String(raw ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!text.length) {
      throw new BadRequestException('Texto requerido');
    }
    return text.length > max ? text.slice(0, max) : text;
  }

  private normalizeUpper(raw: unknown, max: number) {
    return this.normalizeText(raw, max).toUpperCase();
  }

  private async upsertHorarioFromTurno(turno: {
    nombre: string;
    hr_entrada: string;
    hr_salida_comida: string;
    hr_regreso_comida: string;
    hr_salida: string;
  }) {
    const all = await this.repo.find();
    const existing = all.find(
      (item) =>
        String(item.nombre ?? '').trim().toUpperCase() ===
        turno.nombre.trim().toUpperCase(),
    );
    const lunch = Math.max(
      0,
      this.diffMinutes(turno.hr_salida_comida, turno.hr_regreso_comida),
    );

    if (!existing) {
      const entity = this.repo.create({
        nombre: turno.nombre,
        horaEntrada: turno.hr_entrada,
        horaSalida: turno.hr_salida,
        toleranciaMinutos: 0,
        diaFestivo: false,
        inicioEntrada: turno.hr_entrada,
        finEntrada: turno.hr_entrada,
        minutosAlmuerzo: lunch,
        redondeoEntrada: 0,
        esFlexible: false,
        otMinimoMinutos: 0,
        otRequiereAutorizacion: false,
        horasJornadaMinutos: 480,
        horasExtraMinimoMinutos: 0,
        horasExtraRequiereAutorizacion: false,
        activo: true,
      });
      this.assertLftForHorario(entity);
      await this.repo.save(entity);
      return;
    }

    existing.horaEntrada = turno.hr_entrada;
    existing.horaSalida = turno.hr_salida;
    existing.minutosAlmuerzo = lunch;
    existing.inicioEntrada = turno.hr_entrada;
    existing.finEntrada = turno.hr_entrada;
    this.assertLftForHorario(existing);
    await this.repo.save(existing);
  }

  private async loadTurnosCatalogByName() {
    const map = new Map<string, TurnoCatalogoRow>();
    const rows = await this.findTurnosCatalogo();
    for (const row of rows) {
      map.set(row.nombre.trim().toUpperCase(), row);
    }
    return map;
  }

  private async loadActiveColaboradores(
    sucursalRaw?: string,
    departamentoRaw?: string,
  ) {
    const hasIdEmpleado = await this.columnExists('COLABORADORES', 'id_empleado');
    const hasDepartamento = await this.columnExists('COLABORADORES', 'departamento');
    const hasCargo = await this.columnExists('COLABORADORES', 'cargo');
    const sucursal = String(sucursalRaw ?? '').trim().toUpperCase();
    const departamento = String(departamentoRaw ?? '').trim().toUpperCase();
    const params: unknown[] = [];
    const where: string[] = ['ISNULL(c.estado, 1) = 1'];
    if (sucursal.length) {
      where.push('UPPER(LTRIM(RTRIM(ISNULL(s.codigo, \'\')))) = @0');
      params.push(sucursal);
    }
    if (departamento.length) {
      const index = params.length;
      if (hasDepartamento) {
        where.push(
          `UPPER(LTRIM(RTRIM(ISNULL(c.departamento, 'SIN_DEPARTAMENTO')))) = @${index}`,
        );
      } else {
        where.push(`'SIN_DEPARTAMENTO' = @${index}`);
      }
      params.push(departamento);
    }

    const idEmpleadoExpr = hasIdEmpleado
      ? "ISNULL(NULLIF(LTRIM(RTRIM(c.id_empleado)), ''), CONCAT('MAT-', c.id))"
      : "CONCAT('MAT-', c.id)";
    const departamentoExpr = hasDepartamento
      ? "UPPER(LTRIM(RTRIM(ISNULL(c.departamento, 'SIN_DEPARTAMENTO'))))"
      : "'SIN_DEPARTAMENTO'";
    const cargoExpr = hasCargo
      ? "LTRIM(RTRIM(ISNULL(c.cargo, 'SIN_CARGO')))"
      : "'SIN_CARGO'";

    const rows = await this.dataSource.query(
      `
      SELECT
        c.id AS colaborador_id,
        ${idEmpleadoExpr} AS id_empleado,
        CONCAT(LTRIM(RTRIM(ISNULL(c.nombre, ''))), ' ', LTRIM(RTRIM(ISNULL(c.apellido, '')))) AS nombre_completo,
        UPPER(LTRIM(RTRIM(ISNULL(s.codigo, 'SIN_SUCURSAL')))) AS sucursal,
        ${departamentoExpr} AS departamento,
        ${cargoExpr} AS cargo,
        LTRIM(RTRIM(ISNULL(h.nombre, 'SIN_TURNO'))) AS turno_predeterminado,
        CONVERT(VARCHAR(8), ISNULL(h.hora_entrada, '09:00:00'), 108) AS hora_entrada,
        CONVERT(VARCHAR(8), ISNULL(h.hora_salida, '18:00:00'), 108) AS hora_salida,
        ISNULL(h.minutos_almuerzo, 60) AS minutos_almuerzo
      FROM dbo.COLABORADORES c
      LEFT JOIN dbo.SUCURSALES s ON s.id = c.sucursal_id
      LEFT JOIN dbo.ATT_RULES_HORARIOS h ON h.id = c.horario_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.codigo ASC, c.departamento ASC, c.nombre ASC, c.apellido ASC;
      `,
      params,
    );

    return ((rows as Record<string, unknown>[]) ?? []).map((row) => ({
      colaborador_id: Number(row.colaborador_id ?? row.COLABORADOR_ID ?? 0),
      id_empleado: String(row.id_empleado ?? row.ID_EMPLEADO ?? '').trim(),
      nombre_completo: String(row.nombre_completo ?? row.NOMBRE_COMPLETO ?? '').trim(),
      sucursal: String(row.sucursal ?? row.SUCURSAL ?? '').trim(),
      departamento: String(row.departamento ?? row.DEPARTAMENTO ?? '').trim(),
      cargo: String(row.cargo ?? row.CARGO ?? '').trim(),
      turno_predeterminado: String(
        row.turno_predeterminado ?? row.TURNO_PREDETERMINADO ?? 'SIN_TURNO',
      ).trim(),
      hora_entrada: this.normalizeTime(String(row.hora_entrada ?? row.HORA_ENTRADA ?? '09:00:00')),
      hora_salida: this.normalizeTime(String(row.hora_salida ?? row.HORA_SALIDA ?? '18:00:00')),
      minutos_almuerzo: Number(row.minutos_almuerzo ?? row.MINUTOS_ALMUERZO ?? 60),
    })) as ColaboradorHorarioRow[];
  }

  private expandEventsByWeek(
    row: ColaboradorHorarioRow,
    turnosByName: Map<string, TurnoCatalogoRow>,
    days: string[],
  ) {
    const turnoByName = turnosByName.get(row.turno_predeterminado.toUpperCase());
    const entrada = turnoByName?.hr_entrada ?? row.hora_entrada;
    const salidaComida =
      turnoByName?.hr_salida_comida ?? this.minutesToTime(this.timeToMinutes(entrada) + 4 * 60);
    const regresoComida =
      turnoByName?.hr_regreso_comida ??
      this.minutesToTime(this.timeToMinutes(salidaComida) + 60);
    const salida = turnoByName?.hr_salida ?? row.hora_salida;

    const buildWeek = (value: string) => ({
      lunes: `${days[0]} ${this.timeShort(value)}`,
      martes: `${days[1]} ${this.timeShort(value)}`,
      miercoles: `${days[2]} ${this.timeShort(value)}`,
      jueves: `${days[3]} ${this.timeShort(value)}`,
      viernes: `${days[4]} ${this.timeShort(value)}`,
      sabado: `${days[5]} ${this.timeShort(value)}`,
      domingo: `${days[6]} ${this.timeShort(value)}`,
    });

    return [
      {
        colaborador_id: row.colaborador_id,
        id_empleado: row.id_empleado,
        nombre_completo: row.nombre_completo,
        sucursal: row.sucursal,
        departamento: row.departamento,
        cargo: row.cargo,
        turno_predeterminado: row.turno_predeterminado,
        evento: 'ENTRADA',
        ...buildWeek(entrada),
      },
      {
        colaborador_id: row.colaborador_id,
        id_empleado: row.id_empleado,
        nombre_completo: row.nombre_completo,
        sucursal: row.sucursal,
        departamento: row.departamento,
        cargo: row.cargo,
        turno_predeterminado: row.turno_predeterminado,
        evento: 'SALIDA_COMER',
        ...buildWeek(salidaComida),
      },
      {
        colaborador_id: row.colaborador_id,
        id_empleado: row.id_empleado,
        nombre_completo: row.nombre_completo,
        sucursal: row.sucursal,
        departamento: row.departamento,
        cargo: row.cargo,
        turno_predeterminado: row.turno_predeterminado,
        evento: 'REGRESO_COMER',
        ...buildWeek(regresoComida),
      },
      {
        colaborador_id: row.colaborador_id,
        id_empleado: row.id_empleado,
        nombre_completo: row.nombre_completo,
        sucursal: row.sucursal,
        departamento: row.departamento,
        cargo: row.cargo,
        turno_predeterminado: row.turno_predeterminado,
        evento: 'SALIDA',
        ...buildWeek(salida),
      },
    ];
  }

  private resolveDailyMinutes(
    row: ColaboradorHorarioRow,
    turnosByName: Map<string, TurnoCatalogoRow>,
  ) {
    const turnoByName = turnosByName.get(row.turno_predeterminado.toUpperCase());
    const entrada = turnoByName?.hr_entrada ?? row.hora_entrada;
    const salida = turnoByName?.hr_salida ?? row.hora_salida;
    const lunch = turnoByName
      ? this.diffMinutes(turnoByName.hr_salida_comida, turnoByName.hr_regreso_comida)
      : Math.max(0, row.minutos_almuerzo);
    return Math.max(0, this.diffMinutes(entrada, salida) - lunch);
  }

  private async getConfirmacionesByWeek(semanaIso: string) {
    void semanaIso;
    return [];
  }

  private minutesToTime(totalMinutes: number) {
    const normalized = ((Math.trunc(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
    const hh = Math.floor(normalized / 60)
      .toString()
      .padStart(2, '0');
    const mm = (normalized % 60).toString().padStart(2, '0');
    return `${hh}:${mm}:00`;
  }

  private timeShort(value: string) {
    const text = this.normalizeTime(value);
    return text.slice(0, 5);
  }

  private async columnExists(tableName: string, columnName: string) {
    const rows = await this.dataSource.query(
      `
      SELECT
        CASE WHEN COL_LENGTH(@0, @1) IS NULL THEN 0 ELSE 1 END AS exists_flag;
      `,
      [`dbo.${tableName}`, columnName],
    );

    const value = (rows?.[0] as Record<string, unknown> | undefined)?.exists_flag;
    return Number(value ?? 0) === 1;
  }
}
