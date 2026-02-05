import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'REF_DETALLE', schema: 'dbo' })
export class RefDetalleEntity {
  @PrimaryColumn({ name: 'IDREF', type: 'nvarchar', length: 255 })
  IDREF: string;

  @Column({ name: 'SUC', type: 'nvarchar', length: 255, nullable: true })
  SUC: string | null;

  @Column({ name: 'FCNR', type: 'datetime', nullable: true })
  FCNR: Date | null;

  @Column({ name: 'FCND', type: 'datetime', nullable: true })
  FCND: Date | null;

  @Column({ name: 'OPV', type: 'nvarchar', length: 255, nullable: true })
  OPV: string | null;

  @Column({ name: 'IDFOL', type: 'nvarchar', length: 255, nullable: true })
  IDFOL: string | null;

  @Column({ name: 'IDC', type: 'float', nullable: true })
  IDC: number | null;

  @Column({ name: 'RfcEmisor', type: 'nvarchar', length: 255, nullable: true })
  RFCEMISOR: string | null;

  @Column({ name: 'TIPO', type: 'nvarchar', length: 255, nullable: true })
  TIPO: string | null;

  @Column({ name: 'IMPT', type: 'money', nullable: true })
  IMPT: number | null;

  @Column({ name: 'ESTATUS', type: 'nvarchar', length: 255, nullable: true })
  ESTATUS: string | null;
}
