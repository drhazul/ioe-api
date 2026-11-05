# Activación productiva del contrato CDMX

Estado: completada y verificada el 5 de noviembre de 2026, CDMX. Autorización del titular: “continua hasta completar tienes autorizacion”. Incidente y arquitectura en [CONTRATO_FECHAS_CDMX.md](CONTRATO_FECHAS_CDMX.md).

## Resultado

CT105 y SQL IOELOCAL operan en zona CDMX; API y Flutter Web nuevos están saludables y publicados. La prevención global de escrituras está activa. SQL conserva imagen CU25, hostname dd7842d7ba7e, volumen sqlserver_cu25_alignment_data, puerto 127.0.0.1:1434 y redes bridge/ioe_ha con alias ioe-sql-standby. No se cambió hora absoluta ni se reconstruyó CT.

| Componente | Identidad desplegada |
|---|---|
| API, commit de construcción | b175c5203436015661ffd888544eac70339dbefb |
| App, commit de construcción | 98841e2167c53de158b70216f54265eea9a090ba |
| Imagen conjunta | ioe-allinone:production-b175c5203436-98841e2167c5 |
| Image ID | sha256:c02b7f730ed6bd67e2cd967956b8ca98e527d26fd466f1909f1e063cfb0a7cd4 |
| SHA256 de archivo transferido | bccbe6d1fdce4b1bbb4b15098df9a2d378138920b5bf90aab7bd0913a113699c |
| SHA256 main.dart.js público | a89af10bff18122977ea62ba25153bd2ac0b6dad072ca3294e131192a9590baf |

Se integraron historias locales/remotas de ambos repositorios sin descartar cambios; commits publicados. Fuente/documentación pendientes quedaron versionados, con entornos, respaldos y evidencia privada fuera de Git. Los commits posteriores de cierre documental no cambian binarios ni las dos identidades de construcción anteriores.

## Intervención y recuperación

- 2026-11-05 05:26:51 UTC: API/front y temporizadores IOE pausados; IOELOCAL sin solicitudes activas.
- Respaldo COPY_ONLY/CHECKSUM/COMPRESSION completado, RESTORE VERIFYONLY correcto. Archivo en volumen SQL: /var/opt/mssql/data/IOELOCAL_CDMX_COPYONLY_20261105T052723Z.bak. No se alteró cadena de log.
- Migración transaccional aplicada: 75 módulos y 89 defaults. Postflight de hashes/defaults correcto; preflight posterior confirma estados AFTER completos, sin deriva. No se ejecutaron instaladores históricos ni SP de negocio durante migración.
- CT cambió de Etc/UTC a America/Mexico_City. SQL se recreó con TZ explícita y misma imagen/datos/hostname; CURRENT_TIMEZONE_ID devuelve Central Standard Time (Mexico). Guardia de reloj pasó antes de arrancar API.
- 05:38:31 UTC: nueva API saludable y frontend iniciado; ambos quedaron saludables. Publicación pública verificada por /, /api/health, /api/health/db y hash exacto del paquete Flutter.
- Respaldo de logs y monitor de rol reanudados y verificados con Result=success; temporizadores activos. Monitor de rol tenía fallo previo por sort | head bajo pipefail; se sustituyó head por sed -n '1p', conservando consumo del flujo completo. Nombres de logs y sellos de backup siguen usando date -u; frecuencia cada cinco minutos/minuto conservada.
- CIFS fiscal continúa montado y archivo existente visible desde API nueva. Instancia FEDERADA/1433 continúa en su contenedor original. Un solo contenedor SQL usa activamente el volumen primario.

## Comprobación real de medianoche

Sonda temporal de solo lectura, con expiración explícita y sin otra instancia de Nest/jobs. Finalizó automáticamente con éxito a 06:02:12 UTC.

| Muestra | SQL comercial CDMX | API comercial CDMX | UTC |
|---|---|---|---|
| Primera | 04/nov 23:53:41.630 | 04/nov 23:53:41.591 | 05/nov 05:53:41 |
| Primera después de medianoche | 05/nov 00:00:12.047 | 05/nov 00:00:12.046 | 05/nov 06:00:12 |
| Última | 05/nov 00:01:57.147 | 05/nov 00:01:57.144 | 05/nov 06:01:57 |

34 muestras correctas verificaron reloj SQL, zona, sincronización UTC/API, función comercial y roundtrip del driver useUTC=false. Fecha comercial cambió al llegar medianoche CDMX; auditoría conserva instante UTC explícito.

## Datos y contrato HTTP

NC300007708 conserva reparación de 15 FCNC a 04/nov/2026 12:39:38.623. Se verificaron 31 hashes completos de 707/708 y hash de stock relacionado antes/después de DDL y después de recreación/publicación: intactos. Conteos de seis tablas comerciales también coincidieron al aplicar DDL. No hubo nueva contabilización ni ventas de prueba.

Pruebas HTTP autenticadas con token interno efímero sobre cuenta activa, sin crear login/sesión persistente ni publicar token:

- GET MB51 IDPD 14300007708: FCNC 2026-11-04T12:39:38.623; FCND 2026-11-04T18:39:38.623. Ninguna falsa Z en fechas comerciales.
- POST de consulta MB51: 15 filas; ejercitó guardia global de reloj. Genera solamente auditoría normal de consulta, con FCNR UTC verificado.
- Después de medianoche, filtro fechaContDesde/fechaContHasta=2026-11-04 conserva las 15 filas del documento.
- GET folio PS/PV DF01-20261031-CA-0001: FCN 2026-10-30T18:22:10.333 y FCNM 2026-10-30T18:23:02.763, iguales a SQL comercial. La clave histórica del folio permanece.
- Configuraciones experimentales de créditos/entidades fiscales responden 503 en producción. No se migró su DDL; Flutter release oculta sus acciones. Desarrollo sigue disponible en IOEDESARROLLO no productivo.

## Validación y límites

448 pruebas API en 68 suites, build API correcto; Flutter analyze limpio y 36 pruebas. Construcción conjunta realizada en este equipo, luego transferida y cargada en CT, sin compilar en producción. Se comprobó paquete frontend público por hash, no por una sesión visual de operador. No se emitieron CFDI, ventas, pagos o ajustes ficticios para probar; la validación operativa fue de lectura/autenticación, generación de calendario y medianoche real.

FCND histórico del documento conserva hora previa conforme al alcance de reparación aprobado; nueva serialización corrige su representación de día. FCNAJ/regla de cabecera de conteo no se modificó: definición funcional distinta de este incidente. Otros históricos requieren manifiesto propio; no repetir la conversión de las 15 filas reparadas.

## Reversa disponible

Respaldo fresco y configuración/preimagen DDL privada conservados en /var/private/ioe-cdmx/activation-20261105T0520Z, modo 0700/archivos privados 0600. El contenedor sqlserver-cu25-alignment-before-cdmx-20261105 queda detenido con restart=no; nunca arrancarlo mientras otro use ese volumen.

Para reversa, detener escritores/temporizadores; validar que no exista deriva posterior; recuperar coordinadamente imagen API/App, configuración CT/SQL y, si corresponde, DDL mediante migrate-business-clock.cjs --mode rollback con preimagen original. No recuperar una réplica sobre principal ni borrar volumen. La reversa de DDL no revierte por sí misma reparación histórica FCNC; esa operación tiene su script 03 separado y guardas de postimagen.

Evidencia privada local: outputs/activacion_cdmx_20261104, incluyendo backup_mantenimiento.json, ddl_aplicacion, ddl_postflight, sql_runtime_postflight.json, public_postflight.json, http_authenticated_postflight.json, http_midnight_filtered_postflight.json, clock-boundary-result.json, infrastructure-postflight.json y business_final_postflight.json. Contiene también checkpoints Git y hash del artefacto; no se incorpora a fuente ni frontend.

## Conocimiento contrastado

Se consultó Obsidian y se contrastó con AGENTS/README, fuente y runtime actual. Borrador actualizado, sin promoción: 90 Inbox/2026-11-04 - proyecto_ioe - MB51 NC300007708 y contrato horario CDMX.md. La atribución previa de UTC al proceso Node fue sustituida por evidencia de CDMX y useUTC=false. Parche mínimo versionado del monitor: deploy/coolify/primary-role-health-sort.patch; original privado conservado en ventana.
