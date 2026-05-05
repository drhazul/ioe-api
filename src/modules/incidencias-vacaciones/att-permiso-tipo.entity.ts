import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ATT_PERMISOS_TIPOS', schema: 'dbo' })
export class AttPermisoTipoEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'varchar', length: 120, name: 'nombre' })
  nombre: string | undefined;

  @Column({ type: 'bit', name: 'goce_sueldo', default: () => '0' })
  goceSueldo: boolean | undefined;

  @Column({ type: 'bit', name: 'justifica_asistencia', default: () => '0' })
  justificaAsistencia: boolean | undefined;
}
