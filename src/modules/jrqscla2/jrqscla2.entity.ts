import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'JRQ_SCLA2', schema: 'dbo' })
export class JrqScla2Entity {
  @PrimaryColumn({ type: 'float' })
  SCLA2: number;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DSCLA2: string | null;

  @Column({ type: 'float', nullable: true })
  SCLA: number | null;
}
