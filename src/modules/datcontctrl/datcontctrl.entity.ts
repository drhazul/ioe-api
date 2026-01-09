import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_CONT_CTRL', schema: 'dbo' })
export class DatContCtrlEntity {
  @PrimaryColumn({ name: 'tokenreg', type: 'nvarchar', length: 255 })
  TOKENREG: string;

  @Column({ name: 'CONT', type: 'nvarchar', length: 255, nullable: true })
  CONT: string | null;

  @Column({ name: 'FCNC', type: 'datetime', nullable: true })
  FCNC: Date | null;

  @Column({ name: 'ESTA', type: 'nvarchar', length: 255, nullable: true })
  ESTA: string | null;

  @Column({ name: 'SUC', type: 'nvarchar', length: 255, nullable: true })
  SUC: string | null;

  @Column({ name: 'FCNAJ', type: 'datetime', nullable: true })
  FCNAJ: Date | null;

  @Column({ name: 'ARTAJ', type: 'float', nullable: true })
  ARTAJ: number | null;

  @Column({ name: 'ARTCONT', type: 'float', nullable: true })
  ARTCONT: number | null;

  @Column({ name: 'tipocont', type: 'nvarchar', length: 255, nullable: true })
  TIPOCONT: string | null;

  @Column({ name: 'TOTAL_ITEMS', type: 'int', nullable: true })
  TOTAL_ITEMS: number | null;

  @Column({ name: 'FILE_NAME', type: 'nvarchar', length: 255, nullable: true })
  FILE_NAME: string | null;

  @Column({ name: 'LAST_ERROR', type: 'nvarchar', length: 4000, nullable: true })
  LAST_ERROR: string | null;

  @Column({ name: 'creado', type: 'datetime', nullable: true })
  CREADO: Date | null;

  @Column({ name: 'CREADO_POR', type: 'nvarchar', length: 255, nullable: true })
  CREADO_POR: string | null;

  @Column({ name: 'MODIFICADO_POR', type: 'nvarchar', length: 255, nullable: true })
  MODIFICADO_POR: string | null;
}
