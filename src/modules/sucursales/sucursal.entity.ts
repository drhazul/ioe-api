import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'SUCURSALES', schema: 'dbo' })
export class SucursalEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'varchar', length: 30, name: 'codigo' })
  codigo: string | undefined;

  @Column({ type: 'varchar', length: 160, name: 'nombre' })
  nombre: string | undefined;

  @Column({ type: 'varchar', length: 160, name: 'empresa' })
  empresa: string | undefined;

  @Column({
    type: 'varchar',
    length: 300,
    name: 'direccion_completa',
    nullable: true,
  })
  direccionCompleta: string | null;

  @Column({ type: 'varchar', length: 30, name: 'telefono', nullable: true })
  telefono: string | null;

  @Column({ type: 'varchar', length: 20, name: 'zona_horaria', nullable: true })
  zonaHoraria: string | null;

  @Column({
    type: 'varchar',
    length: 80,
    name: 'id_externo_nomina',
    nullable: true,
  })
  idExternoNomina: string | null;

  @Column({ type: 'bit', name: 'estado', default: () => '1' })
  estado: boolean | undefined;

  @Column({ type: 'float', name: 'latitud', nullable: true })
  latitud: number | null;

  @Column({ type: 'float', name: 'longitud', nullable: true })
  longitud: number | null;

  @Column({ type: 'int', name: 'radio_metros', nullable: true })
  radioMetros: number | null;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'sucursal_token',
    nullable: true,
  })
  sucursalToken: string | null;

  @Column({ type: 'datetime2', name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;
}
