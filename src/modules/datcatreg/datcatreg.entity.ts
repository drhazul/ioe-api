import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_CAT_REG', schema: 'dbo' })
export class DatCatRegEntity {
  @PrimaryColumn({ name: 'C_RegimenFiscal', type: 'int' })
  C_REGIMENFISCAL: number;

  @Column({
    name: 'Descripcion',
    type: 'nvarchar',
    length: 255,
    nullable: true,
  })
  DESCRIPCION: string | null;
}
