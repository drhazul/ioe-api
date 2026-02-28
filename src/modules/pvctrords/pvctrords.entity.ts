import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'PV_CTR_ORDS', schema: 'dbo' })
export class PvCtrOrdsEntity {
  @PrimaryColumn({ name: 'IORD', type: 'nvarchar', length: 255 })
  IORD: string;

  @Column({ name: 'IDFOL', type: 'nvarchar', length: 255, nullable: true })
  IDFOL: string | null;

  @Column({ name: 'TIPO', type: 'nvarchar', length: 255, nullable: true })
  TIPO: string | null;

  @Column({ name: 'OPV', type: 'nvarchar', length: 255, nullable: true })
  OPV: string | null;

  @Column({ name: 'FCNS', type: 'datetime', nullable: true })
  FCNS: Date | null;

  @Column({ name: 'FCNM', type: 'datetime', nullable: true })
  FCNM: Date | null;

  @Column({ name: 'CLIEN', type: 'float', nullable: true })
  CLIEN: number | null;

  @Column({ name: 'MAT', type: 'nvarchar', length: 255, nullable: true })
  MAT: string | null;

  @Column({ name: 'CTD', type: 'float', nullable: true })
  CTD: number | null;

  @Column({ name: 'ART', type: 'nvarchar', length: 255, nullable: true })
  ART: string | null;

  @Column({ name: 'COMAD', type: 'text', nullable: true })
  COMAD: string | null;

  @Column({ name: 'ESTATUS', type: 'int', nullable: true })
  ESTATUS: number | null;

  @Column({ name: 'ESTSEGU', type: 'float', nullable: true })
  ESTSEGU: number | null;

  @Column({ name: 'ASIGN', type: 'nvarchar', length: 255, nullable: true })
  ASIGN: string | null;

  @Column({ name: 'FCNRT', type: 'datetime', nullable: true })
  FCNRT: Date | null;

  @Column({ name: 'FCNAS', type: 'datetime', nullable: true })
  FCNAS: Date | null;

  @Column({ name: 'FCNTE', type: 'datetime', nullable: true })
  FCNTE: Date | null;

  @Column({ name: 'FCNTD', type: 'datetime', nullable: true })
  FCNTD: Date | null;

  @Column({ name: 'FCNEN', type: 'datetime', nullable: true })
  FCNEN: Date | null;

  @Column({ name: 'LABOR', type: 'int', nullable: true })
  LABOR: number | null;

  @Column({ name: 'TPOM', type: 'int', nullable: true })
  TPOM: number | null;

  @Column({ name: 'MOTR', type: 'int', nullable: true })
  MOTR: number | null;

  @Column({ name: 'REOORD', type: 'nvarchar', length: 255, nullable: true })
  REOORD: string | null;

  @Column({ name: 'DOCIF', type: 'nvarchar', length: 255, nullable: true })
  DOCIF: string | null;

  @Column({ name: 'SEL', type: 'int', nullable: true })
  SEL: number | null;

  @Column({ name: 'FCNMOD', type: 'datetime', nullable: true })
  FCNMOD: Date | null;

  @Column({ name: 'SUC', type: 'nvarchar', length: 255, nullable: true })
  SUC: string | null;

  @Column({ name: 'NCLIENTE', type: 'nvarchar', length: 255, nullable: true })
  NCLIENTE: string | null;

  @Column({ name: 'RQFAC', type: 'int', nullable: true })
  RQFAC: number | null;

  @Column({ name: 'DESCART', type: 'nvarchar', length: 255, nullable: true })
  DESCART: string | null;

  @Column({ name: 'CTORD', type: 'float', nullable: true })
  CTORD: number | null;

  @Column({ name: 'selCtrlOrd', type: 'int', nullable: true })
  SELCTRLORD: number | null;

  @Column({ name: 'selCtrOrdT', type: 'int', nullable: true })
  SELCTRORDT: number | null;

  @Column({ name: 'selEnt', type: 'int', nullable: true })
  SELENT: number | null;

  @Column({ name: 'RESMEMR', type: 'nvarchar', length: 255, nullable: true })
  RESMEMR: string | null;

  @Column({ name: 'HR_ENT', type: 'datetime', nullable: true })
  HR_ENT: Date | null;
}
