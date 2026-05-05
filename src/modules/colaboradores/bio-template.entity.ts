import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ColaboradorEntity } from './colaborador.entity';

@Entity({ name: 'BIO_TEMPLATES', schema: 'dbo' })
export class BioTemplateEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id: number | undefined;

  @Column({ type: 'int', name: 'colaborador_id' })
  colaboradorId: number | undefined;

  @ManyToOne(() => ColaboradorEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'colaborador_id' })
  colaborador: ColaboradorEntity | undefined;

  @Column({ type: 'varchar', length: 20, name: 'tipo' })
  tipo: string | undefined;

  @Column({ type: 'varbinary', length: 'MAX', name: 'template' })
  template: Buffer | undefined;

  @Column({
    type: 'datetime',
    name: 'fecha_actualizacion',
    default: () => 'GETDATE()',
  })
  fechaActualizacion: Date | undefined;
}
