import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ESTATUS_MERMA', schema: 'dbo' })
export class EstatusMermaEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  ID: number;

  @Column({ type: 'nvarchar', length: 100 })
  DESC: string;
}
