import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'USR_GRUPMOD_FRONT', schema: 'dbo' })
export class UsrGrupmodFrontEntity {
  @PrimaryColumn({ type: 'int' })
  IDUSUARIO: number;

  @PrimaryColumn({ type: 'int' })
  IDGRUPMOD_FRONT: number; // 0 = acceso total

  @Column({ type: 'bit' })
  ACTIVO: boolean;

  @Column({ type: 'datetime2', precision: 0 })
  FCNR: Date;
}
