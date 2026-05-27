import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'INCENTIVOS', schema: 'dbo' })
export class IncentivoEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'varchar', length: 60, name: 'tipo_incentivo' })
  tipoIncentivo: string | undefined;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    name: 'porcentaje',
    nullable: true,
  })
  porcentaje: number | null;

  @Column({
    type: 'decimal',
    precision: 18,
    scale: 2,
    name: 'importe',
    nullable: true,
  })
  importe: number | null;

  @Column({ type: 'bit', name: 'estado', default: () => '1' })
  estado: boolean | undefined;

  @Column({ type: 'datetime', name: 'creado_en', nullable: true })
  creadoEn: Date | null;

  @Column({ type: 'datetime', name: 'actualizado_en', nullable: true })
  actualizadoEn: Date | null;
}
