import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'DAT_DET_SVR', schema: 'dbo' })
export class DatDetSvrEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'ID' })
  ID: number;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  ART: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  UPC: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  CONT: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DES: string | null;

  @Column({ type: 'money', nullable: true })
  CTOP: number | null;

  @Column({ type: 'float', nullable: true })
  TOTAL: number | null;

  @Column({ type: 'float', nullable: true })
  MB52_T: number | null;

  @Column({ type: 'float', nullable: true })
  DIF_T: number | null;

  @Column({ type: 'money', nullable: true })
  DIF_CTOP: number | null;

  @Column({ type: 'float', nullable: true })
  DEPA: number | null;

  @Column({ type: 'float', nullable: true })
  SUBD: number | null;

  @Column({ type: 'float', nullable: true })
  CLAS: number | null;

  @Column({ type: 'smallint', nullable: true })
  EXT: number | null;

  @Column({ name: '001', type: 'float', nullable: true })
  '001': number | null;

  @Column({ name: '002', type: 'float', nullable: true })
  '002': number | null;

  @Column({ type: 'float', nullable: true })
  M001: number | null;

  @Column({ type: 'float', nullable: true })
  T001: number | null;

  @Column({ type: 'float', nullable: true })
  MB52_01: number | null;

  @Column({ type: 'float', nullable: true })
  MB52_02: number | null;

  @Column({ type: 'float', nullable: true })
  MB52_M1: number | null;

  @Column({ type: 'float', nullable: true })
  MB52_T1: number | null;

  @Column({ type: 'float', nullable: true })
  DIF_01: number | null;

  @Column({ type: 'float', nullable: true })
  DIF_02: number | null;

  @Column({ type: 'float', nullable: true })
  DIF_M1: number | null;

  @Column({ type: 'float', nullable: true })
  DIF_T1: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  SUC: string | null;
}
