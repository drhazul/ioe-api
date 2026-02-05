import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'PV_CTR_FOL_FORM', schema: 'dbo' })
export class PvCtrFolFormEntity {
  @PrimaryColumn({ name: 'IDF', type: 'nvarchar', length: 255 })
  IDF: string;

  @Column({ name: 'IDFOL', type: 'nvarchar', length: 255, nullable: true })
  IDFOL: string | null;

  @Column({ name: 'FCN', type: 'datetime', nullable: true })
  FCN: Date | null;

  @Column({ name: 'FORM', type: 'nvarchar', length: 255, nullable: true })
  FORM: string | null;

  @Column({ name: 'IMPA', type: 'money', nullable: true })
  IMPA: number | null;

  @Column({ name: 'IMPP', type: 'money', nullable: true })
  IMPP: number | null;

  @Column({ name: 'IMPC', type: 'money', nullable: true })
  IMPC: number | null;

  @Column({ name: 'IMPD', type: 'money', nullable: true })
  IMPD: number | null;

  @Column({ name: 'AUT', type: 'nvarchar', length: 255, nullable: true })
  AUT: string | null;

  @Column({ name: 'ESTA', type: 'nvarchar', length: 255, nullable: true })
  ESTA: string | null;

  @Column({ name: 'ESTAF', type: 'nvarchar', length: 255, nullable: true })
  ESTAF: string | null;
}
