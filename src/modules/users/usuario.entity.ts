import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RolEntity } from '../roles/rol.entity';
import { DepartamentoEntity } from '../deptos/departamento.entity';
import { PuestoEntity } from '../puestos/puesto.entity';
import { DatSucEntity } from '../dat-suc/dat-suc.entity';

@Entity({ name: 'USUARIO', schema: 'dbo' })
export class UsuarioEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  IDUSUARIO: number;

  @Column({ type: 'nvarchar', length: 60, unique: true })
  USERNAME: string;

  @Column({ type: 'nvarchar', length: 255 })
  PASSWORD_HASH: string;

  @Column({ type: 'nvarchar', length: 120, nullable: true })
  NOMBRE: string | null;

  @Column({ type: 'nvarchar', length: 120, nullable: true })
  APELLIDOS: string | null;

  @Column({ type: 'nvarchar', length: 150, unique: true })
  MAIL: string;

  @Column({ type: 'nvarchar', length: 10 })
  ESTATUS: 'ACTIVO' | 'INACTIVO';

  @Column({ type: 'int' })
  NIVEL: number;

  @Column({ type: 'int' })
  IDROL: number;

  @ManyToOne(() => RolEntity, { nullable: false })
  @JoinColumn({ name: 'IDROL' })
  ROL: RolEntity;

  @Column({ type: 'int', nullable: true })
  IDDEPTO: number | null;

  @ManyToOne(() => DepartamentoEntity, { nullable: true })
  @JoinColumn({ name: 'IDDEPTO' })
  DEPARTAMENTO: DepartamentoEntity | null;

  @Column({ type: 'int', nullable: true })
  IDPUESTO: number | null;

  @ManyToOne(() => PuestoEntity, { nullable: true })
  @JoinColumn({ name: 'IDPUESTO' })
  PUESTO: PuestoEntity | null;

  @Column({ type: 'nvarchar', length: 10, nullable: true })
  SUC: string | null;

  @ManyToOne(() => DatSucEntity, { nullable: true })
  @JoinColumn({ name: 'SUC' })
  SUCURSAL: DatSucEntity | null;

  @Column({ type: 'datetime2', precision: 0, default: () => 'SYSDATETIME()' })
  FCNR: Date;
}
