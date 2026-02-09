import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'USR_MOD_SUC', schema: 'dbo' })
export class UsrModSucEntity {
  @PrimaryColumn({ type: 'nvarchar', length: 50 })
  MODULO: string;

  @PrimaryColumn({ type: 'nvarchar', length: 60 })
  USUARIO: string;

  @PrimaryColumn({ type: 'nvarchar', length: 10 })
  SUC: string;

  @Column({ type: 'bit', default: () => '1' })
  ACTIVO: boolean;

  @Column({ type: 'datetime2', precision: 0, default: () => 'SYSDATETIME()' })
  FCNR: Date;
}
