import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'PV_CTR_ORDS_DET', schema: 'dbo' })
export class PvCtrOrdsDetEntity {
  @PrimaryColumn({ name: 'IORDP', type: 'nvarchar', length: 255 })
  IORDP: string;

  @Column({ name: 'IORD', type: 'nvarchar', length: 255, nullable: true })
  IORD: string | null;

  @Column({ name: 'ART', type: 'nvarchar', length: 255, nullable: true })
  ART: string | null;

  @Column({ name: 'JOB', type: 'nvarchar', length: 255, nullable: true })
  JOB: string | null;

  @Column({ name: 'ESF', type: 'nvarchar', length: 255, nullable: true })
  ESF: string | null;

  @Column({ name: 'CIL', type: 'nvarchar', length: 255, nullable: true })
  CIL: string | null;

  @Column({ name: 'EJE', type: 'nvarchar', length: 255, nullable: true })
  EJE: string | null;
}
