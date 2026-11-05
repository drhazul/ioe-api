import { fechaHoraEnZona, ZONA_NEGOCIO_DEFAULT } from '../../common/time/fecha-zona';

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
export const ZONA_EXPEDICION_DEFAULT = ZONA_NEGOCIO_DEFAULT;

export function fechaCfdi(
  ahora: Date = new Date(),
  zona: string = ZONA_EXPEDICION_DEFAULT,
): string {
  return fechaHoraEnZona(ahora, zona);
}
