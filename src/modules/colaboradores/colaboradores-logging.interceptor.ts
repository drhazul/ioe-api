import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, tap } from 'rxjs';
import { Repository } from 'typeorm';
import { LogsAuditoriaEntity } from '../sucursales/logs-auditoria.entity';

@Injectable()
export class ColaboradoresLoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(LogsAuditoriaEntity)
    private readonly logsRepo: Repository<LogsAuditoriaEntity>,
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

    const path = String(req?.originalUrl ?? req?.url ?? '');
    const body = this.sanitize(req?.body);
    const adminId = Number(req?.user?.sub ?? 0) || null;

    return next.handle().pipe(
      tap({
        next: (response) => {
          void this.persist({
            adminId,
            accion: method,
            ip,
            payload: {
              ok: true,
              path,
              body,
              response: this.sanitize(response),
            },
          });
        },
        error: (error) => {
          void this.persist({
            adminId,
            accion: method,
            ip,
            payload: {
              ok: false,
              path,
              body,
              error: this.extractError(error),
            },
          });
        },
      }),
    );
  }

  private async persist(input: {
    adminId: number | null;
    accion: string;
    ip: string | null;
    payload: Record<string, unknown>;
  }) {
    try {
      await this.logsRepo.save(
        this.logsRepo.create({
          adminId: input.adminId,
          accion: input.accion,
          modulo: 'colaboradores',
          ipOrigen: input.ip,
          detalles: JSON.stringify(input.payload),
        }),
      );
    } catch {
      // no-op
    }
  }

  private sanitize(value: unknown) {
    if (value == null) return null;
    if (typeof value !== 'object') return value;

    try {
      const clone = JSON.parse(JSON.stringify(value)) as Record<
        string,
        unknown
      >;
      for (const key of ['template', 'templateBase64', 'fotoBase64']) {
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
      const obj = error as Record<string, unknown>;
      if (typeof obj.message === 'string' && obj.message.trim().length) {
        return obj.message.trim();
      }
    }
    return String(error);
  }
}
