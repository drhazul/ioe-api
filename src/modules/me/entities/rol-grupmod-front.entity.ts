import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'ROL_GRUPMOD_FRONT', schema: 'dbo' })
export class RolGrupmodFrontEntity {
  @PrimaryColumn({ type: 'int' })
  IDROL: number;

  @PrimaryColumn({ type: 'int' })
  IDGRUPMOD_FRONT: number; // 0 = acceso total

  @Column({ type: 'bit' })
  ACTIVO: boolean;
}
