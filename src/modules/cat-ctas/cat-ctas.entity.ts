import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_CAT_CTAS', schema: 'dbo' })
export class CatCtasEntity {
  @PrimaryColumn({ type: 'nvarchar', length: 255 })
  CTA: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DCTA: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  RELACION: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  SUC: string | null;
}
