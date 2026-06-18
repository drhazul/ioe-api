import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'DAT_SUC_COLAB_ACCESO', schema: 'dbo' })
@Index('UX_DAT_SUC_COLAB_ACCESO', ['SUC_DESTINO', 'SUC_ORIGEN'], {
  unique: true,
})
export class SucColabAccesoEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'ID' })
  ID: number;

  @Column({ type: 'nvarchar', length: 10, name: 'SUC_DESTINO' })
  SUC_DESTINO: string;

  @Column({ type: 'nvarchar', length: 10, name: 'SUC_ORIGEN' })
  SUC_ORIGEN: string;

  @Column({ type: 'bit', default: () => '1', name: 'ACTIVO' })
  ACTIVO: boolean;

  @Column({
    type: 'nvarchar',
    length: 250,
    nullable: true,
    name: 'OBSERVACION',
  })
  OBSERVACION: string | null;

  @Column({
    type: 'datetime2',
    precision: 0,
    default: () => 'SYSDATETIME()',
    name: 'FCREG',
  })
  FCREG: Date;

  @Column({
    type: 'datetime2',
    precision: 0,
    nullable: true,
    name: 'FCMOD',
  })
  FCMOD: Date | null;
}
