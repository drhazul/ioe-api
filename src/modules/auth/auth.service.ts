import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Repository, IsNull } from 'typeorm';
import { UsersService } from '../users/users.service';
import { UsuarioTokenEntity } from './usuario-token.entity';

type JwtPayload = {
  sub: number;
  username: string;
  roleId: number;
  nivel: number;
  suc: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(UsuarioTokenEntity)
    private readonly tokenRepo: Repository<UsuarioTokenEntity>,
  ) {}

  private refreshDays(): number {
    return Number(this.config.get('REFRESH_EXPIRES_DAYS') ?? 30);
  }

  private accessExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
  }

  private async issueAccessToken(user: {
    IDUSUARIO: number;
    USERNAME: string;
    IDROL: number;
    NIVEL: number;
    SUC: string | null;
  }) {
    const payload: JwtPayload = {
      sub: user.IDUSUARIO,
      username: user.USERNAME,
      roleId: user.IDROL,
      nivel: user.NIVEL,
      suc: user.SUC ?? null,
    };

    return this.jwt.signAsync(payload, { expiresIn: this.accessExpiresIn() as any });
  }

  private async issueRefreshToken(
    userId: number,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const refreshToken = randomUUID() + '.' + randomUUID();
    const refreshHash = await bcrypt.hash(refreshToken, 10);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.refreshDays() * 24 * 60 * 60 * 1000);

    await this.tokenRepo.save(
      this.tokenRepo.create({
        IDUSUARIO: userId,
        JTI: randomUUID(),
        REFRESH_TOKEN_HASH: refreshHash,
        ISSUED_AT: now,
        EXPIRES_AT: expiresAt,
        REVOKED_AT: null,
        IP: meta?.ip ?? null,
        USER_AGENT: meta?.userAgent ?? null,
      }),
    );

    return refreshToken;
  }

  async login(username: string, password: string, meta?: { ip?: string; userAgent?: string }) {
    const user = await this.usersService.findByUsername(username);
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    if (user.ESTATUS !== 'ACTIVO') {
      throw new ForbiddenException('Usuario inactivo');
    }

    const ok = await bcrypt.compare(password, user.PASSWORD_HASH);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const accessToken = await this.issueAccessToken({
      IDUSUARIO: user.IDUSUARIO,
      USERNAME: user.USERNAME,
      IDROL: user.IDROL,
      NIVEL: user.NIVEL,
      SUC: user.SUC ?? null,
    });

    const refreshToken = await this.issueRefreshToken(user.IDUSUARIO, meta);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessExpiresIn(),
      user: {
        IDUSUARIO: user.IDUSUARIO,
        USERNAME: user.USERNAME,
        MAIL: user.MAIL,
        ESTATUS: user.ESTATUS,
        NIVEL: user.NIVEL,
        IDROL: user.IDROL,
        IDDEPTO: user.IDDEPTO,
        IDPUESTO: user.IDPUESTO,
        SUC: user.SUC,
      },
    };
  }

  async refresh(refreshToken: string) {
    const now = new Date();

    // Solo tokens activos
    const candidates = await this.tokenRepo.find({
      where: { REVOKED_AT: IsNull() },
      order: { IDTOKEN: 'DESC' },
      take: 100,
      relations: { USUARIO: true },
    });

    for (const t of candidates) {
      if (!t.USUARIO) continue;
      if (t.EXPIRES_AT <= now) continue;

      const match = await bcrypt.compare(refreshToken, t.REFRESH_TOKEN_HASH);
      if (!match) continue;

      if (t.USUARIO.ESTATUS !== 'ACTIVO') {
        throw new ForbiddenException('Usuario inactivo');
      }

      // Rotación: revoca el usado
      t.REVOKED_AT = now;
      await this.tokenRepo.save(t);

      const accessToken = await this.issueAccessToken({
        IDUSUARIO: t.USUARIO.IDUSUARIO,
        USERNAME: t.USUARIO.USERNAME,
        IDROL: t.USUARIO.IDROL,
        NIVEL: t.USUARIO.NIVEL,
        SUC: t.USUARIO.SUC ?? null,
      });

      const newRefreshToken = await this.issueRefreshToken(t.USUARIO.IDUSUARIO);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: this.accessExpiresIn(),
      };
    }

    throw new UnauthorizedException('Refresh token inválido o expirado');
  }

  async logoutAll(userId: number) {
    const now = new Date();
    await this.tokenRepo
      .createQueryBuilder()
      .update()
      .set({ REVOKED_AT: now })
      .where('IDUSUARIO = :userId AND REVOKED_AT IS NULL', { userId })
      .execute();

    return { ok: true };
  }
}
