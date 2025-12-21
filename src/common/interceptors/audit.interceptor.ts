import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const method = (req.method || '').toUpperCase();

    // Solo acciones que modifican
    const shouldLog = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    if (!shouldLog) return next.handle();

    const url = req.originalUrl || req.url || '';
    const user = req.user; // viene del JwtStrategy si está logueado

    const ip =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket?.remoteAddress ||
      null;

    // Sanitizar body (evitar passwords/tokens)
    const body = { ...(req.body ?? {}) };
    for (const k of ['password', 'PASSWORD', 'PASSWORD_HASH', 'refreshToken', 'accessToken']) {
      if (k in body) body[k] = '[REDACTED]';
    }

    return next.handle().pipe(
      tap((resBody) => {
        // intenta sacar un id del response
        const entidadId =
          resBody?.IDUSUARIO ??
          resBody?.IDROL ??
          resBody?.IDDEPTO ??
          resBody?.IDPUESTO ??
          resBody?.SUC ??
          resBody?.IDTOKEN ??
          resBody?.IDLOG ??
          null;

        this.audit.log({
          IDUSUARIO: user?.sub ?? null,
          ACTION: method,
          MODULO: this.moduleFromUrl(url),
          ENTIDAD: this.entityFromUrl(url),
          ENTIDAD_ID: entidadId ? String(entidadId) : null,
          SUC: user?.suc ?? null,
          IP: ip ? String(ip) : null,
          METADATA_JSON: JSON.stringify({
            url,
            method,
            body,
            // puedes agregar query/params si quieres
          }),
        });
      }),
    );
  }

  private moduleFromUrl(url: string) {
    // /dat-suc/xxx -> dat-suc
    const p = (url.split('?')[0] || '').split('/').filter(Boolean);
    return p[0] ?? null;
  }

  private entityFromUrl(url: string) {
    // Por ahora igual que módulo; luego podemos mapear rutas a entidades reales
    return this.moduleFromUrl(url);
  }
}
