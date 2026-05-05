import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, tap } from 'rxjs';
import { Repository } from 'typeorm';
import { LogsAuditoriaEntity } from './logs-auditoria.entity';

@Injectable()
export class SucursalesLoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(LogsAuditoriaEntity)
    private readonly auditRepo: Repository<LogsAuditoriaEntity>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const method = String(req?.method ?? '').toUpperCase();
    const shouldLog = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    if (!shouldLog) return next.handle();

    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;

    const rawBody =
      req?.body && typeof req.body === 'object'
        ? { ...(req.body as Record<string, unknown>) }
        : null;

    const sanitizedBody = this.sanitize(rawBody);

    return next.handle().pipe(
      tap({
        next: (response) => {
          void this.auditRepo
            .save(
              this.auditRepo.create({
                adminId: Number(req?.user?.sub ?? 0) || null,
                accion: method,
                modulo: 'sucursales',
                ipOrigen: ip ? String(ip) : null,
                detalles: JSON.stringify({
                  ok: true,
                  path: String(req?.originalUrl ?? req?.url ?? ''),
                  body: sanitizedBody,
                  response: this.sanitize(response),
                }),
              }),
            )
            .catch(() => undefined);
        },
        error: (error) => {
          void this.auditRepo
            .save(
              this.auditRepo.create({
                adminId: Number(req?.user?.sub ?? 0) || null,
                accion: method,
                modulo: 'sucursales',
                ipOrigen: ip ? String(ip) : null,
                detalles: JSON.stringify({
                  ok: false,
                  path: String(req?.originalUrl ?? req?.url ?? ''),
                  body: sanitizedBody,
                  error: this.extractError(error),
                }),
              }),
            )
            .catch(() => undefined);
        },
      }),
    );
  }

  private sanitize(value: unknown) {
    if (value == null) return null;
    if (typeof value !== 'object') return value;

    try {
      const clone = JSON.parse(JSON.stringify(value)) as Record<
        string,
        unknown
      >;

      for (const key of [
        'password',
        'PASSWORD',
        'AUTH_PASSWORD',
        'token',
        'accessToken',
        'refreshToken',
        'CONTENT_BASE64',
      ]) {
        if (key in clone) clone[key] = '[REDACTED]';
      }
      return clone;
    } catch {
      return null;
    }
  }

  private extractError(error: unknown) {
    if (!error) return 'Error desconocido';
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      const asAny = error as Record<string, unknown>;
      if (typeof asAny.message === 'string') return asAny.message;
    }
    return String(error);
  }
}
