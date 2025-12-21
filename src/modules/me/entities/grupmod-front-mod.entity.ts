import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { GrupmodFrontEntity } from './grupmod-front.entity';
import { ModFrontEntity } from './mod-front.entity';

@Entity({ name: 'GRUPMOD_FRONT_MOD', schema: 'dbo' })
export class GrupmodFrontModEntity {
  @PrimaryColumn({ type: 'int' })
  IDGRUPMOD_FRONT: number;

  @PrimaryColumn({ type: 'int' })
  IDMOD_FRONT: number;

  @ManyToOne(() => GrupmodFrontEntity, (g) => g.MODS, { eager: false })
  @JoinColumn({ name: 'IDGRUPMOD_FRONT' })
  GRUPO: GrupmodFrontEntity;

  @ManyToOne(() => ModFrontEntity, (m) => m.GRUPOS, { eager: false })
  @JoinColumn({ name: 'IDMOD_FRONT' })
  MODULO: ModFrontEntity;
}
