# Reloj checador (AGENTS API)

Navega a otros README/AGENTS solo cuando sea necesario.

Enlaces relacionados:
- AGENTS principal de la API: `AGENTS.md`
- README de este módulo: `docs/modules/reloj_checador/README.md`
- Otros AGENTS: `docs/modules/base_modulos/AGENTS.md`, `docs/modules/core_seguridad/AGENTS.md`

## Reloj Checador (asistencia) - implementado (2026-02)
- Modulo NestJS:
- `src/modules/reloj-checador/reloj-checador.module.ts`
- `src/modules/reloj-checador/reloj-checador.controller.ts`
- `src/modules/reloj-checador/reloj-checador.service.ts`
- `src/modules/reloj-checador/dto/*`
- registrado en `src/app.module.ts`.
- Endpoints:
- `GET /reloj-checador/context`
- `POST /reloj-checador/timelog`
- `GET /reloj-checador/timelogs`
- `PUT /reloj-checador/timelog/:id`
- `POST /reloj-checador/incidencias`
- `PUT /reloj-checador/incidencias/:id/status`
- `GET /reloj-checador/incidencias`
- `POST /reloj-checador/documentos`
- `GET /reloj-checador/documentos`
- `GET /reloj-checador/documentos/:id/download`
- `POST /reloj-checador/overrides`
- `GET /reloj-checador/overrides`
- `PUT /reloj-checador/overrides/:id/revoke`
- `GET /reloj-checador/policy`
- `POST /reloj-checador/policy`
- SQL versionado: carpeta `sql/reloj_checador/` con scripts `001..007` de tablas y `101..115` de SPs.
- Reglas core en `sp_att_timelog_create`:
- valida SUC/usuario/enum, secuencia diaria, geocerca, ventanas y liveness.
- lock de concurrencia evita doble marcaje.
- inserta `ATT_TIME_LOG` inmutable (`LOCKED=1`) y genera alertas de overtime (`ATT_ALERTA`).
- Auditoria:
- operaciones criticas insertan en `AUDIT_LOG` (`MODULO='reloj_checador'`) con metadata (`url`, `method`, `body` sin binarios, `before/after` cuando aplica).
- Correcciones admin:
- `sp_att_timelog_admin_update` guarda `before/after` + `reason` y registra `ACTION='ADMIN_UPDATE'`.
- Manejo de errores HTTP: reglas de secuencia/ventana/geocerca/liveness devuelven `409`; validaciones de entrada `400`; autorización `403`.

