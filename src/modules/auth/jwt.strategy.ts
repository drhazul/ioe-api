import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';

export type JwtPayload = {
  idUsuario: any;
  sub: number;
  username: string;
  roleId: number;
  nivel: number;
  suc: string | null;
  mustChangePassword: boolean;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const user = await this.usersService.findAuthById(Number(payload.sub));
    if (!user || user.ESTATUS !== 'ACTIVO') {
      if (user) {
        const ip =
          (req.headers['x-forwarded-for'] as string) ||
          req.socket?.remoteAddress ||
          null;
        await this.audit.log({
          IDUSUARIO: user.IDUSUARIO,
          ACTION: 'JWT_DENIED_INACTIVO',
          MODULO: 'auth',
          ENTIDAD: 'USUARIO',
          ENTIDAD_ID: String(user.IDUSUARIO),
          SUC: user.SUC ?? payload.suc ?? null,
          IP: ip ? String(ip) : null,
          METADATA_JSON: JSON.stringify({
            username: user.USERNAME ?? payload.username,
            estatus: user.ESTATUS,
            reason: 'USUARIO_INACTIVO',
            url: req.originalUrl || req.url || null,
            userAgent: req.headers['user-agent'] ?? null,
          }),
        });
      }
      throw new ForbiddenException('Usuario inactivo');
    }

    return payload;
  }
}
