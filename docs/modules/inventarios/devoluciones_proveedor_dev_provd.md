# DEV_PROVD - Devoluciones a proveedor

## Alcance implementado

Módulo exclusivo del Jefe de Inventarios (`IDROL=2`, código `INVJEF`) para crear, reservar, autorizar, rechazar y cancelar devoluciones; adjuntar evidencias; consolidar documentos del mismo proveedor; registrar guía/RMA y salida física. Se excluyen nota de crédito, reposición, reembolso y conciliación contable.

## Arquitectura y reutilización

| Requisito | Estructura reutilizada | Decisión |
|---|---|---|
| Proveedores | `DAT_PROVD` | Reutilizar catálogo activo |
| Artículo, UPC, descripción, costo, jerarquía y stock | `DAT_ART` | Consultar datos maestros; no duplicarlos |
| Salida administrativa | `DAT_CMOV.CMOV=102` | Reutilizar movimiento `DEVOLUCION MERCANCIA` |
| Documento/movimiento | `DAT_CTR_DOC`, `DAT_MB51` | Registrar únicamente al autorizar |
| Auditoría | `AUDIT_LOG` | Registrar creación, reserva, autorización, rechazo, cancelación, consolidación y salida |
| Menú y acceso | `MOD_FRONT.CODIGO=DEV_PROVD`, grupo `JEFE INV` | Ya existía; no se creó otro módulo |
| Órdenes/recepciones relacionadas | `REC_CAB_PED`, `REC_CTRL_DOC_REC` | Guardar referencias opcionales; no duplicar recepción/OC |
| Adjuntos | Patrones de evidencia de Mermas/Transferencias | Nueva tabla de proceso porque no existe almacén genérico compatible |

## Incongruencias resueltas

1. El documento funcional mezcla “bloqueo en cuarentena” con “afectación de inventario solo al autorizar”. Se resolvió reservando `CTDA_BLOQ` sin modificar `DAT_ART.STOCK`; `trg_dat_art_dev_provd_reserva` impide globalmente que otros procesos consuman por debajo de la reserva. La autorización libera la reserva dentro de su transacción, registra `DAT_MB51` 102 negativo y descuenta stock una sola vez.
2. Los estados contables se excluyeron. `CONTABILIZADA`, nota de crédito, reembolso y conciliación no pertenecen a `DEV_PROVD`.
3. Las devoluciones consolidadas se normalizaron con `DEV_ENVIO_PROVD` y `DEV_ENVIO_DOC`; no se guardan listas separadas por comas.
4. SKU/UPC/descripción no se persisten en detalle: se proyectan desde `DAT_ART`.
5. `ESTATUS_DEV` no se creó. El estado forma parte de la cabecera y tiene un `CHECK` cerrado.

## Modelo lógico

```text
DAT_PROVD 1 ─── N DEV_DOC_PROVD 1 ─── N DEV_CTRL_PROVD N ─── 1 DEV_MOTIVO_PROVD
                         │                         │
                         │                         └── 1 ─── N DEV_EVIDENCIA_PROVD
                         │
                         N
                         │
                   DEV_ENVIO_DOC N ─── 1 DEV_ENVIO_PROVD

DEV_DOC_PROVD N ─── 1 DEV_TIPO_PROVD
DEV_CTRL_PROVD ──(ART + SUC)── DAT_ART
DEV_DOC_PROVD ──(autorización)── DAT_CTR_DOC / DAT_MB51 (CMOV 102)
```

## Estados

```text
BORRADOR ──solicitar/reservar──> PENDIENTE ──autorizar/CMOV 102──> AUTORIZADA
    │                                │                                  │
    └──cancelar──> CANCELADA         └──rechazar/liberar──> RECHAZADA   └──consolidar──> CONSOLIDADA ──salida──> EN_TRANSITO
```

## Estructuras creadas

- Tablas: `DEV_TIPO_PROVD`, `DEV_MOTIVO_PROVD`, `DEV_FOLIO_PROVD`, `DEV_DOC_PROVD`, `DEV_CTRL_PROVD`, `DEV_EVIDENCIA_PROVD`, `DEV_ENVIO_PROVD`, `DEV_ENVIO_DOC`.
- `DEV_FOLIO_PROVD` mantiene el consecutivo por sucursal con bloqueo transaccional; un rollback no consume folio.
- Trigger: `trg_dat_art_dev_provd_reserva`.
- SP: `sp_dev_provd_recalcular`, `sp_dev_provd_crear`, `sp_dev_provd_agregar_articulo`, `sp_dev_provd_solicitar`, `sp_dev_provd_autorizar`, `sp_dev_provd_rechazar`, `sp_dev_provd_cancelar`, `sp_dev_provd_consolidar_envio`, `sp_dev_provd_salida_fisica`.
- Script: `sql/2026-08-28_devoluciones_proveedor_dev_provd.sql`.

## API

Base: `/devoluciones-proveedor`.

- `GET /` lista paginada y filtros.
- `POST /` crea borrador; `GET/PATCH /:doc` consulta/edita cabecera.
- `POST /:doc/detalle` persiste el renglón; `PATCH/DELETE /:doc/detalle/:idpd` administran el detalle en borrador.
- `POST /:doc/evidencia` conserva una sola imagen de hasta 500 KB para todo el documento, reemplazando la anterior; la solicitud valida su existencia global.
- `POST /:doc/solicitar`, `/autorizar`, `/rechazar`, `/cancelar` ejecutan transiciones válidas.
- `GET /catalogos/tipos|motivos|proveedores|sucursales|articulos` expone catálogos reutilizados.
- Artículos acepta `searchBy=ART|UPC|DES|TODO` y filtros `depa/subd/clas/scla/scla2/sph/cyl/adic` para el selector operativo.
- `GET/POST /envios` consulta/consolida; `POST /envios/:envio/salida` registra salida física.

Todas las rutas requieren JWT y el rol de Jefe de Inventarios o administrador.

## Flutter

- Ruta: `/modulos/devoluciones-proveedor` y detalle `/:doc`.
- Lista con filtros por proveedor, sucursal y estado.
- Alta con justificación, tipo y referencias opcionales.
- Captura de artículos contra disponibilidad en línea, motivo cerrado y evidencia.
- Acciones de solicitud, autorización, rechazo y cancelación.
- Selección de autorizadas del mismo proveedor para consolidar envío; consulta de envíos y salida física.
- Manejo de carga, errores y paginación siguiendo Riverpod/Dio/go_router.

## Validación ejecutada

- Script idempotente aplicado en `IOELOCAL`.
- Prueba transaccional con rollback: crear, agregar artículo, reservar, autorizar y generar un movimiento 102; después del rollback quedaron cero documentos y cero movimientos de prueba.
- Prueba del trigger con rollback: un intento de reducir `DAT_ART.STOCK` por debajo de una reserva devolvió el error `59280`.
- Prueba de envío con rollback: una devolución autorizada se consolidó, pasó a `EN_TRANSITO` y después del rollback quedaron cero documentos y cero envíos de prueba.
- Backend: compilación Nest satisfactoria y 34 suites/57 pruebas aprobadas.
- Flutter: `flutter analyze` sin hallazgos. El runner de `flutter test` quedó bloqueado antes de emitir eventos por el estado compartido de procesos Dart/Flutter; no se terminaron procesos pertenecientes a otros hilos.
