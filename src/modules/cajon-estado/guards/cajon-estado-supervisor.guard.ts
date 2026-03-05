import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../../auth/jwt.strategy';
import { CajonEstadoSessionStore } from '../cajon-estado-session.store';
import { CajonEstadoAuthSession } from '../cajon-estado.types';

type RequestWithSession = Request & {
  headers: Record<string, string | string[] | undefined>;
  user?: JwtPayload;
  cajonEstadoSession?: CajonEstadoAuthSession;
};

@Injectable()
export class CajonEstadoSupervisorGuard implements CanActivate {
  constructor(private readonly sessionStore: CajonEstadoSessionStore) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithSession>();
    const headerValue = req.headers['x-cajon-estado-token'];
    const token = Array.isArray(headerValue)
      ? (headerValue[0] ?? '')
      : (headerValue ?? '');
    const authorizationToken = String(token).trim();

    if (!authorizationToken) {
      throw new ForbiddenException(
        'Se requiere autorizacion de supervisor para consultar estado de cajon.',
      );
    }

    const requestedByUserId = Number(req.user?.sub ?? 0) || 0;
    if (requestedByUserId <= 0) {
      throw new ForbiddenException('Usuario autenticado invalido.');
    }

    const session = this.sessionStore.validate(authorizationToken, {
      scope: 'CAJON_ESTADO',
      requestedByUserId,
    });
    if (!session) {
      throw new ForbiddenException(
        'La autorizacion de supervisor es invalida.',
      );
    }

    req.cajonEstadoSession = session;
    return true;
  }
}
