import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { GrupmodFrontModEntity } from './grupmod-front-mod.entity';


@Entity({ name: 'GRUPMOD_FRONT', schema: 'dbo' })
export class GrupmodFrontEntity {
  @PrimaryGeneratedColumn()
  IDGRUPMOD_FRONT: number;

  @Column({ type: 'nvarchar', length: 100 })
  NOMBRE: string;

  @Column({ type: 'bit' })
  ACTIVO: boolean;

  @Column({ type: 'datetime2', precision: 0 })
  FCNR: Date;

  @OneToMany(() => GrupmodFrontModEntity, (x: GrupmodFrontModEntity) => x.GRUPO)
  MODS: GrupmodFrontModEntity[];
}
