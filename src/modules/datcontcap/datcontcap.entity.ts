import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'DAT_CONT_CAPTURA', schema: 'dbo' })
@Index('UQ_DAT_CONT_CAPTURA_UUID', ['CAPTURA_UUID'], { unique: true })
export class DatContCapEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'ID' })
  ID: number;

  @Column({ name: 'SUC', type: 'nvarchar', length: 5 })
  SUC: string;

  @Column({ name: 'CONT', type: 'nvarchar', length: 255 })
  CONT: string;

  @Column({ name: 'ART', type: 'nvarchar', length: 50 })
  ART: string;

  @Column({ name: 'UPC', type: 'nvarchar', length: 15, nullable: true })
  UPC: string | null;

  @Column({ name: 'ALMACEN', type: 'nvarchar', length: 10 })
  ALMACEN: string;

  @Column({ name: 'CANT', type: 'float' })
  CANT: number;

  @Column({ name: 'TIPO_MOV', type: 'nvarchar', length: 10, nullable: true })
  TIPO_MOV: string | null;

  @Column({ name: 'IDUSUARIO', type: 'int' })
  IDUSUARIO: number;

  @Column({ name: 'FCNR', type: 'datetime', default: () => 'GETDATE()' })
  FCNR: Date;

  @Column({ name: 'CAPTURA_UUID', type: 'uniqueidentifier', unique: true })
  CAPTURA_UUID: string;
}
