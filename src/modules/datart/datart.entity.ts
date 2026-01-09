import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_ART', schema: 'dbo' })
export class DatArtEntity {
  @PrimaryColumn({ type: 'nvarchar', length: 5 })
  SUC: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  TIPO: string | null;

  @PrimaryColumn({ type: 'nvarchar', length: 10 })
  ART: string;

  @PrimaryColumn({ type: 'nvarchar', length: 15 })
  UPC: string;

  @Column({ type: 'float', nullable: true })
  CLAVESAT: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  UNIMEDSAT: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DES: string | null;

  @Column({ type: 'float', nullable: true })
  STOCK: number | null;

  @Column({ type: 'float', nullable: true })
  STOCK_MIN: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  ESTATUS: string | null;

  @Column({ type: 'float', nullable: true })
  DIA_REABASTO: number | null;

  @Column({ type: 'money', nullable: true })
  PVTA: number | null;

  @Column({ type: 'money', nullable: true })
  CTOP: number | null;

  @Column({ type: 'float', nullable: true })
  PROV_1: number | null;

  @Column({ type: 'money', nullable: true })
  CTO_PROV1: number | null;

  @Column({ type: 'float', nullable: true })
  PROV_2: number | null;

  @Column({ type: 'money', nullable: true })
  CTO_PROV2: number | null;

  @Column({ type: 'float', nullable: true })
  PROV_3: number | null;

  @Column({ type: 'money', nullable: true })
  CTO_PROV3: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  UN_COMP: string | null;

  @Column({ type: 'float', nullable: true })
  FACT_COMP: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  UN_VTA: string | null;

  @Column({ type: 'float', nullable: true })
  FACT_VTA: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  BASE: string | null;

  @Column({ type: 'float', nullable: true })
  SPH: number | null;

  @Column({ type: 'float', nullable: true })
  CYL: number | null;

  @Column({ type: 'float', nullable: true })
  ADIC: number | null;

  @Column({ type: 'float', nullable: true })
  DEPA: number | null;

  @Column({ type: 'float', nullable: true })
  SUBD: number | null;

  @Column({ type: 'float', nullable: true })
  CLAS: number | null;

  @Column({ type: 'float', nullable: true })
  SCLA: number | null;

  @Column({ type: 'float', nullable: true })
  SCLA2: number | null;

  @Column({ type: 'float', nullable: true })
  UMUE: number | null;

  @Column({ type: 'float', nullable: true })
  UTRA: number | null;

  @Column({ type: 'float', nullable: true })
  UNIV: number | null;

  @Column({ type: 'float', nullable: true })
  UFRE: number | null;

  @Column({ type: 'int', nullable: true })
  BLOQ: number | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  MARCA: string | null;

  @Column({ type: 'varchar', length: 'MAX', nullable: true })
  MODELO: string | null;

  @Column({ type: 'int', nullable: true })
  SELJA: number | null;

  @Column({ type: 'int', nullable: true })
  SELOP: number | null;

  @Column({ type: 'int', nullable: true })
  MODF: number | null;
}
