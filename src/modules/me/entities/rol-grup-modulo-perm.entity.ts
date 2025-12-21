import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'ROL_GRUP_MODULO_PERM', schema: 'dbo' })
export class RolGrupModuloPermEntity {
  @PrimaryColumn({ type: 'int' })
  IDROL: number;

  @PrimaryColumn({ type: 'int' })
  IDGRUP_MODULO: number; // 0 = acceso total

  @Column({ type: 'bit' })
  CAN_READ: boolean;

  @Column({ type: 'bit' })
  CAN_CREATE: boolean;

  @Column({ type: 'bit' })
  CAN_UPDATE: boolean;

  @Column({ type: 'bit' })
  CAN_DELETE: boolean;

  @Column({ type: 'bit' })
  ACTIVO: boolean;
}
