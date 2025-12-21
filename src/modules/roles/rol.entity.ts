import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ROL', schema: 'dbo' })
export class RolEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  IDROL: number;

  @Column({ type: 'nvarchar', length: 50, unique: true })
  CODIGO: string;

  @Column({ type: 'nvarchar', length: 100 })
  NOMBRE: string;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  DESCRIPCION: string | null;

  @Column({ type: 'bit', default: () => '1' })
  ACTIVO: boolean;

  @Column({ type: 'datetime2', precision: 0, default: () => 'SYSDATETIME()' })
  FCNR: Date;
}
