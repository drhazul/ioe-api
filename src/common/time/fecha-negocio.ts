import { BadRequestException } from '@nestjs/common';
import { fechaHoraEnZona } from './fecha-zona';

/** SQL datetime comercial no es un instante: JSON nunca debe añadirle Z. */
export type BusinessDateTime = string & {
  readonly __businessDateTime: unique symbol;
};
export type UtcInstant = string & { readonly __utcInstant: unique symbol };
export const SQL_DRIVER_USE_UTC = false;

const pad = (value: number, width = 2) => String(value).padStart(width, '0');
const wallPattern =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?)?$/;

function parts(value: string): number[] {
  const m = wallPattern.exec(value);
  if (!m)
    throw new BadRequestException(
      'Fecha comercial inválida; usar ISO sin zona',
    );
  const p = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
    Number((m[7] ?? '').padEnd(3, '0').slice(0, 3)),
  ];
  const check = new Date(0);
  check.setUTCFullYear(p[0], p[1] - 1, p[2]);
  check.setUTCHours(p[3], p[4], p[5], p[6]);
  if (
    p[0] < 1753 ||
    check.getUTCFullYear() !== p[0] ||
    check.getUTCMonth() + 1 !== p[1] ||
    check.getUTCDate() !== p[2] ||
    check.getUTCHours() !== p[3] ||
    check.getUTCMinutes() !== p[4] ||
    check.getUTCSeconds() !== p[5]
  )
    throw new BadRequestException('Fecha comercial fuera de calendario');
  return p;
}

function wall(p: number[]): BusinessDateTime {
  return `${pad(p[0], 4)}-${pad(p[1])}-${pad(p[2])}T${pad(p[3])}:${pad(p[4])}:${pad(p[5])}.${pad(p[6], 3)}` as BusinessDateTime;
}

/** Solo Date hidratado por MSSQL useUTC=false, o texto SQL sin zona. */
export function businessDateTime(value: unknown): BusinessDateTime | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      throw new BadRequestException('Fecha inválida');
    return wall([
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds(),
    ]);
  }
  return wall(parts(String(value).trim()));
}

export function utcInstant(value: Date): UtcInstant {
  return value.toISOString() as UtcInstant;
}

/** Columna UTC sin zona leída por el driver legacy useUTC=false. */
export function utcSqlInstant(value: unknown): UtcInstant | null {
  const calendar = businessDateTime(value);
  return calendar == null ? null : utcInstant(new Date(`${calendar}Z`));
}

/** Conversión de un instante real usando IANA, nunca un offset fijo. */
export function businessFromInstant(value: Date): BusinessDateTime {
  if (!Number.isFinite(value.getTime()))
    throw new BadRequestException('Instante inválido');
  return businessDateTime(
    `${fechaHoraEnZona(value)}.${pad(value.getUTCMilliseconds(), 3)}`,
  )!;
}

/** Entrada al driver legacy: calendario local; un offset explícito sí es instante. */
export function businessSqlDate(value: string): Date {
  const text = value.trim();
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
    ? businessFromInstant(new Date(text))
    : businessDateTime(text)!;
  const p = parts(normalized);
  return new Date(p[0], p[1] - 1, p[2], p[3], p[4], p[5], p[6]);
}

/** Límites calendario, independientes de Date.parse('YYYY-MM-DD') en UTC. */
export function businessDayBound(value?: string, end = false): Date | null {
  if (!value) return null;
  const date = businessSqlDate(value);
  // DATETIME redondea .999 al día siguiente; último tick válido es .997.
  date.setHours(end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 997 : 0);
  return date;
}

export function businessFields<
  T extends Record<string, any>,
  K extends keyof T & string,
>(
  row: T,
  fields: readonly K[],
): Omit<T, K> & { [P in K]: BusinessDateTime | null } {
  const out = { ...row };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(row, field))
      out[field as keyof T] = businessDateTime(row[field]) as T[keyof T];
  }
  return out as Omit<T, K> & { [P in K]: BusinessDateTime | null };
}
