import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'FACT_CLIENT_SHP', schema: 'dbo' })
export class FactClientShpEntity {
  @PrimaryColumn({ name: 'IDC', type: 'float' })
  IDC: number;

  @Column({ name: 'CLIEN_UNI', type: 'float', nullable: true })
  CLIEN_UNI: number | null;

  @Column({ name: 'TIPO', type: 'nvarchar', length: 255, nullable: true })
  TIPO: string | null;

  @Column({ name: 'FCNR', type: 'datetime', nullable: true })
  FCNR: Date | null;

  @Column({ name: 'RazonSocialReceptor', type: 'nvarchar', length: 255 })
  RAZONSOCIALRECEPTOR: string;

  @Column({ name: 'DOMI', type: 'nvarchar', length: 255, nullable: true })
  DOMI: string | null;

  @Column({ name: 'RfcReceptor', type: 'nvarchar', length: 255 })
  RFCRECEPTOR: string;

  @Column({ name: 'NCEL', type: 'nvarchar', length: 255, nullable: true })
  NCEL: string | null;

  @Column({ name: 'NTJT', type: 'nvarchar', length: 255, nullable: true })
  NTJT: string | null;

  @Column({ name: 'EmailReceptor', type: 'nvarchar', length: 255 })
  EMAILRECEPTOR: string;

  @Column({ name: 'RfcEmisor', type: 'nvarchar', length: 255 })
  RFCEMISOR: string;

  @Column({ name: 'OPTICA', type: 'nvarchar', length: 255, nullable: true })
  OPTICA: string | null;

  @Column({ name: 'UsoCfdi', type: 'nvarchar', length: 255 })
  USOCFDI: string;

  @Column({ name: 'CodigoPostalReceptor', type: 'nvarchar', length: 255 })
  CODIGOPOSTALRECEPTOR: string;

  @Column({ name: 'RegimenFiscalReceptor', type: 'float' })
  REGIMENFISCALRECEPTOR: number;

  @Column({ name: 'VF', type: 'float', nullable: true })
  VF: number | null;

  @Column({ name: 'ESTATUS', type: 'float', nullable: true })
  ESTATUS: number | null;

  @Column({ name: 'DATVAL', type: 'int', nullable: true })
  DATVAL: number | null;

  @Column({ name: 'MOD', type: 'int', nullable: true })
  MOD: number | null;

  @Column({ name: 'SUC', type: 'varchar', length: 10, nullable: true })
  SUC: string | null;

  @Column({ name: 'descuentoApli', type: 'float', nullable: true })
  DESCUENTOAPLI: number | null;
}
