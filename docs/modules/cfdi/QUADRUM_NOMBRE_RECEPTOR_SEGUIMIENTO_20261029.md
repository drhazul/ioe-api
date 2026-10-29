# Seguimiento: nombre de receptor recortado en Quadrum

ID_CAMBIO: `IOE-QUADRUM-NOMBRE-20261029`. Corte: 2026-10-29, America/Mexico_City.
[Plan y evidencia](QUADRUM_NOMBRE_RECEPTOR_PLAN_20261029.md).

## Estado actual

**Corrección integrada y validada localmente. Sin commit, despliegue ni timbrado. El titular realizará el despliegue; UAT fiscal pendiente.**

| Paso | Estado | Evidencia / condición de salida |
|---|---|---|
| QN-01: identificar causa | COMPLETO | Cabecera y cliente conservan `ESPINOSA`; mapper compilado y XML enviado contienen `ESPINO`; PAC responde `CFDI40144` en ambos folios. SELECT contra `IOELOCAL` verificado. |
| QN-02: preservar nombres fiscales | COMPLETO LOCAL | Helper recibe RFC; sólo elimina formas societarias separadas para persona moral. Palabras completas, personas físicas y RFC no reconocibles se conservan; sin whitelist por apellido o emisor. |
| QN-03: regresión y preview | VALIDADO LOCAL | Mapper 57/57; suite CFDI 23/23 y 300/300; build, ESLint y Prettier PASS. Preview XML de ambos folios conserva nombre completo. Sin sello ni PAC; simulación firmada posterior al despliegue pendiente. |
| QN-04: release conjunto | A CARGO DEL TITULAR | Integrar historias local/remota/productiva; commits API/App, imagen y retorno, health/web y versiones verificadas. No se ejecutó despliegue desde este chat. |
| QN-05: aceptación fiscal | PENDIENTE | Autorización por documento, preflight fresco sin UUID/incertidumbre y un intento controlado; XML correcto y persistencia del UUID. |

## Casos delimitados

| Documento | Emisor | Cliente fiscal | Estado leído | Reserva |
|---|---|---|---|---|
| `DF05-20261023-VF-0018` | `JIFJ4704238T5` | `51665` | `ERROR`, `CFDI40144`, sin UUID | `JIFJ-03411`, `ERROR_EMISION` |
| `DF05-20261029-VF-0001` | `JIFJ4704238T5` | `51665` | `ERROR`, `CFDI40144`, sin UUID | `JIFJ-03451`, `ERROR_EMISION` |
| `DF05-20261027-VF-0005` | `JIFJ4704238T5` | Otro receptor | `TIMBRADO`, UUID persistido | `JIFJ-03453`; sólo control de lectura, no reenviar |

También se confirmó por lectura el control de otro emisor `DF01-20261026-VF-0040` timbrado. Estos controles no sustituyen UAT del arreglo futuro.

## Bitácora

- 2026-10-29: fuentes locales, contexto previo Obsidian y documentación oficial SAT contrastados con runtime activo CT105. Estado productivo actualizado por lectura: API `dc58aa47`, App `fa994cf9`, imagen conjunta `72741601…`. Las bases Git locales `e68699fc` / `bf4acd08` son anteriores; no usarlas como única referencia del próximo pase.
- Se consultaron dos folios fallidos y dos controles mediante repositorio limitado a SELECT. Se leyeron las últimas tres evidencias guardadas de cada reserva fallida y se reprodujo la función compilada sin arrancar Nest, workers o cron.
- Fase de diagnóstico: se crearon plan, seguimiento e índice de cambio, sin modificar fuente ejecutable, SQL, configuración, credenciales o infraestructura. No se ejecutó nueva emisión, consulta de cuenta ni reintento contra Quadrum.
- Integración posterior autorizada: `venta.mapper.ts` y `venta.mapper.spec.ts` corregidos. Pruebas nuevas reproducían 14 fallos antes del ajuste; después, mapper 57/57 y suite CFDI 23 suites/300 pruebas PASS. Build API, ESLint y Prettier focalizados PASS. Se conserva normalización previa de mayúsculas/espacios, acentos y puntuación; cambia selección de sufijo por RFC y separación obligatoria.
- Preview local compilado con lectura nueva de ambos folios: VF0018 tiene 2 conceptos, subtotal 232.76 y total 270.00; VF0001 tiene 5 conceptos, subtotal 190.94 y total 221.51. Nombre original y atributo XML íntegros; ambos permanecían sin UUID. Sin firma, sin datos reales de CSD en preview, sin reservas, SQL de escritura ni POST al PAC.
- Comandos de validación: `npm test -- --runInBand --runTestsByPath src/modules/cfdi/venta.mapper.spec.ts --silent`; `npm test -- --runInBand --testPathPatterns=modules/cfdi --silent`; `npm run build`; `npx --no-install prettier --check src/modules/cfdi/venta.mapper.ts src/modules/cfdi/venta.mapper.spec.ts`; `npx --no-install eslint src/modules/cfdi/venta.mapper.ts src/modules/cfdi/venta.mapper.spec.ts`.

## Pendientes y límites

1. Titular prepara y ejecuta release coordinado con inventario e historias actualizados. Cambios locales existentes de otros módulos permanecen intactos; sin commit automático en esta integración.
2. Verificar ambas versiones, health/web y simulación firmada después del pase. No mezclar estado de este incidente con el expediente independiente de cancelación.
3. Simulación firmada posterior debe preservar nombre completo. La constancia fiscal del receptor no fue aportada ni validada; solicitar cotejo únicamente si se necesita confirmar el dato oficial o aparece un rechazo después del arreglo.
4. Timbrado pendiente de autorización específica después de simulación y preflight. No borrar reservas o errores para aparentar solución.
5. No corregir el maestro ni la cabecera quitando letras del apellido. No cambiar credenciales, CSD, listas de RFC o sucursal para resolver este defecto.
