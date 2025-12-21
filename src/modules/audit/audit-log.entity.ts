import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'AUDIT_LOG', schema: 'dbo' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  IDLOG: string;

  @Column({ type: 'int', nullable: true })
  IDUSUARIO: number | null;

  @Column({ type: 'nvarchar', length: 50 })
  ACTION: string;

  @Column({ type: 'nvarchar', length: 80, nullable: true })
  MODULO: string | null;

  @Column({ type: 'nvarchar', length: 80, nullable: true })
  ENTIDAD: string | null;

  @Column({ type: 'nvarchar', length: 80, nullable: true })
  ENTIDAD_ID: string | null;

  @Column({ type: 'nvarchar', length: 10, nullable: true })
  SUC: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  METADATA_JSON: string | null;

  @Column({ type: 'nvarchar', length: 64, nullable: true })
  IP: string | null;

  @Column({ type: 'datetime2', precision: 0, default: () => 'SYSDATETIME()' })
  FCNR: Date;
}
