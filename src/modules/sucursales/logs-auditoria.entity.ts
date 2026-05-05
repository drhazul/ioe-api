import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'LOGS_AUDITORIA', schema: 'dbo' })
export class LogsAuditoriaEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'int', name: 'admin_id', nullable: true })
  adminId: number | null;

  @Column({ type: 'varchar', length: 40, name: 'accion' })
  accion: string;

  @Column({ type: 'varchar', length: 100, name: 'modulo' })
  modulo: string;

  @Column({ type: 'varchar', length: 64, name: 'ip_origen', nullable: true })
  ipOrigen: string | null;

  @Column({ type: 'varchar', length: 'MAX', name: 'detalles', nullable: true })
  detalles: string | null;

  @Column({ type: 'datetime', name: 'fecha', default: () => 'GETDATE()' })
  fecha: Date | undefined;
}
