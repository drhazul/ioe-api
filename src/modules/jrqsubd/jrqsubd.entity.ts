import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'JRQ_SUBD', schema: 'dbo' })
export class JrqSubdEntity {
  @PrimaryColumn({ type: 'float' })
  SUBD: number;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DSUBD: string | null;

  @Column({ type: 'float', nullable: true })
  DEPA: number | null;
}
