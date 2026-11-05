# Créditos PS — integración inicial en IOEDESARROLLO

Estado al 2026-10-20: **estructura, configuración, cierre SQL, histórico y consumidor API/Flutter integrados en desarrollo**. [Contrato de aplicación y pruebas HTTP](../../docs/modules/punto_venta/CREDITOS_CONFIG_DESARROLLO.md). Sin despliegue productivo; UAT autenticada pendiente.

Destino autorizado: `172.16.100.40,1434 / IOEDESARROLLO`, servidor `dd7842d7ba7e`. Titular autorizó cambios de estructura/datos y vínculo de los 11 DAT_SUC a IOE BUSINESS (1), incluido `000`.

## Resultado persistente

- `PV_CTR_FOL_ASVR.FCNPGOCRED datetime2(3) NULL`.
- `DAT_SUC.IDEMPRESA`, `CRED_PAGO_PARCIAL bit NULL` y `CFG_VERSION rowversion`; FK comprobada a EMPRESA.
- Catálogo `DAT_CFG_DEF`, valores `EMPRESA_CFG`, auditoría `EMPRESA_CFG_AUDIT`, auditoría de fechas `PV_CRED_FECHA_AUDIT` y relación por NDOC `PV_CRED_ABONO_REL`.
- Primera regla `CRED_PERMITIR_PARCIALIDADES`: modo EMPRESA, valor 1, 11 sucursales vinculadas, overrides NULL. Conserva parcialidades por defecto.
- Configuración consultable/modificable por SP con versiones y auditoría. Modo SUCURSAL permite excepción 0/1/NULL; modo EMPRESA ignora overrides preservados. No se concede EXECUTE a public ni se añade un permiso HTTP implícito.
- Cierre PS obtiene configuración de sucursal origen del crédito, rechaza cruce de empresa, revalida deuda neta y aplica restricción de pago completo. Agrupa líneas por crédito y normaliza referencias alias sólo cuando son inequívocas.
- Cada abono nuevo genera relación NDOC. Pago que deja saldo cero fija FCNPGOCRED y auditoría sólo si campo es NULL. Una vez fincada, fecha permanece incluso tras devolución parcial/total o liquidación posterior; ésta registra su abono sin reemplazar fecha. Nuevos cierres usan reloj México único.
- **3,610 créditos históricos actualizados** con fecha original registrada en formas, sin conversión de zona. 10,388 grupos contables quedan pendientes/excluidos; no se inventan fechas para ellos. Hay 58 eventos parciales dentro del lote aceptado.

Los SP internos `sp_ps_creditos_preparar/confirmar` requieren transacción y sólo se integran al cierre económico `sp_ps_pago_finalize`, antes del COMMIT. Imprimir o pasar a CERRADO_PS no fija otra fecha. Estados pagados/cerrados/anulados rechazan una nueva finalización.

## Seguridad financiera y concurrencia

Cuenta CR verificada `101001002`, cargo 602 negativo y abono 601 positivo. Saldo por folio canónico/cliente/cuenta incluye movimientos de todas las sucursales; permisos de cobranza se mantienen fuera de este cálculo. Precisión exacta de cuatro decimales: residuo 0.0001 no se considera liquidación.

`sp_getapplock`, recurso `PS_CREDITOS_CONFIG_V1`, owner Transaction, serializa administración y cierres CR dentro de esta base. Locks `UPDLOCK/HOLDLOCK` sobre cabeceras y rangos contables protegen contra otros escritores. El lock global es conservador para esta primera fase; medir contención antes de producción. Se añadió índice de saldo `(IDFOL,CLIENT,CTA)`.

Las credenciales de conexión se leen en memoria del `.env` existente, pero todos los ejecutores fijan **Database=IOEDESARROLLO** y verifican servidor. Ningún ejecutor cambia `.env` ni inicia API, frontend, servicios o trabajos.

## Histórico: alcance, hash y reversa

El batch deriva de propuesta inicial, con mejoras verificadas: excluye orígenes legacy/no concretados, normaliza claves de comparación con UPPER sin renombrar folios persistidos, ordena empates, materializa whitelist e incluye preimagen de cabecera completa en hash. Esta normalización evita que una agrupación case-insensitive escoja mayúsculas/minúsculas distintas entre VALIDAR y APLICAR.

Aplicación exige servidor/base, política, whitelist exacta, conteo y SHA-256 renovados. Ledger conserva antes/después, fecha registrada, política REGISTRO, folio PS y batch. Si trigger legacy cambia otro campo, todo el lote se revierte; se verificó que el histórico sólo cambió el nuevo campo.

La política REGISTRO conserva literalmente la fecha existente del pago. No afirma que toda la historia use hora México; normalización temporal histórica sigue pendiente de evidencia por periodo. Los nuevos cierres sí usan México. Estado `C` de orígenes y pagos PS permanece fuera de esta carga conservadora.

Antes del lote se ensayó aplicación y reversa de un crédito con parcial previo. Hubo dos ensayos de piloto revertidos durante estabilización del hash; los intentos rechazados no escribieron fechas. Lote final: `C94B21D1-C1F6-4ABE-A9E9-F85AD2376488`, 3,610 filas y cero discrepancias de postflight.

**Los 34,457 movimientos contables conservaron conteo y SHA-256**, antes/después del histórico y después de pruebas:
`2929EEC711AB93CF78A0231ED1145000460616BD5C08986D316A7AD4AABED68E`.

Reversa por batch es herramienta técnica de recuperación de una migración errónea, con guardas de fecha, auditoría/abonos, saldo y nuevo hash/conteo; no forma parte del flujo de devoluciones. Regla definitiva del titular: fecha fincada queda permanente; se retira reconciliación automática para borrarla o sustituirla. No se añadió trigger financiero global. Fechas históricas existentes se conservan sin reprocesar lote.

## Archivos y ejecución

| Archivo | Uso |
|---|---|
| `01_esquema.sql` | DDL inicial con default VALIDAR y guarda exclusiva de desarrollo |
| `02_configuracion.sql` | Función de valor efectivo y SP de consulta/actualización versionada |
| `03_creditos_cierre.sql` | Helpers transaccionales de validación y confirmación |
| `04_sp_ps_pago_finalize.sql` | Definición completa derivada del SP vivo respaldado; mantiene contrato de cierre |
| `05_datos_iniciales.sql` | Mapeo autorizado de 11 sucursales, default e índice; no sobrescribe configuración posterior |
| `06_historico_dev.sql` | Reconstrucción VALIDAR/APLICAR con whitelist y preimagen |
| `07_revertir_historico_dev.sql` | Reversa histórica VALIDAR/APLICAR por batch |
| `instalar-dev.cjs` | Ejecutor fijado a desarrollo; default preflight, conserva esquema completo compatible |
| `aplicar-historico-dev.cjs` | Diagnóstico; con --apply ensaya piloto/reversa y carga sólo candidatos nuevos |
| `test-integracion.cjs` | Casos SQL reales con fixtures y rollback |
| `test-http-dev.cjs` | HTTP/SQL real aislado, JWT fixture, precheck QueryRunner y rollback; sin AppModule ni workers |
| `08_fecha_fija_dev.cjs` | Delta exclusivo de dos helpers: preflight por defecto; --apply con backup de definiciones y hashes/datos verificados |

Desde `ioe-api`:

```powershell
node sql/2026-10-20_creditos_dev/instalar-dev.cjs
node sql/2026-10-20_creditos_dev/aplicar-historico-dev.cjs
node sql/2026-10-20_creditos_dev/test-integracion.cjs
```

`--apply` sólo se usó con autorización vigente, backup verificado y destino confirmado. No ejecutar los batches de definición manualmente contra otra base. No usar esta carpeta como migración automática de producción: requiere una preparación separada del destino, versión de esquema y aprobación específica.

Backup anterior a cambios, COPY_ONLY/COMPRESSION/CHECKSUM y VERIFYONLY:
`/var/opt/mssql/data/IOEDESARROLLO_pre_creditos_20261020T210146Z.bak`.

Expediente completo fuera del repositorio hijo:
`C:/Users/DAVID/proyectos/proyecto_ioe/outputs/integracion_creditos_dev_20261020/`.
Incluye preflight, originales SP, backup, aplicación de esquema/datos, pilotos/reversa, lote, pruebas y postflight. Los JSON grandes del lote contienen referencias contables para revisión, no credenciales.

## Verificación y límites

- **21 pruebas SQL reales** aprobadas: casos anteriores más parcial con fecha previa y nueva liquidación que conserva fecha. Fixtures, trigger QA y movimientos de prueba revertidos. Ningún pago nuevo de prueba quedó persistido.
- `npm test -- --runInBand`: **60 suites / 312 pruebas aprobadas**, incluido consumidor API y XACT_ABORT. Son pruebas unitarias con mocks; sus mensajes de PAC no equivalen a timbrados reales.
- Consulta de configuración devuelve 11 reglas efectivas en permitir; seis FK nuevas habilitadas y confiables; comprobación de restricciones DAT_SUC/EMPRESA_CFG sin incidencias.
- Reaplicación `instalar-dev.cjs --apply` ensayada: esquema CONSERVAR, mismos hashes de SP, 3,610 fechas, huella financiera idéntica y auditorías sin duplicar. Evidencia `idempotencia.json`.
- Postflight productivo sólo de lectura: FCNPGOCRED y catálogo nuevos siguen ausentes en IOELOCAL; hash de SP productivo sigue `E1A3C085A02B90DC1A5C4781D3F72B319E9859489738125BF6D07CBE9C001971`. IOELOCAL ONLINE/FULL y desarrollo ONLINE/SIMPLE.

Consumidor integrado: endpoints ADMIN ROL 1, engrane/página Flutter, herencia versionada y precheck PS. Once casos de integración con rollback: ocho HTTP/precheck y tres de contabilidad real de Devoluciones. Baseline previo: 27 pruebas Flutter y análisis limpio. Fecha fija aplicada mediante delta de dos helpers: 3,610 fechas, 34,457 movimientos y sus hashes intactos; auditorías sin cambios persistidos. Pendiente runtime aislado con auth real y UAT. Sin commit, push ni despliegue; sin autorización productiva.
