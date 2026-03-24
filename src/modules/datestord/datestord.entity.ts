import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_EST_ORD', schema: 'dbo' })
export class DatEstOrdEntity {
  @PrimaryColumn({ name: 'ESTA', type: 'float' })
  ESTA: number;

  @Column({ name: 'TIPO', type: 'nvarchar', length: 255, nullable: true })
  TIPO: string | null;

  @Column({ name: 'USR', type: 'nvarchar', length: 255, nullable: true })
  USR: string | null;
}
