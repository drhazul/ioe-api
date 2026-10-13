# Plan de corrección y cierre de integración Quadrum en producción

Fecha: 2026-10-12 (America/Mexico_City). Estado: base fiscal y edición de cuenta desplegadas; FACTURA configurada para JICJ800630854/JIFT6203071N7. UAT de JICJ rechazada por PAC 702; pendiente solución del proveedor y aceptación fiscal. JIFJ4704238T5 en espera, bloqueado.
Seguimiento: [QUADRUM_PRODUCCION_SEGUIMIENTO.md](QUADRUM_PRODUCCION_SEGUIMIENTO.md).

## Objetivo y alcance autorizado

Preparar la emisión productiva de CFDI mediante Quadrum para los RFC comerciales de IOE, usando el CSD y la cuenta PAC del emisor correspondiente a cada documento. El cierre requiere configuración efectiva del proceso, autenticación por RFC, persistencia fiscal y UAT autorizada.

La solicitud inicial autorizó los documentos. El 2026-10-12 el titular autorizó iniciar corrección y pase a producción: incluye implementación, publicación y despliegue acotados. Posteriormente autorizó edición independiente de cuenta PAC, continuación del plan manteniendo JIFJ4704238T5 en espera, y timbrado único de DF01-20261012-VF-0040 tras revisar simulación. Ese intento fue rechazado por PAC 702; no autoriza reintentos ni documentos adicionales. No se autorizó DDL, reasignación de emisores ni rotación de credenciales por herramientas del agente.

Alcance técnico previsto: `src/modules/cfdi/`, validación de entorno y, si resulta necesario, la pantalla Quadrum de `ioe_app`. Preservar Facturify (`src/modules/facturacion/`), datos comerciales, CRM retirado y cambios locales ajenos. Correo tiene su propio [plan](FACTURA_QUADRUM_CORREO_PLAN.md) y [seguimiento](FACTURA_QUADRUM_CORREO_SEGUIMIENTO.md); no habilitarlo automáticamente con este trabajo.

## Evidencia de partida y vigencia

### Configuración local verificada en esta solicitud

- `ioe-api/.env` contiene exactamente una definición de `QUADRUM_ENDPOINT` y una de `QUADRUM_CANCELAR_ENDPOINT`; ambas coinciden con las URLs productivas de este plan.
- `CSD_CIFRADO_LLAVE` está presente. Hay configuración PAC global local; no se mostraron ni validaron sus valores con el proveedor en esta revisión.
- La incorporación local de variables supera el pendiente de captura local. No demuestra que el archivo privado del servidor ni su proceso API hayan cargado esas variables.

### Último preflight del servidor: diagnóstico previo del 2026-10-12

Destino: `192.168.10.234`, contenedor `ioe`, API en `/srv/api`, SQL Server `192.168.10.234:1433`, base `IOELOCAL`, esquema `dbo`.

- Los clientes efectivos usaban `https://devws.cfdiquadrum.com.mx/timbrar` y `/cancelar`; variables de endpoint ausentes del entorno del proceso API. No se volvió a inspeccionar el servidor al crear estos documentos.
- Código local y compilado desplegado bloqueaban explícitamente timbrado y cancelación cuando detectaban producción. No basta configurar las URLs.
- Tres CSD comerciales válidos, claves correspondientes, RFC coincidentes y contraseñas CSD/PAC descifrables; cuentas individuales distintas. Índices únicos de certificado y de RFC activo habilitados.
- `CSD_CIFRADO_LLAVE` presente en el proceso. Cuenta global PAC ausente en ese corte del servidor; archivo privado `/root/ioe_stack/deploy/ioe-api.env` con permisos `0600`.
- WSDL de producción de ambos servicios accesibles desde el servidor, HTTP 200 con definición WSDL. Observación puntual, no garantía de disponibilidad sostenida.
- XML definitivo en `CFDI_STORAGE_BASE_PATH=/ArchivosUsuarios/respaldoCFDI`, con bind mount. `CFDI_EVIDENCIA_DIR` ausente: evidencia en `/srv/api/cfdi-timbrados`, fuera del montaje observado.
- 67 pruebas unitarias locales aprobadas en cinco suites: cliente Quadrum, CSD, timbrado, emisión y cancelación. No constituyen UAT productiva.

| RFC | Evidencia del diagnóstico anterior | Condición para cierre |
|---|---|---|
| `JICJ800630854` | CSD válido; consulta productiva del servicio de cancelación responde `UUID does not exist` para UUID ficticio | Revalidar cuenta, habilitación de timbrado del RFC y UAT fiscal |
| `JIFT6203071N7` | CSD válido; misma respuesta de consulta autenticada | Revalidar cuenta, habilitación de timbrado del RFC y UAT fiscal |
| `JIFJ4704238T5` | CSD válido; consulta productiva devuelve `Usuario o Contrasena Invalida` | Corregir/verificar cuenta o habilitación con Quadrum y repetir consulta segura |
| `XIQB891116QE4` | CSD de pruebas activo, sin cuenta PAC propia | Excluir de producción; conservar sólo en entorno de pruebas |

Las consultas anteriores no consumieron timbres ni cancelaron documentos. Dos cuentas admitidas por consulta no prueban saldo, contrato ni autorización de timbrado para sus emisores. Timbrado consulta para `JIFJ4704238T5` devolvió un Fault interno del PAC; el rechazo explícito se obtuvo consultando el servicio de cancelación.

## Contrato de identidad y configuración

1. Emisión resuelve `FAC_SVR_SHAP.RfcEmisor`, con respaldo actual `DAT_SUC.RFC` cuando el dato falta. Validar formato y consistencia antes de reservar serie o contactar al PAC; rechazar valores como `SELECCIONAR` y conflictos de identidad. Revisar los datos afectados mediante SELECT antes de proponer una corrección.
2. Seleccionar exclusivamente `IOELOCAL.dbo.FACT_CSD` activo por RFC normalizado. La arquitectura actual usa una sola base: no cambia conexión por RFC. Si se requieren otras bases, presentar otro alcance antes de implementarlo.
3. Comprobar vigencia, RFC del certificado, llave correspondiente, régimen/CP y descifrado. El RFC del certificado debe coincidir con el del documento, no sustituir silenciosamente una identidad distinta.
4. En producción, usuario y contraseña PAC deben provenir juntos del registro de ese RFC. Ausencia, par incompleto o descifrado fallido detienen la operación; no usar cuenta ni certificado global de respaldo. Mantener respaldo de pruebas únicamente dentro del camino de pruebas.
5. Aplicar identidad consistente también a consultas, PDF, acuses, cancelación, notas de crédito y complementos. Una consulta sólo por UUID debe resolver el documento y emisor autorizados; no depender de una cuenta global ni aceptar cambio arbitrario de RFC.
6. Revisión de caché: renovación y cambio de cuenta deben invalidar datos de ese RFC en los procesos que los utilizan. Una actualización directa en SQL no invalida la caché actual; evitarla como procedimiento operativo. Definir conducta de varios procesos antes de escalar.
7. Mantener JWT, acceso por sucursal y permisos administrativos de CSD. Verificar que auditoría, respuestas HTTP y logs no almacenen cuerpos con llaves, contraseñas o certificados privados.

| Variable | Configuración o criterio previsto | Estado |
|---|---|---|
| `QUADRUM_ENDPOINT` | `https://ws.cfdiquadrum.com.mx/timbrar` | Verificada local; carga productiva pendiente |
| `QUADRUM_CANCELAR_ENDPOINT` | `https://ws.cfdiquadrum.com.mx/cancelar` | Verificada local; carga productiva pendiente |
| `QUADRUM_TIMEOUT_MS` | Entero positivo; valor operativo explícito. Predeterminado actual: `60000` | Revisar y documentar decisión |
| `CSD_CIFRADO_LLAVE` | Secreto externo estable compatible con registros existentes | Presente local y en último preflight; revalidar sin mostrar |
| `QUADRUM_USUARIO` / `QUADRUM_CONTRASENA` | No sustituyen cuentas por RFC en producción | Configuración global local detectada; restringir su uso |
| `CFDI_STORAGE_BASE_PATH` | Ruta persistente del XML fiscal | Montaje confirmado en último preflight |
| `CFDI_EVIDENCIA_DIR` | Ruta persistente separada para evidencia | Configuración/montaje pendientes |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_SCHEMA` | Verificar destino exacto `192.168.10.234:1433`, `IOELOCAL`, `dbo` | Revalidar antes de ejecución |

Validar HTTPS, host y ruta permitidos y concordancia del ambiente de ambos endpoints antes de enviar credenciales. No usar detección por mera ausencia de la palabra `dev` como autorización productiva. No colocar `.wsdl` como destino de POST SOAP ni enviar secretos a hosts arbitrarios. Elegir la habilitación explícita de operaciones productivas durante implementación y documentarla; no hay una bandera nueva implementada por este plan.

## Secuencia de corrección

### QPROD-01 — Preflight actualizado

Releer fuente, versión desplegada y entorno efectivo; comparar configuración local, archivo privado del servidor y proceso API. Inventariar los RFC comerciales, documentos pendientes, CSD activos, índices y estado fiscal. Registrar sólo presencia/validación de secretos. No iniciar otro backend conectado a producción para hacer comprobaciones.

Salida: matriz actual de emisor, identidad, vigencia, cuenta propia y respuesta PAC, más destino/versiones/rutas de almacenamiento. No cerrar esta actividad con el corte histórico únicamente.

### QPROD-02 — Separar pruebas y operación real

Revisar `timbrado.service.ts`, `cancelacion.service.ts` y sus llamadores. Los bloqueos actuales están en funciones compartidas: retirarlos indiscriminadamente habilitaría rutas `/cfdi/prueba/*` contra producción. Separar autorización de operación real de las rutas sintéticas de pruebas; éstas deben continuar bloqueadas cuando el ambiente es producción.

Verificar recorrido de factura de venta, nota de crédito y REP; proteger cada operación fiscal y conservar simulación sin contacto PAC ni escritura SQL. El ambiente mostrado en la pantalla y mensajes de confirmación debe representar el entorno efectivo.

### QPROD-03 — Identidad y credenciales estrictas por RFC

Aplicar el contrato anterior a `csd.service.ts`, ambos clientes y servicios consumidores. Detener antes del PAC ante CSD inválido, RFC inconsistente, cuenta faltante o descifrado fallido. Revisar también los catch de cancelación que hoy permiten caer al CSD global. Definir invalidación de caché y evitar mezcla de usuario de un origen con contraseña de otro.

Para `JIFJ4704238T5`, el titular o administrador debe verificar con Quadrum la cuenta productiva y corregirla por el flujo seguro de configuración CSD. No pedir contraseñas por chat, guardarlas en documentos ni cambiar registros durante el diagnóstico. Repetir consulta autenticada tras la corrección.

### QPROD-04 — Diagnóstico PAC confiable por RFC

Adaptar diagnóstico para evaluar cada cuenta individual. Interpretar `error`, Fault e incidencias, además de HTTP/nodo de resultado. Clasificar red/TLS, timeout, autenticación rechazada, documento inexistente y respuesta no reconocida. `consultaResult` o HTTP 200 solos no son éxito de autenticación.

Usar sólo operaciones de consulta documentadas, un UUID ficticio o uno previamente autorizado y un control negativo con cuenta ficticia. No alterar contraseñas reales para generar controles negativos. No devolver SOAP sin censura ni material fiscal completo en diagnóstico.

### QPROD-05 — Persistencia y resultados inciertos

Configurar evidencia sobre almacenamiento persistente y probar permisos bajo el usuario real de la API. Conservar XML final, cadena y respuesta útil sin llaves/credenciales. Definir retención, respaldo y recuperación conforme a política operativa; no considerar el directorio interno del contenedor como respaldo.

Revisar reserva de folio, concurrencia, escritura XML y marcación SQL. Si PAC acepta y luego falla disco o SQL, mantener registro recuperable y bloquear reemisión automática. Ante timeout sin UUID conocido, consultar sólo por UUID no resuelve el incidente: definir recuperación con evidencia, XML/serie/folio y soporte del PAC antes de otro envío. No liberar ni reutilizar serie por resultado incierto.

Revisar que solicitud de cancelación pendiente no equivalga automáticamente a CFDI cancelado; reemisión exige estado fiscal confirmado y trazabilidad del anterior. Estos puntos son revisión de integridad previa a producción, no incidentes reproducidos en el diagnóstico.

### QPROD-06 — Verificación local

Ejecutar pruebas del módulo y compilación API. Agregar casos de producción permitida para documentos reales, rutas de prueba bloqueadas, selección de cada RFC, credenciales incompletas, fallo de descifrado sin respaldo, lectura de error con HTTP 200, recuperación incierta y fallos después de aceptación PAC. Usar dobles del PAC y bases de pruebas; ninguna suite debe emitir CFDI reales.

```powershell
npx --no-install jest src/modules/cfdi --runInBand
npm run build
```

Si se modifica Flutter, cumplir instrucciones del repositorio hijo, `flutter analyze`, pruebas pertinentes y hot reload/restart cuando exista sesión conectada; registrar limitación si no hay sesión. Confirmar visualmente emisor, ambiente y mensajes antes del UAT.

### QPROD-07 — Preparar y desplegar release autorizado

Preparar diff y versión con sólo cambios del plan; preservar modificaciones ajenas. No publicar el árbol local completo sin revisar su composición. Antes del despliegue, registrar commits, digest de imagen actual, montaje y configuración requerida; conservar imagen/configuración anterior mediante mecanismo privado seguro.

Validar nuevamente destino y cuentas. Aprovisionar variables productivas por canal seguro y cargar el entorno mediante procedimiento autorizado del contenedor. Un reinicio simple no garantiza recargar un archivo de env externo: verificar cómo lo consume el despliegue y si requiere recreación. No copiar ni adjuntar archivos de secretos como evidencia.

Tras despliegue, comprobar commit/digest activos, health, SQL destino, endpoints efectivos, almacenamiento y consultas por RFC desde el proceso/servidor desplegado. No activar standby ni modificar proxy/DNS por este plan. Health HTTP 200 no cierra validación fiscal.

No se prevé DDL. Si aparece una necesidad SQL, abrir plan exacto de cambio con preflight, reversa/respaldo, autorización expresa y postflight; no aprovechar este plan para migrar.

### QPROD-08 — UAT fiscal y cierre

Autorizar explícitamente documento y RFC antes de una emisión real. Hacer simulación previa. Para cada RFC comercial, validar factura auténtica necesaria para negocio, UUID, emisor/receptor, serie/folio, importes/impuestos, XML firmado/timbrado, PDF correspondiente y estado SQL. Revisar persistencia tras el ciclo autorizado del contenedor y ausencia de secretos en evidencia.

NC, REP y cancelación real requieren casos comerciales/documentos exactos y autorización propia; no cancelar una factura válida sólo para demostrar la integración. Si no existe caso autorizado, declarar pendiente ese flujo y limitar por escrito el alcance de activación. No declarar el módulo completo con sólo UAT de facturas.

Validar permisos, evitar duplicidad del mismo documento y comprobar que fallo de correo no altere resultado fiscal. Habilitación automática del correo sigue en su expediente independiente.

Salida: acta por RFC y flujo, documentos/UUID autorizados, evidencia privada referenciada, resultados y aceptación del titular. Consultas PAC y pruebas unitarias no sustituyen esta acta.

## Criterios de aceptación y bloqueo

- Configuración efectiva productiva explícita y validada, con rutas de prueba protegidas.
- Todos los RFC incluidos en activación pasan identidad CSD, cuenta propia y consulta autenticada. Cuenta rechazada o incompleta bloquea ese RFC; activación parcial requiere autorización y restricción efectiva.
- No existe fallback global para operaciones productivas ni sustitución silenciosa del emisor.
- Diagnóstico distingue autenticación de transporte y documento inexistente.
- XML/evidencia persistentes; recuperación incierta y posterior a aceptación PAC definida y comprobada con fallos simulados.
- Build/pruebas aprobados, release verificado y UAT fiscal aceptada para el alcance activado.

## Reversa operativa

Detener nuevas operaciones fiscales de Quadrum mediante el mecanismo definido durante implementación y conservar consulta/recuperación autorizadas. Restaurar imagen/configuración anterior sólo según procedimiento de despliegue aprobado y compatible con datos existentes. Mantener la clave de cifrado estable.

Revertir software no elimina CFDI emitidos ante SAT. No restaurar la base ni borrar XML/UUID para deshacer una emisión; cualquier cancelación es operación fiscal separada. Un CFDI o resultado incierto surgido durante release obliga a reconciliar antes de reintentar. No enviar un documento afectado por Facturify como salida automática.

## Fuentes verificables

- Fuente canónica: `src/modules/cfdi/{timbrado.service,csd.service,csd.repositorio,quadrum.client,quadrum-cancelacion.client,cancelacion.service,emision.service,venta.repositorio,venta.mapper,cfdi.controller}.ts`, `src/config/env.validation.ts` y `AGENTS.md`.
- Documentación oficial: [WS Timbrado](https://wiki.cfdiquadrum.com.mx/es/home/webservices/ws_timbrado), [WS Cancelación](https://wiki.cfdiquadrum.com.mx/home/webservices/ws_cancelacion), [método timbrar](https://wiki.cfdiquadrum.com.mx/home/webservices/ws_timbrado/metodo_timbrar).
- Preflight de lectura del 2026-10-12 y resultados de consultas del diagnóstico anterior de este chat. Obsidian conserva borrador resumido, no reemplaza fuente/runtime.


## Implementación del 2026-10-12 y operación

Se implementaron validación de destinos oficiales, cuenta propia sin fallback productivo, diagnóstico de consulta por RFC con interpretación de error, eliminación de caché productiva para cuentas, exclusión entre procesos por documento mediante `sp_getapplock`, conservación de reservas inciertas, bloqueo de reemisión con cancelación pendiente y tratamiento de fallos de persistencia después de aceptación PAC. NC/REP también conservan reservas ante resultado incierto. El guard de sucursal usa asignación `USR_MOD_SUC` del módulo o SUC del JWT como compatibilidad legacy; admin conserva acceso total. Auditoría censura material CSD y cuenta PAC.

La activación requiere estas tres variables nuevas, además de endpoints explícitos:

| Variable | Semántica |
|---|---|
| `QUADRUM_PRODUCCION_HABILITADA` | `true` habilita evaluar operaciones; defecto `false` |
| `QUADRUM_RFC_HABILITADOS` | Lista de RFC comerciales autorizados, separada por comas; vacío bloquea todos |
| `QUADRUM_FLUJOS_HABILITADOS` | Lista entre `FACTURA,NOTA_CREDITO,COMPLEMENTO_PAGO,CANCELACION`; vacío bloquea todos |

Una cuenta rechazada debe quedar fuera de la lista hasta corregirla y validar acceso. Sólo flujos aceptados/autorizados deben habilitarse. Las rutas `/cfdi/prueba/*` que timbran permanecen bloqueadas aunque las variables habiliten operación real. La simulación no consume timbres. Antes de reservar folio se verifica acceso PAC de su RFC.

El pase usa `deploy/quadrum/Dockerfile`: compila API desde snapshot de Git sin secretos y toma como base la imagen conjunta desplegada, conservando exactamente Flutter/Nginx. No incorpora cambios locales de la App. Variables y evidencia se provisionan separadamente en servidor; no se transfieren `.env` locales ni claves. Cargar configuración mediante recreación autorizada conservando puertos, restart policy y montaje existentes. Clave CSD y variables OAuth permanecen intactas.

Recuperación: localizar reserva y carpeta de evidencia; confirmar resultado con PAC por datos del documento antes de liberar nada. Si existe XML/UUID aceptado con persistencia pendiente, reconciliar ese documento con plan SQL exacto autorizado; no emitir otro ni aplicar reparación genérica. Histórico de reservas abiertas se revisa separadamente: este pase no las libera.


### Decisión productiva vigente tras autorización parcial

El 2026-10-12 el titular autorizó activar sólo JICJ800630854 y JIFT6203071N7 y bloquear JIFJ4704238T5. Se aplicó lista explícita de esos dos RFC y flujo FACTURA; otros flujos y certificados de pruebas permanecen bloqueados. La configuración y postflight quedaron en seguimiento. No se autoriza ni ejecuta una factura de UAT por esta mera activación: falta documento real concreto. Las referencias anteriores a decisión pendiente son históricas y quedan supersedidas por esta autorización.

### Continuación y límite fiscal vigente

Titular posteriormente eligió y autorizó una emisión de DF01-20261012-VF-0040 después de simulación; PAC rechazó con 702, sin UUID. Esto supersede ausencia de documento UAT del párrafo histórico anterior, pero no cierra aceptación. No se reenviará automáticamente. Acta en [QUADRUM_PRODUCCION_UAT.md](QUADRUM_PRODUCCION_UAT.md); expediente del proveedor en [QUADRUM_SOPORTE_702.md](QUADRUM_SOPORTE_702.md).

Edición independiente de usuario/contraseña PAC quedó desplegada con API 900b625 y App 9a72b96. No habilita emisores ni valida permisos de timbrado al guardar. JIFJ4704238T5 permanece diferido hasta confirmación del titular y nueva consulta de su cuenta; otros avances técnicos continúan sin cambiar sus credenciales o bloqueo. JICJ800630854 tiene consulta admitida pero timbrado rechazado, condición externa que requiere aclaración del proveedor antes de nueva autorización. JIFT6203071N7 aún requiere documento y UAT propia.
