import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_RET_DET_EFEC_SVR', schema: 'dbo' })
export class DatRetDetEfecSvrEntity {
  @PrimaryColumn({ name: 'ID', type: 'nvarchar', length: 255 })
  ID: string;

  @Column({ name: 'IDFOR', type: 'nvarchar', length: 255, nullable: true })
  IDFOR: string | null;

  @Column({ name: 'DENO', type: 'money', nullable: true })
  DENO: number | null;

  @Column({ name: 'CTDA', type: 'float', nullable: true })
  CTDA: number | null;

  @Column({ name: 'TOTAL', type: 'float', nullable: true })
  TOTAL: number | null;
}
