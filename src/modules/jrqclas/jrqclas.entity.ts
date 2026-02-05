import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'JRQ_CLAS', schema: 'dbo' })
export class JrqClasEntity {
  @PrimaryColumn({ type: 'float' })
  CLAS: number;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DCLAS: string | null;

  @Column({ type: 'float', nullable: true })
  SUBD: number | null;
}
