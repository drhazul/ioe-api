import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'PV_CTR_FOL_ASVR', schema: 'dbo' })
export class PvCtrFolAsvrEntity {
  @PrimaryColumn({ name: 'IDFOL', type: 'nvarchar', length: 255 })
  IDFOL: string;

  @Column({ name: 'CLIEN', type: 'int', nullable: true })
  CLIEN: number | null;

  @Column({ name: 'DOC', type: 'nvarchar', length: 255, nullable: true })
  DOC: string | null;

  @Column({ name: 'FCN', type: 'datetime', nullable: true })
  FCN: Date | null;

  @Column({ name: 'SUC', type: 'nvarchar', length: 255, nullable: true })
  SUC: string | null;

  @Column({ name: 'TER', type: 'nvarchar', length: 255, nullable: true })
  TER: string | null;

  @Column({ name: 'TRA', type: 'nvarchar', length: 255, nullable: true })
  TRA: string | null;

  @Column({ name: 'OPV', type: 'nvarchar', length: 255, nullable: true })
  OPV: string | null;

  @Column({ name: 'ESTA', type: 'nvarchar', length: 255, nullable: true })
  ESTA: string | null;

  @Column({ name: 'IMPT', type: 'money', nullable: true })
  IMPT: number | null;

  @Column({ name: 'FPGO', type: 'nvarchar', length: 255, nullable: true })
  FPGO: string | null;

  @Column({ name: 'IMPP', type: 'money', nullable: true })
  IMPP: number | null;

  @Column({ name: 'AUT', type: 'nvarchar', length: 255, nullable: true })
  AUT: string | null;

  @Column({ name: 'REQF', type: 'int', nullable: true })
  REQF: number | null;

  @Column({ name: 'FCNM', type: 'datetime', nullable: true })
  FCNM: Date | null;

  @Column({ name: 'OPVM', type: 'nvarchar', length: 255, nullable: true })
  OPVM: string | null;

  @Column({ name: 'MOD', type: 'int', nullable: true })
  MOD: number | null;

  @Column({ name: 'IDFOLORIG', type: 'varchar', length: 50, nullable: true })
  IDFOLORIG: string | null;
}
