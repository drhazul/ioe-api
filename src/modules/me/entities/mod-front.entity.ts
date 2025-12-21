import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { GrupmodFrontModEntity } from './grupmod-front-mod.entity';


@Entity({ name: 'MOD_FRONT', schema: 'dbo' })
export class ModFrontEntity {
  @PrimaryGeneratedColumn()
  IDMOD_FRONT: number;

  @Column({ type: 'nvarchar', length: 50 })
  CODIGO: string;

  @Column({ type: 'nvarchar', length: 100 })
  NOMBRE: string;

  @Column({ type: 'bit' })
  ACTIVO: boolean;

  @OneToMany(() => GrupmodFrontModEntity, (x: GrupmodFrontModEntity) => x.MODULO)
  GRUPOS: GrupmodFrontModEntity[];
}
