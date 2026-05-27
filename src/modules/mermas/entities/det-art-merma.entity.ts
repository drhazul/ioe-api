import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DET_ART_MERMA', schema: 'dbo' })
export class DetArtMermaEntity {
  @Column({ type: 'int', nullable: true })
  SEL: number | null;

  @PrimaryColumn({ type: 'nvarchar', length: 510 })
  IDPD: string;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  DOCMER: string | null;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  ART: string | null;

  @Column({ type: 'float', nullable: true })
  CTD: number | null;

  @Column({ type: 'int', nullable: true })
  BLOQ: number | null;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  MTVMER: string | null;

  @Column({ type: 'int', nullable: true })
  REV: number | null;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  DOCREV: string | null;

  @Column({ type: 'nvarchar', length: 510, nullable: true })
  SUC: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  CTO: string | null;

  @Column({ type: 'int', nullable: true })
  MOT_M: number | null;

  @Column({ type: 'nvarchar', length: 120, nullable: true })
  AREAM: string | null;

  @Column({ type: 'nvarchar', length: 150, nullable: true })
  RESP_M: string | null;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  OBS_M: string | null;

  @Column({ type: 'nvarchar', length: 'max', nullable: true })
  EVI_M: string | null;
}
