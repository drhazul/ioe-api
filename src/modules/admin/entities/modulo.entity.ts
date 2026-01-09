import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'MODULO', schema: 'dbo' })
export class ModuloEntity {
  @PrimaryGeneratedColumn()
  IDMODULO: number;

  @Column({ type: 'nvarchar', length: 50 })
  CODIGO: string;

  @Column({ type: 'nvarchar', length: 100 })
  NOMBRE: string;

  @Column({ type: 'bit' })
  ACTIVO: boolean;

  @Column({ type: 'datetime2', precision: 0 })
  FCNR: Date;
}
