import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_RET_CTR_SVR', schema: 'dbo' })
export class DatRetCtrSvrEntity {
  @PrimaryColumn({ name: 'IDRET', type: 'nvarchar', length: 255 })
  IDRET: string;

  @Column({ name: 'TER', type: 'nvarchar', length: 255, nullable: true })
  TER: string | null;

  @Column({ name: 'OPV', type: 'nvarchar', length: 255, nullable: true })
  OPV: string | null;

  @Column({ name: 'FCNR', type: 'datetime', nullable: true })
  FCNR: Date | null;

  @Column({ name: 'IMPR', type: 'money', nullable: true })
  IMPR: number | null;

  @Column({ name: 'ESTA', type: 'nvarchar', length: 255, nullable: true })
  ESTA: string | null;
}
