import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'GRUP_MODULO', schema: 'dbo' })
export class GrupModuloEntity {
  @PrimaryGeneratedColumn()
  IDGRUP_MODULO: number;

  @Column({ type: 'nvarchar', length: 100 })
  NOMBRE: string;

  @Column({ type: 'bit' })
  ACTIVO: boolean;

  @Column({ type: 'datetime2', precision: 0 })
  FCNR: Date;
}
