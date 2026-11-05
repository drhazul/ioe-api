# Créditos: consumidor API y Flutter en desarrollo

Fecha: 2026-10-20. Integración local comprobada contra `172.16.100.40,1434/IOEDESARROLLO`. Requiere el [bundle SQL](../../../sql/2026-10-20_creditos_dev/README.md) ya instalado allí. Sin despliegue productivo ni cambio de `.env`.

## Configuración por empresa

Datos Maestros → Empresas → engrane → `/masterdata/empresas/:id/configuracion`. Lectura y escritura exclusivas de **ADMIN, ROL 1**, aplicadas en servicio API y consumidor Flutter. Pertenecer a una sucursal no concede administración de empresa.

| Método y ruta | Contrato |
|---|---|
| `GET /empresas/:id/configuracion/creditos` | `idempresa`, `credito` con MODO/permitir/version y definición de catálogo; `sucursales` con suc/descripcion/permitir/efectivo/version |
| `PATCH /empresas/:id/configuracion/creditos` | `{modo: "EMPRESA" o "SUCURSAL", permitir: boolean, version: string}` |
| `PATCH /empresas/:id/configuracion/creditos/sucursales/:suc` | `{permitir: boolean o null, version: string}` |

Versión = 16 caracteres hexadecimales, sin prefijo `0x`, obtenidos de última lectura. SQL `timestamp/rowversion` se convierte primero a `binary(8)` y después a hexadecimal; conversión directa a varchar produce bytes de texto. Actor deriva de JWT `sub:username`; payload no admite actor ni propiedades extra.

Modo EMPRESA aplica valor común. Modo SUCURSAL: `null` hereda; `false` exige total; `true` permite parcialidades. Cambiar modo conserva excepciones. Editar sucursales exige guardar primero cambios pendientes de empresa. Pantalla muestra valores efectivos persistidos y recarga después de guardar. Conflicto conserva borrador y solicita recargar.

HTTP: 401 sin JWT, 403 sin ROL 1, 400 payload inválido, 404 empresa inexistente, 409 versión desactualizada/sucursal ajena/modo incompatible, 503 bloqueo temporal. Empresa nueva sin regla recibe 409 y requiere alta controlada; consultar no crea valores silenciosamente. Los 11 DAT_SUC existentes, incluido 000, ya están asociados a empresa 1 por autorización del titular.

Otra función requiere definición/segmento en DAT_CFG_DEF, columna tipada en DAT_SUC, valor de empresa, procedimientos/versionado/auditoría y consumidor de segmento. No usar `masterdata-config.saveConfig()` como persistencia: ese contrato previo no guarda estos valores.

## Pago de Servicios

`GET /ps/folios/:idFol/creditos/contexto` conserva loadFolio y autorización vigente de sucursal del folio PS. Devuelve líneas CR, referencia canónica inequívoca, sucursal origen, regla efectiva, saldo neto y cantidad como texto de cuatro decimales. Es consulta auxiliar, no certificación de liquidación.

Editar PVTA CR consulta contexto y muestra saldo/regla. Si exige total, hay una sola línea del crédito y cantidad 1, propone saldo completo. Varias líneas: informa que agregado debe liquidarlo. Captura CR conserva cuatro decimales; AD/AP/DG/DC mantienen captura anterior.

Antes de sp_ps_procesar, API ejecuta sp_ps_creditos_preparar en QueryRunner propio y siempre revierte precheck, incluidas normalizaciones de alias. Si XACT_ABORT ya revirtió transacción, ignora únicamente EABORT/ENOTBEGUN de limpieza cuando existe error original; conserva mensaje y libera conexión. Rechazo impide procesar.

Cierre económico vuelve a validar configuración/saldo bajo locks y confirma movimientos, relación NDOC y FCNPGOCRED en mismo COMMIT. Cambio entre precheck y cierre se detecta allí. **Fecha se fija sólo con saldo exactamente cero y campo NULL; una vez fincada es permanente.** Devoluciones parciales/totales no la borran ni recalculan. Deuda posterior válida puede cobrarse conservando fecha original; otra liquidación registra abono/relación sin reemplazar fecha ni auditar un cambio inexistente. FCNPGOCRED refleja hecho histórico, no saldo vigente. Devolución sin pago PS previo no genera fecha.

## Verificación reproducible

Desde ioe-api:

```powershell
npm run build
npm test -- --runInBand
node sql/2026-10-20_creditos_dev/test-http-dev.cjs
```

Prueba de integración importa controllers/servicios necesarios y JwtAuthGuard/JwtStrategy reales. Tokens efímeros y lookup de usuario fixture: no credenciales de usuario ni UAT. No abre AppModule, scheduler, correo o PAC. SQL fijado a desarrollo con guarda servidor/base y transacciones revertidas. Once casos: ocho HTTP/prechecks previos y tres de métodos contables reales de PvDevolucionesService, para devolución parcial/total de crédito liquidado y devolución que salda crédito sin pago previo. Estos últimos ejercitan contabilidad y actualización de cabecera de devolución; no flujo completo de inventario/fiscal/UI. Evidencia: `outputs/integracion_creditos_dev_20261020/tests_http.json`. Postflight conserva configuración, 34,457 movimientos, 3,610 fechas y cero fixtures persistidos.

Baseline de consumidor: Flutter sin diagnósticos y **27 pruebas**, siete nuevas; backend build correcto y **60 suites / 312 pruebas**. Cambio posterior de fecha fija sólo modifica helpers SQL, ejecutor y pruebas/docs: se verificaron **21 pruebas SQL y 11 de integración** con rollback. Dos casos SQL nuevos comprueban abono parcial y nueva liquidación con fecha previa intacta. La comparación entre fecha datetime2(3) y formas datetime convierte explícitamente a datetime2(3), evitando diferencias de precisión de conversión implícita.

Delta aplicado sólo en IOEDESARROLLO: `node sql/2026-10-20_creditos_dev/08_fecha_fija_dev.cjs --apply`. Sin --apply sólo preflight. Whitelist de dos helpers, backup de definiciones, guarda de hashes antes de DDL y postflight; no DML comercial ni reprocesamiento histórico. Evidencia en `outputs/integracion_creditos_dev_20261020/fecha_fija/`. Devoluciones ya conserva campo; no se agregó trigger ni reconciliador automático.

Debug admite `--dart-define=API_BASE_URL_DEV=http://127.0.0.1:3002`; release conserva configuración anterior. Parámetro no levanta backend. **No iniciar API normal con .env actual para probar: apunta a IOELOCAL.** Preparar runtime aislado de desarrollo con auth real y trabajos externos deshabilitados.

Se arrancó Flutter en Chrome headless con ese destino aislado y se aplicó hot reload. Hot restart por MCP encontró error DWDS; restart desde CLI recuperó app y posterior hot reload pasó sin errores runtime. Puerto 3002 no tuvo API permanente: health fallido esperado; no prueba navegación autenticada. Servidor HTTP de integración se cerró al terminar.

## Pendientes

UAT con usuario real en runtime aislado: engrane, modos, herencia/excepciones, rechazo parcial, liquidación total, dos abonos, fecha/comprobantes y devoluciones con fecha conservada. **Retirada propuesta de reconciliar/borrar fecha tras devolución o reapertura**, por regla explícita del titular. Histórico legacy excluido y zona por periodo se revisan por separado. Migración productiva requiere destino y autorización propios; futuro pase incluye API y app coordinados. Sin commits, push ni despliegue de esta integración.
