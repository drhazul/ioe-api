import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DepartamentoEntity } from '../deptos/departamento.entity';

@Entity({ name: 'PUESTO', schema: 'dbo' })
export class PuestoEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  IDPUESTO: number;

  @Column({ type: 'int' })
  IDDEPTO: number;

  @ManyToOne(() => DepartamentoEntity, { nullable: false })
  @JoinColumn({ name: 'IDDEPTO' })
  DEPARTAMENTO: DepartamentoEntity;

  @Column({ type: 'nvarchar', length: 120 })
  NOMBRE: string;

  @Column({ type: 'bit', default: () => '1' })
  ACTIVO: boolean;

  @Column({ type: 'datetime2', precision: 0, default: () => 'SYSDATETIME()' })
  FCNR: Date;
}
