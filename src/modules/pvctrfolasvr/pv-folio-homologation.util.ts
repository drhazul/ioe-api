import { BadRequestException } from '@nestjs/common';

export type OrigenAut = 'CA' | 'VF';

export const ESTADOS_OPERATIVOS = new Set([
  'PENDIENTE',
  'PAGADO',
  'MB51PROCES',
  'TRANSMITIR',
  'ANULADO',
]);

export function normalizeEstadoOperativo(value: unknown) {
  const estado = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!estado) return 'PENDIENTE';

  if (estado === 'EDITANDO' || estado === 'DEV PEND' || estado === 'PAGADO2') {
    return 'PENDIENTE';
  }

  if (estado.startsWith('PAGADO')) return 'PAGADO';
  if (estado.startsWith('MB51')) return 'MB51PROCES';
  if (estado.startsWith('TRANSMIT')) return 'TRANSMITIR';
  if (estado.startsWith('ANULA')) return 'ANULADO';

  if (!ESTADOS_OPERATIVOS.has(estado)) {
    throw new BadRequestException(
      `ESTA inválido: ${estado}. Valores permitidos: PENDIENTE, PAGADO, MB51PROCES, TRANSMITIR, ANULADO`,
    );
  }

  return estado;
}

export function inferOrigenAut(input: {
  aut?: unknown;
  origenAut?: unknown;
  fallback?: OrigenAut;
}) {
  const origen = String(input.origenAut ?? '')
    .trim()
    .toUpperCase();
  if (origen === 'CA' || origen === 'VF') return origen as OrigenAut;

  const aut = String(input.aut ?? '')
    .trim()
    .toUpperCase();
  if (aut === 'DCA' || aut === 'CA' || aut === 'DC' || aut === 'DG')
    return 'CA';
  if (aut === 'DVF' || aut === 'VF') return 'VF';

  if (aut === 'CP' || aut === 'PS') return input.fallback ?? 'CA';

  if (aut === 'AD' || aut === 'AP' || aut === 'CR') {
    return input.fallback ?? 'CA';
  }

  return input.fallback ?? 'CA';
}

export function normalizeAut(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}
