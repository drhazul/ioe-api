import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'CLAS_MERMA', schema: 'dbo' })
export class ClasMermaEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  ID: number;

  @Column({ type: 'nvarchar', length: 150 })
  DESC: string;
}
