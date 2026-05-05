import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ATT_SOLICITUDES', schema: 'dbo' })
export class AttSolicitudEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'int', name: 'colaborador_id' })
  colaboradorId: number | undefined;

  @Column({ type: 'int', name: 'tipo_id' })
  tipoId: number | undefined;

  @Column({ type: 'date', name: 'fecha_inicio' })
  fechaInicio: string | undefined;

  @Column({ type: 'date', name: 'fecha_fin' })
  fechaFin: string | undefined;

  @Column({ type: 'varchar', length: 500, name: 'motivo', nullable: true })
  motivo: string | null;

  @Column({ type: 'varchar', length: 500, name: 'evidencia_url', nullable: true })
  evidenciaUrl: string | null;

  @Column({ type: 'varchar', length: 20, name: 'estatus', default: () => "'PENDIENTE'" })
  estatus: string | undefined;

  @Column({ type: 'int', name: 'aprobado_por', nullable: true })
  aprobadoPor: number | null;

  @Column({ type: 'datetime', name: 'creado_en', nullable: true })
  creadoEn: Date | null;

  @Column({ type: 'datetime', name: 'actualizado_en', nullable: true })
  actualizadoEn: Date | null;
}
