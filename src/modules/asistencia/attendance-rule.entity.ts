import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ATT_RULES', schema: 'dbo' })
export class AttendanceRuleEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'varchar', length: 120, name: 'nombre' })
  nombre: string | undefined;

  @Column({ type: 'int', name: 'sucursal_id', nullable: true })
  sucursalId: number | null;

  @Column({ type: 'int', name: 'horario_id', nullable: true })
  horarioId: number | null;

  @Column({ type: 'int', name: 'tolerancia_retardo_minutos', default: () => '0' })
  toleranciaRetardoMinutos: number | undefined;

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

  @Column({ type: 'bit', name: 'aplicar_dias_festivos', default: () => '1' })
  aplicarDiasFestivos: boolean | undefined;

  @Column({ type: 'bit', name: 'aplicar_descanso', default: () => '1' })
  aplicarDescanso: boolean | undefined;

  @Column({ type: 'bit', name: 'activo', default: () => '1' })
  activo: boolean | undefined;

  @Column({ type: 'datetime', name: 'creado_en', nullable: true })
  creadoEn: Date | null;

  @Column({ type: 'datetime', name: 'actualizado_en', nullable: true })
  actualizadoEn: Date | null;
}
