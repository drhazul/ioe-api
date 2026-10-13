import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OperacionQuadrum =
  | 'FACTURA'
  | 'NOTA_CREDITO'
  | 'COMPLEMENTO_PAGO'
  | 'CANCELACION';

/** Sólo destinos oficiales; se valida antes de leer/enviar secretos. */
export function endpointQuadrum(
  config: ConfigService,
  servicio: 'timbrar' | 'cancelar',
): string {
  const timbrar =
    config.get<string>('QUADRUM_ENDPOINT') ||
    'https://devws.cfdiquadrum.com.mx/timbrar';
  const cancelar =
    config.get<string>('QUADRUM_CANCELAR_ENDPOINT') ||
    timbrar.replace(/\/timbrar$/, '/cancelar');
  const endpoints = [timbrar, cancelar];
  for (const [i, endpoint] of endpoints.entries()) {
    const ruta = i === 0 ? 'timbrar' : 'cancelar';
    if (
      !new RegExp(
        `^https://(?:devws|ws)\\.cfdiquadrum\\.com\\.mx/${ruta}$`,
      ).test(endpoint)
    ) {
      throw new ServiceUnavailableException(
        'Endpoint Quadrum inválido: requiere HTTPS y destino oficial del servicio.',
      );
    }
  }
  if (new URL(timbrar).hostname !== new URL(cancelar).hostname) {
    throw new ServiceUnavailableException(
      'Timbrado y cancelación Quadrum deben usar el mismo ambiente.',
    );
  }
  if (
    new URL(timbrar).hostname === 'ws.cfdiquadrum.com.mx' &&
    (!config.get('QUADRUM_ENDPOINT') ||
      !config.get('QUADRUM_CANCELAR_ENDPOINT'))
  ) {
    throw new ServiceUnavailableException(
      'Producción requiere ambos endpoints Quadrum explícitos.',
    );
  }
  return servicio === 'timbrar' ? timbrar : cancelar;
}

export function quadrumProduccion(config: ConfigService): boolean {
  return (
    new URL(endpointQuadrum(config, 'timbrar')).hostname ===
    'ws.cfdiquadrum.com.mx'
  );
}

export function assertOperacionQuadrum(
  config: ConfigService,
  rfc: string,
  operacion: OperacionQuadrum,
): void {
  if (!quadrumProduccion(config)) return;
  const habilitada =
    String(config.get('QUADRUM_PRODUCCION_HABILITADA') ?? '').toLowerCase() ===
    'true';
  const rfcs = String(config.get('QUADRUM_RFC_HABILITADOS') ?? '')
    .toUpperCase()
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const flujos = String(config.get('QUADRUM_FLUJOS_HABILITADOS') ?? '')
    .toUpperCase()
    .split(',')
    .map((x) => x.trim());
  if (
    !habilitada ||
    !rfcs.includes(rfc.trim().toUpperCase()) ||
    !flujos.includes(operacion)
  ) {
    throw new ForbiddenException(
      `Operación Quadrum ${operacion} no habilitada en producción para ese RFC.`,
    );
  }
}

export function validarRfcEmisor(rfc: string): string {
  const normalizado = String(rfc ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(normalizado)) {
    throw new ServiceUnavailableException(
      'RFC emisor inválido; revisar identidad del documento.',
    );
  }
  return normalizado;
}
