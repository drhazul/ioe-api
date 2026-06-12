import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'TRAN_CTR_DOCPRE', schema: 'dbo' })
export class TranCtrDocpreEntity {
  @PrimaryColumn({ type: 'nvarchar', length: 255 })
  DOC: string;

  @Column({ type: 'datetime', nullable: true })
  FCND: Date | null;

  @Column({ type: 'datetime', nullable: true })
  FCNC: Date | null;

  @Column({ type: 'float', nullable: true })
  CTD: number | null;

  @Column({ type: 'money', nullable: true })
  IMP: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  ESTATUS: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  TXT: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  USR: string | null;
}
