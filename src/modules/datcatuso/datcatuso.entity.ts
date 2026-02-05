import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_CAT_USO', schema: 'dbo' })
export class DatCatUsoEntity {
  @PrimaryColumn({ name: 'UsoCFDI', type: 'nvarchar', length: 255 })
  USOCFDI: string;

  @Column({ name: 'Descripcion', type: 'nvarchar', length: 255, nullable: true })
  DESCRIPCION: string | null;
}
