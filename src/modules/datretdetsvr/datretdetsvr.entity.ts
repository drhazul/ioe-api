import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_RET_DET_SVR', schema: 'dbo' })
export class DatRetDetSvrEntity {
  @PrimaryColumn({ name: 'ID', type: 'nvarchar', length: 255 })
  ID: string;

  @Column({ name: 'IDRET', type: 'nvarchar', length: 255, nullable: true })
  IDRET: string | null;

  @Column({ name: 'FORMA', type: 'nvarchar', length: 255, nullable: true })
  FORMA: string | null;

  @Column({ name: 'IMPF', type: 'money', nullable: true })
  IMPF: number | null;
}
