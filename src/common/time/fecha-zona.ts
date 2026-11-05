export const ZONA_NEGOCIO_DEFAULT = 'America/Mexico_City';

export function fechaHoraEnZona(
  instante: Date,
  zona = ZONA_NEGOCIO_DEFAULT,
): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);

  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((x) => x.type === tipo)?.value ?? '';

  return `${parte('year')}-${parte('month')}-${parte('day')}T${parte('hour')}:${parte('minute')}:${parte('second')}`;
}

export function fechaEnZona(
  instante: Date,
  zona = ZONA_NEGOCIO_DEFAULT,
): string {
  return fechaHoraEnZona(instante, zona).slice(0, 10);
}
