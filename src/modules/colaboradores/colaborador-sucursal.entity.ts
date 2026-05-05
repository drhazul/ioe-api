import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SucursalEntity } from '../sucursales/sucursal.entity';
import { ColaboradorEntity } from './colaborador.entity';

@Entity({ name: 'COLABORADORES_SUCURSALES', schema: 'dbo' })
export class ColaboradorSucursalEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'int', name: 'colaborador_id' })
  colaboradorId: number | undefined;

  @Column({ type: 'int', name: 'sucursal_id' })
  sucursalId: number | undefined;

  @ManyToOne(() => ColaboradorEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'colaborador_id' })
  colaborador: ColaboradorEntity | undefined;

  @ManyToOne(() => SucursalEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sucursal_id' })
  sucursal: SucursalEntity | undefined;
}

