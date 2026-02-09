import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'DAT_ALMACEN', schema: 'dbo' })
export class DatAlmacenEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  ALMACEN: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  DESCRIPCION: string | null;

  @Column({ type: 'bit', nullable: true })
  ACTIVO: boolean | null;

  @Column({ type: 'datetime', nullable: true })
  FCNR: Date | null;
}
