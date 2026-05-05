import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ATT_RULES_HORARIOS', schema: 'dbo' })
export class HorarioEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'varchar', length: 120, name: 'nombre' })
  nombre: string | undefined;

  @Column({ type: 'time', precision: 0, name: 'hora_entrada' })
  horaEntrada: string | undefined;

  @Column({ type: 'time', precision: 0, name: 'hora_salida' })
  horaSalida: string | undefined;

  @Column({ type: 'int', name: 'tolerancia_minutos', default: () => '0' })
  toleranciaMinutos: number | undefined;

  @Column({ type: 'bit', name: 'dia_festivo', default: () => '0' })
  diaFestivo: boolean | undefined;

  @Column({ type: 'time', precision: 0, name: 'inicio_entrada', nullable: true })
  inicioEntrada: string | null;

  @Column({ type: 'time', precision: 0, name: 'fin_entrada', nullable: true })
  finEntrada: string | null;

  @Column({ type: 'int', name: 'minutos_almuerzo', default: () => '0' })
  minutosAlmuerzo: number | undefined;

  @Column({ type: 'int', name: 'redondeo_entrada', default: () => '0' })
  redondeoEntrada: number | undefined;

  @Column({ type: 'bit', name: 'es_flexible', default: () => '0' })
  esFlexible: boolean | undefined;

  @Column({ type: 'int', name: 'ot_minimo_minutos', default: () => '0' })
  otMinimoMinutos: number | undefined;

  @Column({
    type: 'bit',
    name: 'ot_requiere_autorizacion',
    default: () => '0',
  })
  otRequiereAutorizacion: boolean | undefined;

  @Column({ type: 'int', name: 'horas_jornada_minutos', default: () => '480' })
  horasJornadaMinutos: number | undefined;

  @Column({ type: 'int', name: 'horas_extra_minimo_minutos', default: () => '0' })
  horasExtraMinimoMinutos: number | undefined;

  @Column({
    type: 'bit',
    name: 'horas_extra_requiere_autorizacion',
    default: () => '0',
  })
  horasExtraRequiereAutorizacion: boolean | undefined;

  @Column({ type: 'bit', name: 'activo', default: () => '1' })
  activo: boolean | undefined;

  @Column({ type: 'datetime', name: 'creado_en', nullable: true })
  creadoEn: Date | null;

  @Column({ type: 'datetime', name: 'actualizado_en', nullable: true })
  actualizadoEn: Date | null;
}
