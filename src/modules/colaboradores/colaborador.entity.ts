import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HorarioEntity } from '../horarios/horario.entity';
import { SucursalEntity } from '../sucursales/sucursal.entity';

@Entity({ name: 'COLABORADORES', schema: 'dbo' })
export class ColaboradorEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'varchar', length: 255, name: 'pin', unique: true })
  pin: string | undefined;

  @Column({
    type: 'varchar',
    length: 40,
    name: 'id_empleado',
    nullable: true,
    unique: true,
  })
  idEmpleado: string | null;

  @Column({ type: 'varchar', length: 150, name: 'nombre' })
  nombre: string | undefined;

  @Column({ type: 'varchar', length: 150, name: 'apellido' })
  apellido: string | undefined;

  @Column({
    type: 'varchar',
    length: 150,
    name: 'apellido_paterno',
    nullable: true,
  })
  apellidoPaterno: string | null;

  @Column({
    type: 'varchar',
    length: 150,
    name: 'apellido_materno',
    nullable: true,
  })
  apellidoMaterno: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'departamento',
    nullable: true,
  })
  departamento: string | null;

  @Column({ type: 'varchar', length: 150, name: 'cargo', nullable: true })
  cargo: string | null;

  @Column({ type: 'int', name: 'sucursal_id' })
  sucursalId: number | undefined;

  @ManyToOne(() => SucursalEntity, { nullable: false })
  @JoinColumn({ name: 'sucursal_id' })
  sucursal: SucursalEntity | undefined;

  @Column({ type: 'int', name: 'privilegio', default: () => '0' })
  privilegio: number | undefined;

  @Column({ type: 'bit', name: 'estado', default: () => '1' })
  estado: boolean | undefined;

  @Column({ type: 'bit', name: 'app_access', default: () => '1' })
  appAccess: boolean | undefined;

  @Column({ type: 'bit', name: 'gps_allowed', default: () => '0' })
  gpsAllowed: boolean | undefined;

  @Column({ type: 'bit', name: 'qr_allowed', default: () => '0' })
  qrAllowed: boolean | undefined;

  @Column({ type: 'varchar', length: 13, name: 'rfc', nullable: true })
  rfc: string | null;

  @Column({ type: 'varchar', length: 18, name: 'curp', nullable: true })
  curp: string | null;

  @Column({ type: 'varchar', length: 11, name: 'nss', nullable: true })
  nss: string | null;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'jornada_tipo',
    default: () => "'DIURNA'",
  })
  jornadaTipo: string | undefined;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'estatus_contrato',
    default: () => "'PLANTA'",
  })
  estatusContrato: string | undefined;

  @Column({
    type: 'bit',
    name: 'documentacion_completa',
    default: () => '0',
  })
  documentacionCompleta: boolean | undefined;

  @Column({ type: 'int', name: 'horario_id', nullable: true })
  horarioId: number | null;

  @ManyToOne(() => HorarioEntity, { nullable: true })
  @JoinColumn({ name: 'horario_id' })
  horario: HorarioEntity | null;

  @Column({ type: 'date', name: 'vencimiento_contrato', nullable: true })
  vencimientoContrato: string | null;

  @Column({ type: 'bit', name: 'es_admin_dispositivo', default: () => '0' })
  esAdminDispositivo: boolean | undefined;

  @Column({ type: 'bigint', name: 'id_sueldo', nullable: true })
  idSueldo: number | null;
}
