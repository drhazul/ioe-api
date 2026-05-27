import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DOC_CTRL_MERMA', schema: 'dbo' })
export class DocCtrlMermaEntity {
  @PrimaryColumn({ type: 'nvarchar', length: 510 })
  DOCMER: string;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  USER: string | null;

  @Column({ type: 'datetime', nullable: true })
  FCNC: Date | null;

  @Column({ type: 'datetime', nullable: true })
  FCND: Date | null;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  ESTATS: string | null;

  @Column({ type: 'float', nullable: true })
  NARTS: number | null;

  @Column({ type: 'float', nullable: true })
  TOTAL: number | null;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  SUC: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  TXT: string | null;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  DOC_MB51: string | null;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  DOC_RVS: string | null;

  @Column({ type: 'datetime', nullable: true })
  FRCN: Date | null;

  @Column({ type: 'nvarchar', length: 120, nullable: true })
  AREAM: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  USER_A: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  USER_R: string | null;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  OBS_AUDIT: string | null;

  @Column({ type: 'int', nullable: true })
  ID_ESTATUS: number | null;

  @Column({ type: 'datetime', nullable: true })
  FCNAUD: Date | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  USER_AUD: string | null;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  OBS_REV: string | null;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  OBS_ANUL: string | null;

  @Column({ type: 'datetime', nullable: true })
  FCNM: Date | null;
}
