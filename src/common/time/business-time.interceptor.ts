import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map } from 'rxjs';
import { businessDateTime } from './fecha-negocio';

// Contratos confirmados. No inferir semántica por nombre global de columna.
const documentFields = ['FCN', 'FCND', 'FCNC', 'FCNM'];
export const BUSINESS_RESPONSE_CONTRACTS: Record<string, readonly string[]> = {
  ps: ['FCN', 'FCNM', 'fcn', 'fcnm'],
  conteos: ['FCNC', 'FCNAJ'],
  datcontctrl: ['FCNC', 'FCNAJ'],
  'dat-mb51': ['FCND', 'FCNC'],
  datmb51: ['FCND', 'FCNC'],
  pvctrfolasvr: documentFields,
  pvctrfolform: ['FCN', 'FCNM'],
  pvticketlog: ['UPDATED_AT'],
  refdetalle: ['FCND'],
  'pv/cotizaciones': [...documentFields, 'FCNS'],
  'pv/devoluciones': documentFields,
  pvctrords: [
    ...documentFields,
    'FCNS',
    'FCNMOD',
    'FCNAS',
    'FCNTD',
    'FCNRT',
    'FCNTE',
    'FCNEN',
  ],
  pvctrordsdet: ['FCN', 'FCNMOD'],
  'ordenes-trabajo': [...documentFields, 'FCNMOD', 'FCNAS', 'FCNTD', 'FCNRT'],
  transferencias: [...documentFields, 'FCN_CONT'],
  mermas: [...documentFields, 'FCNAUD'],
  sugeridos: [...documentFields, 'FCNP', 'fcnp', 'fcnc'],
  recepciones: [
    ...documentFields,
    'FCNP',
    'FCN_FISICA',
    'FCN_AUTORIZA',
    'fechaFisica',
    'fechaAutorizacion',
    'fechaModificacion',
  ],
  'devoluciones-proveedor': [
    ...documentFields,
    'FCN_SOLICITA',
    'FCN_AUTORIZA',
    'FCN_RECHAZA',
    'FCN_SALIDA',
  ],
  factclientshp: documentFields,
  'caja-general': ['FCN', 'FCND', 'FCNC'],
};

export function businessResponse(
  value: unknown,
  fields: readonly string[],
): unknown {
  if (Array.isArray(value))
    return value.map((row) => businessResponse(row, fields));
  if (
    !value ||
    typeof value !== 'object' ||
    value instanceof Date ||
    value instanceof StreamableFile ||
    Buffer.isBuffer(value)
  )
    return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      fields.some((field) => field.toLowerCase() === key.toLowerCase())
        ? businessDateTime(item)
        : businessResponse(item, fields),
    ]),
  );
}

@Injectable()
export class BusinessTimeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const path = String(req.path ?? req.url ?? '').replace(/^\/api\//, '/');
    const route = Object.keys(BUSINESS_RESPONSE_CONTRACTS).find(
      (key) =>
        path === `/${key}` ||
        path.startsWith(`/${key}/`) ||
        path.startsWith(`/${key}?`),
    );
    const fields = route ? BUSINESS_RESPONSE_CONTRACTS[route] : undefined;
    if (!fields) return next.handle();
    return next.handle().pipe(map((value) => businessResponse(value, fields)));
  }
}
