import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'JRQ_GUIA', schema: 'dbo' })
export class JrqGuiaEntity {
  @PrimaryColumn({ type: 'nvarchar', length: 255 })
  GUIA: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DESCORT: string | null;

  @Column({ type: 'float', nullable: true })
  SCLA2: number | null;
}
