import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'DEPARTAMENTO', schema: 'dbo' })
export class DepartamentoEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  IDDEPTO: number;

  @Column({ type: 'nvarchar', length: 100, unique: true })
  NOMBRE: string;

  @Column({ type: 'bit', default: () => '1' })
  ACTIVO: boolean;

  @Column({ type: 'datetime2', precision: 0, default: () => 'SYSDATETIME()' })
  FCNR: Date;
}
