import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'JRQ_SCLA', schema: 'dbo' })
export class JrqSclaEntity {
  @PrimaryColumn({ type: 'float' })
  SCLA: number;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DSCLA: string | null;

  @Column({ type: 'float', nullable: true })
  CLAS: number | null;
}
