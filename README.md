# IOE API

Backend NestJS + MSSQL que abastece a `ioe_app` para autenticación, catálogos, inventarios, control de cuentas y punto de venta.

> Abre otros README/AGENTS solo si la tarea lo requiere; navega por el índice de módulos.

## Planteamiento funcional
- Contratos HTTP estables para la app IOE.
- Seguridad JWT con refresh y control por módulo/sucursal.
- Procesos críticos en stored procedures para inventarios y PV.
- Punto de venta / Pago de Servicios (2026-04): la salida operativa de folios pagados utiliza `ESTA='CERRADO_PS'` (manteniendo lectura compatible para históricos en `TRANSMITIR`).
- Notas de documentación viva: este README se modifica solo por cambios de arquitectura, módulos o rutas principales; los ajustes funcionales se registran en los README/AGENTS del módulo correspondiente.

## Arquitectura
- NestJS + TypeORM (`mssql`).
- Capas por módulo en `src/modules/*`.
- SPs y scripts en `sql/`.

## Estructura del proyecto
- `src/app.module.ts`: registro de módulos.
- `src/modules/*`: características por dominio (auth, masterdata, inventarios, PV, PS, devoluciones, órdenes de trabajo, reloj-checador).
- `sql/`: scripts de base de datos y SPs.
- `test/`: pruebas.

## Documentación por módulos
- Base de módulos: `docs/modules/base_modulos/README.md` (instrucciones: `docs/modules/base_modulos/AGENTS.md`)
- Core y seguridad: `docs/modules/core_seguridad/README.md` (instrucciones: `docs/modules/core_seguridad/AGENTS.md`)
- Punto de venta: `docs/modules/punto_venta/README.md` (instrucciones: `docs/modules/punto_venta/AGENTS.md`)
- Ordenes de trabajo: `docs/modules/ordenes_trabajo/README.md` (instrucciones: `docs/modules/ordenes_trabajo/AGENTS.md`)
- Reloj checador: `docs/modules/reloj_checador/README.md` (instrucciones: `docs/modules/reloj_checador/AGENTS.md`)

## Tecnologias
- NestJS, TypeORM (MSSQL), RxJS.

## Ejecucion
- `npm run start:dev`
- `npm test`

## Pruebas obligatorias
- Ejecutar `npm test` antes de entregar cualquier cambio backend.
- Cuando se coordinen cambios con el frontend (`ioe_app`), correr también `flutter analyze` y `flutter test` en ese proyecto.

## Documentacion viva
- Mantén este índice y los README/AGENTS de módulo actualizados con cada cambio de contrato o proceso.
