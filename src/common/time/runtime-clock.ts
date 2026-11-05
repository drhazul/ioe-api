/** Cargar antes de AppModule: todos los drivers legacy comparten esta zona. */
export const BUSINESS_TIME_ZONE = 'America/Mexico_City';
if (process.env.TZ && process.env.TZ !== BUSINESS_TIME_ZONE) {
  throw new Error(
    `TZ debe ser ${BUSINESS_TIME_ZONE}; revisar configuración de despliegue`,
  );
}
process.env.TZ = BUSINESS_TIME_ZONE;
