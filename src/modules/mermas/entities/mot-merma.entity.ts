import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'MOT_MERMA', schema: 'dbo' })
export class MotMermaEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  ID: number;

  @Column({ type: 'nvarchar', length: 200 })
  DESC: string;

  @Column({ type: 'int' })
  ID_CLAS: number;

  @Column({ type: 'bit' })
  REQUIERE_EVIDENCIA: boolean;
}
