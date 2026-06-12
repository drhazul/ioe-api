# Inventarios API

## Merma (2026-06-12)

- `src/main.ts` configura body parser JSON/urlencoded a `1mb` para que `POST/PATCH /mermas/:docmer/detalle` acepte evidencia `EVI_M` dentro del limite funcional.
- El servicio conserva la validacion de data URL de imagen y maximo de 700000 caracteres para no guardar evidencias sobredimensionadas.

## Transferencias entre sucursales (2026-06-09)

- Nuevo modulo `TransferenciasModule` registrado en `AppModule`.
- Endpoints principales: `GET/POST/PATCH /transferencias`, detalle `POST/PATCH/DELETE /transferencias/:doc/detalle/:idpd`, acciones `enviar`, `liberar`, `rechazar`, `preparar`, `transito`, `recibir`, `contabilizar`.
- `GET /transferencias` soporta filtros separados `doc`, `usuario`, `from` y `to`; `GET /transferencias/notificaciones` devuelve documentos activos para seguimiento.
- `GET /transferencias/catalogos/articulos` soporta filtros `searchBy`, `depa`, `subd`, `clas`, `scla`, `scla2`, `sph`, `cyl` y `adic`.
- Para rol `invjef`, el listado fuerza `estatus=PENDIENTE` y la creacion de solicitudes queda bloqueada.
- Para roles `aux` y `enc_sucursal`, el listado y notificaciones se limitan a `BORRADOR`, `PREPARACION`, `TRANSITO` y `REVISANDO`; si el cliente envia uno de esos estatus, se respeta como filtro puntual.
- Script operativo: `sql/2026-06-09_transferencias_modulo_base.sql`.
- El flujo oficial es `BORRADOR -> PENDIENTE -> LIBERADA -> PREPARACION -> TRANSITO -> REVISANDO/INCIDENCIA -> CONTABILIZADO`.
- La salida a transito registra `DAT_MB51` con movimiento `121`; la contabilizacion registra destino `123` y diferencias con `122/124`.
