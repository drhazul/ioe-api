import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ColaboradoresService } from './colaboradores.service';

@Injectable()
export class ColaboradoresTemplateSyncInterceptor implements NestInterceptor {
  constructor(private readonly service: ColaboradoresService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const method = String(req?.method ?? '').toUpperCase();
    const path = String(req?.originalUrl ?? req?.url ?? '').toLowerCase();
    const shouldSync =
      method === 'POST' &&
      path.includes('/colaboradores/adms/template-response');

    if (!shouldSync) return next.handle();

    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;

    return from(
      this.service.syncTemplateFromDevice(req?.body, {
        actorId: null,
        ip: ip ? String(ip) : null,
      }),
    ).pipe(
      switchMap((result) => {
        req.templateSyncResult = result;
        return next.handle();
      }),
    );
  }
}
