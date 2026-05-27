import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'MERMA_EVIDENCIA', schema: 'dbo' })
export class MermaEvidenciaEntity {
  @PrimaryGeneratedColumn('uuid')
  ID: string;

  @Column({ type: 'nvarchar', length: 510 })
  IDPD: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  NOMBRE_ARCHIVO: string | null;

  @Column({ type: 'nvarchar', length: 20, nullable: true })
  EXTENSION: string | null;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  MIME_TYPE: string | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  URL_ARCHIVO: string | null;

  @Column({ type: 'bigint', nullable: true })
  PESO_BYTES: string | null;

  @Column({ type: 'datetime' })
  FCN: Date;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  USER_CREA: string | null;
}
