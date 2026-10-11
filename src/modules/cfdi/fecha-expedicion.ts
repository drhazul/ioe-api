/**
 * Fecha del comprobante en la hora local del lugar de expedicion.
 *
 * Bug #3 del modulo C#: usaba `DateTime.Now` del servidor. En Node el
 * equivalente descuidado es `new Date().toISOString()`, que es UTC — seis
 * horas ADELANTE de la hora del centro de Mexico. El PAC rechaza un
 * comprobante con fecha futura, y uno con mas de 72 horas de antiguedad.
 *
 * El SAT pide `yyyy-MM-ddTHH:mm:ss` sin zona horaria, interpretado en la hora
 * del codigo postal de `LugarExpedicion`. Sin horario de verano desde 2022,
 * `America/Mexico_City` cubre a las sucursales del centro y sur.
 */
export const ZONA_EXPEDICION_DEFAULT = 'America/Mexico_City';

export function fechaCfdi(
  ahora: Date = new Date(),
  zona: string = ZONA_EXPEDICION_DEFAULT,
): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // `h23` evita que la medianoche salga como "24:00:00".
    hourCycle: 'h23',
  }).formatToParts(ahora);

  const p = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((x) => x.type === tipo)?.value ?? '';

  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}`;
}
