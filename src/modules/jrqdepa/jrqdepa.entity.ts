import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'JRQ_DEPA', schema: 'dbo' })
export class JrqDepaEntity {
  @PrimaryColumn({ type: 'float' })
  DEPA: number;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DDEPA: string | null;
}
