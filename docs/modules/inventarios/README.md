# Inventarios API

## Merma (2026-06-12)

- `src/main.ts` configura body parser JSON/urlencoded a `1mb` para que `POST/PATCH /mermas/:docmer/detalle` acepte evidencia `EVI_M` dentro del limite funcional.
- El servicio conserva la validacion de data URL de imagen y maximo de 700000 caracteres para no guardar evidencias sobredimensionadas.

## Transferencias entre sucursales (2026-06-09)

- Nuevo modulo `TransferenciasModule` registrado en `AppModule`.
- Endpoints principales: `GET/POST/PATCH /transferencias`, detalle `POST/PATCH/DELETE /transferencias/:doc/detalle/:idpd`, acciones `enviar`, `liberar`, `rechazar`, `preparar`, `transito`, `recibir`, `contabilizar`.
- `GET /transferencias` soporta filtros separados `doc`, `usuario`, `from` y `to`; `GET /transferencias/notificaciones` devuelve documentos activos para seguimiento.
- Reportes `DAT_REP_TRAN`: `GET /transferencias/reportes` lista documentos de todos los estatus bajo filtro y `GET /transferencias/reportes/:doc` devuelve detalle de solo lectura; ambos son para jefe de inventarios/admin y exponen `hasIncidencia` por renglones con `ESTATUS_R=INCIDENCIA`.
- `GET /transferencias/catalogos/articulos` soporta filtros `searchBy`, `depa`, `subd`, `clas`, `scla`, `scla2`, `sph`, `cyl` y `adic`.
- `POST /transferencias/:doc/detalle/:idpd/evidencia` guarda evidencia fotografica en `TRAN_EVID`; solo aplica en `PREPARACION` y para la sucursal origen/surtidora.
- `POST /transferencias/:doc/transito` valida que todos los renglones activos tengan evidencia; la imagen recibida debe ser data URL de imagen, mayor a 500 bytes y maximo 500 KB.
- El catalogo de articulos consulta `DAT_ART`; para sucursal origen `DF02` usa el inventario almacenado como `DF01` en `DAT_ART`.
- Para rol `invjef`, el listado fuerza `estatus=PENDIENTE` y la creacion de solicitudes queda bloqueada.
- Para roles `aux` y `enc_sucursal`, el listado se limita a `BORRADOR`, `PREPARACION`, `TRANSITO` y `REVISANDO`; notificaciones agrega `LIBERADA` solo para la sucursal origen/surtidora (`SUC_SAL`) como mercancia por surtir y `TRANSITO` solo para la sucursal solicitante (`SUC_ENT`).
- En listado general, documentos `TRANSITO` solo son visibles para la sucursal solicitante (`SUC_ENT`); la sucursal origen deja de verlos una vez enviados a transito.
- En listado general, documentos `BORRADOR` solo son visibles para la sucursal solicitante (`SUC_ENT`).
- Script operativo: `sql/2026-06-09_transferencias_modulo_base.sql`.
- El flujo oficial es `BORRADOR -> PENDIENTE -> LIBERADA -> PREPARACION -> TRANSITO -> REVISANDO/INCIDENCIA -> CONTABILIZADO`.
- La salida a transito registra `DAT_MB51` con movimiento `121`; la contabilizacion registra destino `123` y diferencias con `122/124`.
