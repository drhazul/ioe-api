import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { UsuarioEntity } from '../users/usuario.entity';

@Entity({ name: 'USUARIO_TOKEN', schema: 'dbo' })
export class UsuarioTokenEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  IDTOKEN: string; // bigint puede venir como string

  @Column({ type: 'int' })
  IDUSUARIO: number;

  @ManyToOne(() => UsuarioEntity, { nullable: false })
  @JoinColumn({ name: 'IDUSUARIO' })
  USUARIO: UsuarioEntity;

  @Column({ type: 'nvarchar', length: 80, unique: true })
  JTI: string;

  @Column({ type: 'nvarchar', length: 255 })
  REFRESH_TOKEN_HASH: string;

  @Column({ type: 'datetime2', precision: 0, default: () => 'SYSDATETIME()' })
  ISSUED_AT: Date;

  @Column({ type: 'datetime2', precision: 0 })
  EXPIRES_AT: Date;

  @Column({ type: 'datetime2', precision: 0, nullable: true })
  REVOKED_AT: Date | null;

  @Column({ type: 'nvarchar', length: 64, nullable: true })
  IP: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  USER_AGENT: string | null;
}
