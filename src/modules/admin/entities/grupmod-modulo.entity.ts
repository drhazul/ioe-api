import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'GRUPMOD_MODULO', schema: 'dbo' })
export class GrupmodModuloEntity {
  @PrimaryColumn({ type: 'int' })
  IDGRUP_MODULO: number;

  @PrimaryColumn({ type: 'int' })
  IDMODULO: number;
}
