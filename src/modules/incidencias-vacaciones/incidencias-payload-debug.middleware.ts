import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class IncidenciasPayloadDebugMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const method = String(req.method ?? '').toUpperCase();
    const shouldLogBody =
      method === 'POST' || method === 'PUT' || method === 'PATCH';
    const markerKey = '__incidenciasPayloadLogged__';
    const reqAny = req as Request & { [markerKey]?: boolean };

    if (shouldLogBody && reqAny[markerKey] !== true) {
      reqAny[markerKey] = true;
      // Debug temporal para rastrear 400 en payload de app Flutter.
      console.log('>>> PAYLOAD RECIBIDO:', req.body);
    }
    next();
  }
}
