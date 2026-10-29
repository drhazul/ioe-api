# Seguimiento de corrección de cancelación Quadrum

ID_CAMBIO: `IOE-QUADRUM-CAN-20261029`. Fecha: 2026-10-29. Estado: retirada del bloqueo integrada localmente y validada; despliegue y UAT pendientes. No se declara cierre de controles adicionales por este hito.

Plan: [QUADRUM_CANCELACION_PLAN_20261029.md](QUADRUM_CANCELACION_PLAN_20261029.md). El titular descartó notas para soporte; se retiró archivo generado y sus enlaces vigentes.

## Corte verificado

- Backend vigente: CT105 `172.16.100.40`, `erp-api-tysuzjl0xcdbhfje49pbcqyg`, activo; front `standby-front-tysuzjl0xcdbhfje49pbcqyg`.
- Revisiones etiquetadas: API `e68699fc7687e5700fed954dca2e0cef5fda6eb6`; App `bf4acd085decbe1e086c52ac2b2c335ba91491dc`.
- 09:23:54 America/Mexico_City: entorno heredado del contenedor tiene bandera productiva true, tres RFC comerciales en lista y flujo FACTURA únicamente.
- Guard compilado devuelve HTTP 403 y mensaje exacto de captura para JICJ800630854, JIFT6203071N7 y JIFJ4704238T5. Validación llamada directamente, sin servicios de cancelación, SQL o PAC.
- Compilado llama a guard antes de consulta y cancelación. Causa para esos emisores: CANCELACION ausente de flujos; habilitar sólo flujo tampoco resolvería cualquier RFC fuera de lista.
- GET WSDL oficial desde CT105 HTTP 200; no hubo POST SOAP. Contrato verificado en plan.
- Contenedor histórico `.234 / ioe` detenido; se consultó sólo como antecedente y no se arrancó.
- Captura muestra total 999.98/motivo 03; no permite identificar folio, UUID, RFC o sesión exactos. No seleccionar CFDI por coincidencia de importe.

## Tablero

| ID | Actividad | Estado actual | Criterio de cierre |
|---|---|---|---|
| QCAN-01 | Diagnóstico y preflight | Completo para configuración; documento sin identificar | Mensaje interno reproducido; futuro caso requiere datos exactos |
| QCAN-02 | Retirar listas/flag de emisión como gate de cancelación | Completo local | assertCancelacionQuadrum verifica destino/RFC sin listas; emisión conserva política. Pruebas con tres emisores y RFC ficticio fuera de listas, con red/SQL simulados |
| QCAN-03 | Resultado y trazabilidad por etapa | Pendiente | IOE/PAC/SAT diferenciados; respuesta vacía o rechazo no declara éxito; evidencia sanitizada |
| QCAN-04 | Pruebas offline | Bloqueo y selección por RFC probados; controles adicionales por completar | Matriz de habilitación, identidad, CSD/cuenta y contratos sin red real; no equivale a UAT fiscal |
| QCAN-05 | Builds y commits coordinados | Build API aprobado; commits/release pendientes | Sin cambios Dart/HTTP por este hito; documentación API/App actualizada. Futuro release conjunto con cambios locales preservados |
| QCAN-06 | Release y postflight | Pendiente | Destino vigente confirmado, back/front juntos, reversa/health/hashes; sin cancelar al desplegar |
| QCAN-07 | UAT concreta | Pendiente de caso y autorización exactos | Una cancelación necesaria, acuse y resultado fiscal verificables; sin reintento automático |
| QCAN-08 | Notas para soporte | Retirado por titular | Causa interna confirmada; archivo y enlaces eliminados, sin envío a terceros |

## Registro de esta entrega

| Evidencia | Resultado | Límite |
|---|---|---|
| Código local y compilado productivo | Excepción ForbiddenException de IOE antes de PAC | No demuestra otro rechazo posterior una vez retirado gate |
| Reproducción con tres RFC | Tres 403 idénticos | No se envió cancelación ni se usaron contraseñas PAC |
| WSDL GET | Contrato oficial accesible y campos registrados | No prueba autenticación ni cancelabilidad de un UUID |
| Archivos de plan y seguimiento | Preparados inicialmente; actualizados tras integración local | Nota Odoo retirada posteriormente por titular; ningún mensaje enviado |

## Reglas de actualización

Separar propuesto, implementado local, probado, desplegado y UAT. Registrar fecha, ambiente, API/App, resultado, evidencia segura y siguiente acción. No convertir referencias históricas de activación exclusiva FACTURA en requisito permanente de cancelación después de aplicar decisión nueva del titular.

Cambios comerciales o de datos del cliente ajenos quedan fuera. SQL estructural/datos para esta corrección: NINGUNO previsto. Cancelaciones reales requieren documento/motivo exactos y tratamiento de incertidumbre; nunca repetir para obtener logs faltantes.

## Integración local y refuerzo documental — 2026-10-29

Titular solicita comenzar corrección y descartar notas para soporte. `assertCancelacionQuadrum` valida destino oficial y RFC; no consulta variables de habilitación de emisión. `CancelacionService` usa helper específico. Función compartida delega CANCELACION y conserva política de FACTURA/NC/REP. Emisor documental productivo se normaliza/valida, sin respaldo de cuenta global ni cambio de permisos. No se tocó payload SOAP productivo para resolver el bloqueo.

Prueba integrada con cliente SOAP real y fetch simulado: tres emisores comerciales y RFC ficticio válido fuera de listas avanzan con bandera de emisión false, lista vacía y flujo FACTURA. Comprueba una sola petición cancelar por caso, cuenta propia en cada intercambio, lock por documento y no refacturación mientras respuesta final siga Vigente. Casos negativos: documento inexistente/de otro PAC, RFC vacío/inválido, CSD propio ausente y contraseña propia incompleta no envían solicitudes.

Por recordatorio del titular se consultaron Wiki/ejemplos oficiales y se releyeron WSDL de producción/demo HTTP 200 por GET. Pruebas contractuales adicionales cubren campos ordenados, namespaces, SOAPAction, certificados base64, motivo/sustitución, reintentar=false y códigos por UUID 201/202 frente a rechazos. Diferencia de campos/tipo de total en consulta SAT documentada en plan. No se ejecutaron POST SOAP reales ni se copiaron credenciales.

Validación final: `node node_modules/jest/bin/jest.js src/modules/cfdi --runInBand`: **23 suites / 265 pruebas PASS**. `node node_modules/@nestjs/cli/bin/nest.js build`: **PASS**. Comprobación de enlaces/diff documental realizada. Sin cambio Dart ni necesidad de hot reload por esta modificación de API; cambios Flutter ajenos preservados.

Documentación de API/App y control de cambios actualizados; nota Odoo generada en diagnóstico retirada con sus referencias. Sin commit, publicación, despliegue, SQL, cambios de entorno, timbrado o cancelación reales. Fuente actual es WORKTREE, no versión productiva. QCAN-03 y controles adicionales del plan (contraste contra XML original, estado desconocido, trazabilidad de incertidumbre/persistencia) conservan seguimiento independiente y no se presentan como resueltos.
