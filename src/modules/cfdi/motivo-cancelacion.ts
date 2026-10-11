/**
 * Motivos de cancelacion del SAT (catalogo c_MotivoCancelacion).
 *
 * La regla que mas se equivoca: el motivo 01 EXIGE el folio (UUID) del
 * comprobante que sustituye, y los otros tres NO deben llevarlo. Mandar el
 * folio con motivo 02 —o no mandarlo con el 01— es rechazo del SAT.
 */
export const MOTIVOS_CANCELACION = {
  '01': 'Comprobante emitido con errores con relacion',
  '02': 'Comprobante emitido con errores sin relacion',
  '03': 'No se llevo a cabo la operacion',
  '04': 'Operacion nominativa relacionada en la factura global',
} as const;

export type MotivoCancelacion = keyof typeof MOTIVOS_CANCELACION;

/** El 01 es el unico que sustituye a otro comprobante. */
export const MOTIVO_CON_SUSTITUCION: MotivoCancelacion = '01';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class MotivoCancelacionInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotivoCancelacionInvalidoError';
  }
}

export interface MotivoValidado {
  motivo: MotivoCancelacion;
  /** Solo viene con motivo 01. */
  folioSustitucion?: string;
}

export function validarMotivo(
  motivo: string,
  folioSustitucion?: string,
): MotivoValidado {
  const m = String(motivo ?? '').trim();
  if (!(m in MOTIVOS_CANCELACION)) {
    throw new MotivoCancelacionInvalidoError(
      `Motivo de cancelacion '${motivo}' invalido. Validos: ` +
        Object.entries(MOTIVOS_CANCELACION)
          .map(([k, v]) => `${k} (${v})`)
          .join(', '),
    );
  }
  const motivoOk = m as MotivoCancelacion;
  const folio = String(folioSustitucion ?? '').trim();

  if (motivoOk === MOTIVO_CON_SUSTITUCION) {
    if (!folio) {
      throw new MotivoCancelacionInvalidoError(
        'El motivo 01 exige folioSustitucion: el UUID del CFDI que sustituye al cancelado.',
      );
    }
    if (!UUID_RE.test(folio)) {
      throw new MotivoCancelacionInvalidoError(
        `folioSustitucion '${folio}' no tiene forma de UUID.`,
      );
    }
    return { motivo: motivoOk, folioSustitucion: folio.toUpperCase() };
  }

  if (folio) {
    throw new MotivoCancelacionInvalidoError(
      `El motivo ${motivoOk} no lleva folioSustitucion; solo el 01 sustituye a otro comprobante.`,
    );
  }
  return { motivo: motivoOk };
}
