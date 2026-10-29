# Plan de corrección: recorte del nombre del receptor en Quadrum

Fecha: 2026-10-29, America/Mexico_City. ID_CAMBIO: `IOE-QUADRUM-NOMBRE-20261029`.
Estado: corrección integrada y validada localmente; sin commit ni despliegue. El titular realizará el despliegue. UAT fiscal pendiente.
Seguimiento: [estado y evidencias](QUADRUM_NOMBRE_RECEPTOR_SEGUIMIENTO_20261029.md).

## Problema y causa confirmada

Los folios `DF05-20261023-VF-0018` y `DF05-20261029-VF-0001`, emisor `JIFJ4704238T5`, comparten el cliente fiscal `51665`. Ambos tienen `CFDI_STATUS=ERROR`, sin UUID, y respuesta PAC `CFDI40144`, referente al nombre del receptor.

La cabecera `FAC_SVR_SHAP.RazonSocialReceptor` y el registro `FACT_CLIENT_SHP.IDC=51665` contienen el apellido completo **ESPINOSA**. El XML efectivamente enviado termina en **ESPINO**. La diferencia no procede de la captura del cliente: se introduce en `normalizarNombreSat()`, dentro de [venta.mapper.ts](../../../src/modules/cfdi/venta.mapper.ts).

Su expresión regular elimina abreviaturas societarias al final del texto. El prefijo `[,.]?\s*` admite cero separadores; por tanto reconoce las letras finales `SA` dentro de `ESPINOSA` como si fueran el sufijo societario `S.A.`. También se reprodujo `ROSA → RO` y `CASA → CA` con la función compilada del backend activo, sin invocar servicios fiscales.

Quadrum sí recibió las solicitudes y devolvió incidencias fiscales estructuradas. El rechazo observado viene del PAC; la causa técnica que produce el nombre incorrecto es interna de IOE. No corresponde a bloqueo por sucursal, lista de emisores, credenciales ni CSD en estos intentos. El mismo emisor tiene `DF05-20261027-VF-0005` timbrado y persistido, verificado por SELECT y UUID. Que otros emisores funcionen no delimita el defecto: cualquier venta que pase por este normalizador puede verse afectada según el nombre del receptor.

## Origen y alcance de los datos

- `VentaRepositorio.folio()` resuelve este cliente por `FAC_SVR_SHAP.CLIEN → FACT_CLIENT_SHP.IDC`; no hubo necesidad de fallback para el caso.
- `mapearVenta()` prioriza el nombre fiscal de la cabecera; utiliza el del cliente cuando falta el de cabecera. Después aplica el normalizador defectuoso.
- C.P. y régimen del receptor proceden del cliente fiscal, con sus aliases existentes. No son la causa del código observado; no se modifican para intentar resolver un error de nombre.
- El único uso productivo de `normalizarNombreSat()` localizado en la fuente consultada es el nombre del receptor en `mapearVenta()`, utilizado por simulación y emisión de venta. Revisar otros constructores durante implementación; no afirmar que NC/REP ya fueron evaluados.
- No se propone editar nombres en SQL, borrar errores, liberar reservas ni generar un folio alternativo como solución.

## Evidencia y versiones

Destino confirmado con `DB_NAME()` y `@@SERVERNAME`: `IOELOCAL`, servidor SQL `dd7842d7ba7e`. Consulta ejecutada desde backend activo CT105 `172.16.100.40`, conexión heredada `ioe-sql-standby:1433`. No se asumió que el puerto público 1433 fuera esta base.

API y frontend activos comparten imagen `sha256:72741601b2ce84aebea44121600258cf4956ea02ad7f33a1371db50451f0aeb9`, etiquetas API `dc58aa476479cfe60028667ba5e4099f58652142` y App `fa994cf987d23465105586f0a0d601c163c4b75e`. Ambos contenedores reportaron saludables. Estas etiquetas son posteriores a las bases Git locales API `e68699fc` / App `bf4acd08`; antes de cualquier pase se deben integrar las historias vigentes sin descartar cambios.

SHA-256 del archivo compilado activo `dist/modules/cfdi/venta.mapper.js`: `0263b9e464b961b4b8d426d524684374d3c072c6c2de942e02a9afce0b4acfdb`.

La evidencia fiscal permanece en almacenamiento privado existente. No se copiaron XML completos, datos personales completos ni credenciales a este expediente.

| Folio | Reserva existente | Última carpeta examinada bajo `/ArchivosUsuarios/respaldoCFDI/evidencia/` | SHA-256 de `enviado.xml` |
|---|---|---|---|
| `DF05-20261023-VF-0018` | `JIFJ-03411`, `ERROR_EMISION`, sin UUID | `20261029T193517_JIFJ-03411` | `858128f607b37db55954ff074773d5e8aab79b52c9474dc657564dcd1176b17c` |
| `DF05-20261029-VF-0001` | `JIFJ-03451`, `ERROR_EMISION`, sin UUID | `20261029T193729_JIFJ-03451` | `0e1b7476a56790777b88c1eea86ed371db51c116cc9e3757a3f5c83c4be0a856` |

En las últimas tres carpetas examinadas de cada reserva, `enviado.xml` contiene el nombre recortado; `acuse.json` devuelve `exitoso=false`, UUID vacío e incidencia `CFDI40144`. Los nombres de carpetas contienen la hora UTC de creación; no confundirlos con la fecha comercial del folio.

## Contraste con documentación oficial

El SAT exige registrar nombre y apellidos de persona física tal como constan en su documentación fiscal, en mayúsculas y respetando sus caracteres. Eliminar letras de un apellido no cumple esa regla. Fuente consultada el 2026-10-29: [SAT: registro del nombre del receptor](https://sat.gob.mx/minisitio/Factura/documentos/Infografia_FacturaElectronica_NombreReceptor.pdf).

Referencia del proveedor: [Quadrum, WS Timbrado](https://wiki.cfdiquadrum.com.mx/home/webservices/ws_timbrado). La extracción web de esa página no entregó texto utilizable en esta revisión; no se le atribuye ninguna regla nueva de normalización. Para este incidente la evidencia determinante es el XML y el acuse real ya guardados, contrastados con fuente y función compilada. No se necesita alterar contrato SOAP, endpoint ni credenciales para corregir el recorte.

No se obtuvo la constancia fiscal del receptor ni se hizo validación nominativa contra SAT. Esto limita la confirmación de su nombre oficial, pero no la demostración del recorte introducido por IOE. Si, una vez preservado el nombre completo, subsiste otro rechazo fiscal, se tratará con su evidencia específica.

## Fases de corrección

### QN-01 — Diagnóstico y conservación de evidencia

Completada: SELECT acotado a los folios, cliente y controles; lectura de XML/acuse existentes; reproducción pura del normalizador desplegado. Sin POST a Quadrum, sin reservas nuevas, sin cambios SQL o de entorno.

### QN-02 — Corrección de fuente, integrada localmente

Autorización del titular: «comienza integracion de correcion el despliegue lo realizo yo». Se modificaron exclusivamente el mapper y sus pruebas dentro del código ejecutable de este alcance. `normalizarNombreSat(valor, rfcReceptor)` conserva el nombre completo salvo cuando el RFC tiene estructura de persona moral y existe una forma societaria final precedida por espacio o coma. Sin RFC reconocible conserva el texto. `mapearVenta()` entrega el RFC del receptor al helper; se mantienen prioridades de origen y normalización previa de mayúsculas/espacios.

No se cambió Dart, selección de credenciales/CSD, SQL, datos, endpoints ni listas. La integración de las historias productivas más recientes corresponde a la preparación del pase a cargo del titular; la corrección quedó en el worktree local existente, sin reemplazar su historia ni los cambios ajenos.

Criterios de la corrección:

1. Revisar la función en la historia productiva vigente antes de editar la copia local, preservando trabajo concurrente.
2. Preservar íntegro el nombre fiscal de personas físicas. No aplicar eliminación de formas societarias a su nombre. Si se incorpora clasificación por RFC, usar RFC validado y mantener tratamiento explícito de genéricos, sin inferir tipo de persona por el texto del nombre.
3. Para personas morales, admitir eliminación de una forma societaria únicamente como sufijo completo separado del nombre y conforme al dato fiscal; nunca reconocer `SA`, `AC`, `SC`, etc. dentro de una palabra. Ante información insuficiente, conservar el texto antes que recortarlo por conjetura.
4. Mantener acentos, `Ñ`, números y puntuación del nombre fiscal. Revisar el tratamiento actual de espacios con la regla SAT antes de ampliarlo. No introducir excepciones por cliente, apellido, sucursal o RFC emisor.
5. Mantener prioridades cabecera/cliente, selección de CSD/cuenta por emisor, importes y protecciones de emisión. No sustituir el nombre histórico por el maestro como atajo: en este caso ambos ya contienen el apellido completo.

Archivos implementados: `src/modules/cfdi/venta.mapper.ts` y `src/modules/cfdi/venta.mapper.spec.ts`. Único consumidor productivo directo localizado: `mapearVenta()`; actualizado en el mismo archivo.

### QN-03 — Regresión y simulación sin consumo fiscal

Validación local realizada: 14 regresiones fallaron con el comportamiento anterior. Después del ajuste, 57/57 pruebas del mapper y la suite CFDI completa (23 suites, 300 pruebas) aprobaron. `npm run build`, ESLint y Prettier focalizados aprobaron. Las llamadas fiscales de las suites se simulan; sus mensajes de timbrado/cancelación no corresponden a solicitudes reales.

Se consultaron nuevamente los dos folios por un repositorio limitado a SELECT, verificando servidor/base, y se procesaron los datos con el código compilado local corregido. El XML de preview conservó nombre íntegro en ambos casos. Resultados: VF0018, 2 conceptos, subtotal 232.76 y total 270.00; VF0001, 5 conceptos, subtotal 190.94 y total 221.51. Ambos seguían `ERROR`, sin UUID. El preview usa datos de emisor de prueba: no tiene sello, certificado, reserva nueva ni llamada PAC y no sustituye una simulación firmada contra el runtime que despliegue el titular.

Criterios cubiertos y validación posterior:

- Cubrir nombres de persona física terminados en `ESPINOSA`, `ROSA`, `CASA`, `ISAAC`; conservar todas sus letras. Usar datos sintéticos en pruebas versionadas.
- Cubrir razón social que termina en esas mismas letras sin separación; debe conservarse. Cubrir formas societarias separadas `S.A. DE C.V.`, `SA DE CV`, `S. DE R.L. DE C.V.` y variantes admitidas, sin cortar la palabra anterior.
- Cubrir nombre con acentos, `Ñ`, puntuación y genéricos; mantener comportamiento fiscal explícito de público en general.
- Probar el recorrido de `mapearVenta()`, no sólo la expresión regular: nombre de cabecera y fallback al nombre del cliente. Comparar atributos del XML antes del sello y confirmar nombre completo; importes, receptor, C.P., régimen y emisor deben permanecer iguales.
- Pruebas focalizadas, suite CFDI pertinente y build API aprobados sobre el worktree local. No equivalen a comprobación productiva.
- Preview local de ambos folios completado sin reservar ni timbrar. Después del despliegue, ejecutar simulación firmada en el runtime vigente y comprobar que permanece sin escrituras/llamadas PAC.

### QN-04 — Pase coordinado, separado de la autorización de timbrado

El titular realizará el despliegue; no se ejecuta en esta integración. Preparar inventario actualizado de Git local/remoto/productivo y conservar todos los cambios intencionales. Commit de fuente/documentación de ambos repositorios y despliegue API + frontend en el mismo pase, conforme a instrucciones del titular. Este alcance no publica cambios pendientes de otros módulos.

Registrar versiones e imagen de retorno; conservar variables, conexiones y almacenamiento fiscal. Verificar ambas versiones, health, acceso web y simulación del nombre completo en el runtime desplegado. Un cambio exclusivamente lógico del API no elimina la obligación de release conjunto. No se prevén nuevas variables, endpoints ni cambios de credenciales.

### QN-05 — UAT de los folios afectados

Antes de cada intento autorizado: refrescar SELECT de cabecera y reserva; confirmar que no existe UUID ni resultado incierto/persistencia pendiente; revisar simulación, receptor, total e identidad fiscal. Respetar control existente de reutilización de reserva y concurrencia; no borrar ni reiniciar estados manualmente.

Con autorización concreta de timbrado, efectuar un intento controlado por documento y revisar su XML/acuse. Detener reintentos ante incertidumbre. Confirmar UUID y persistencia consistentes y que el XML conserva el apellido completo. No retransmitir el CFDI de control ya timbrado ni emitir un documento adicional sólo para probar otro emisor.

## Base de datos, reversa y cierre

**Cambios previstos en tablas, columnas, defaults, PK, FK, CHECK, UNIQUE, índices, vistas, funciones, procedimientos, triggers, sinónimos, jobs y permisos: NINGUNO. DDL, DML de reparación y backfill: NINGUNO.** La UAT fiscal futura usará las escrituras operativas existentes sólo para los documentos autorizados.

Reversa técnica: regresar al release conjunto previo, conservando evidencia y datos fiscales. Esa reversa reinstalaría el defecto; no implica que convenga reintentar los casos afectados. Un CFDI emitido no se revierte con rollback de código y no se cancela automáticamente.

Cierre: corrección general sin excepciones de emisor/cliente, regresiones aprobadas, pase conjunto verificado y UAT autorizada con XML completo/UUID persistido. Si la emisión se pospone, cerrar por separado implementación técnica y mantener UAT pendiente. Datos originales del cliente no se consideran defectuosos por este hallazgo.
