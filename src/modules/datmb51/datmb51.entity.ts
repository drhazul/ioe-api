import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_MB51', schema: 'dbo' })
export class Datmb51Entity {
  @PrimaryColumn({ type: 'nvarchar', length: 255 })
  IDPD: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  USER: string | null;

  @Column({ type: 'float', nullable: true })
  CLSM: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DOCP: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  ART: string | null;

  @Column({ type: 'float', nullable: true })
  CTDA: number | null;

  @Column({ type: 'float', nullable: true })
  CTOT: number | null;

  @Column({ type: 'datetime', nullable: true })
  FCND: Date | null;

  @Column({ type: 'datetime', nullable: true })
  FCNC: Date | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  TXT: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ALMACEN: string | null;

  @Column({ type: 'int', nullable: true })
  VTAESP: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  SUC: string | null;
}
