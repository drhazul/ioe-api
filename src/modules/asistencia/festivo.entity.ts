import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'FESTIVOS', schema: 'dbo' })
export class FestivoEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'varchar', length: 120, name: 'nombre' })
  nombre: string | undefined;

  @Column({ type: 'date', name: 'fecha' })
  fecha: string | undefined;

  @Column({ type: 'varchar', length: 30, name: 'tipo', default: () => "'OFICIAL'" })
  tipo: string | undefined;

  @Column({ type: 'varchar', length: 255, name: 'descripcion', nullable: true })
  descripcion: string | null;

  @Column({ type: 'bit', name: 'es_recurrente', default: () => '0' })
  esRecurrente: boolean | undefined;

  @Column({ type: 'bit', name: 'aplica_todo_pais', default: () => '1' })
  aplicaTodoPais: boolean | undefined;

  @Column({ type: 'bit', name: 'activo', default: () => '1' })
  activo: boolean | undefined;

  @Column({ type: 'datetime', name: 'creado_en', nullable: true })
  creadoEn: Date | null;

  @Column({ type: 'datetime', name: 'actualizado_en', nullable: true })
  actualizadoEn: Date | null;
}
