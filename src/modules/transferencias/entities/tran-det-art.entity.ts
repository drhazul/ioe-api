import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'TRAN_DET_ART', schema: 'dbo' })
export class TranDetArtEntity {
  @PrimaryColumn({ type: 'nvarchar', length: 255 })
  IDPD: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DOC: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  ART: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  CTD: string | null;

  @Column({ type: 'int', nullable: true })
  BLOQ: number | null;
}
