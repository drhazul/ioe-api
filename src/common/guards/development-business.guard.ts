import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Desarrollo conserva su fuente sin activar DDL/funciones ajenas en IOELOCAL. */
export function developmentBusinessEnabled(
  config: Pick<ConfigService, 'get'>,
): boolean {
  return (
    config.get('DB_NAME') === 'IOEDESARROLLO' &&
    config.get('NODE_ENV') !== 'production'
  );
}

@Injectable()
export class DevelopmentBusinessGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(): boolean {
    if (!developmentBusinessEnabled(this.config)) {
      throw new ServiceUnavailableException(
        'Función disponible únicamente en desarrollo; requiere migración y activación propias.',
      );
    }
    return true;
  }
}
