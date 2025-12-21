import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_SUC', schema: 'dbo' })
export class DatSucEntity {
  @PrimaryColumn({ type: 'nvarchar', length: 10 })
  SUC: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DESC: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  ENCAR: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  ZONA: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  RFC: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  DIRECCION: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  CONTACTO: string | null;

  @Column({ type: 'int', nullable: true })
  IVA_INTEGRADO: number | null;
}
