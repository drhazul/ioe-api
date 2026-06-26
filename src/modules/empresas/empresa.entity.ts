import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'EMPRESA', schema: 'dbo' })
export class EmpresaEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'idempresa' })
  idempresa: number;

  @Column({ type: 'nvarchar', length: 200, name: 'razon_social' })
  razonSocial: string;

  @Column({ type: 'nvarchar', length: 300, name: 'direccion', nullable: true })
  direccion: string | null;

  @Column({ type: 'nvarchar', length: 120, name: 'correo' })
  correo: string;

  @Column({
    type: 'datetime2',
    precision: 0,
    name: 'fcncreacion',
    default: () => 'SYSDATETIME()',
  })
  fcncreacion: Date;

  @Column({ type: 'nvarchar', length: 10, name: 'cp', nullable: true })
  cp: string | null;

  @Column({ type: 'nvarchar', length: 20, name: 'rfc', nullable: true })
  rfc: string | null;

  @Column({ type: 'nvarchar', length: 30, name: 'telefono', nullable: true })
  telefono: string | null;
}
