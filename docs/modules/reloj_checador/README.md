# Reloj checador (API)

Navega a otros README/AGENTS solo cuando la tarea lo requiera.

Enlaces relacionados:
- README principal de la API: `README.md`
- AGENTS de este módulo: `docs/modules/reloj_checador/AGENTS.md`
- Otros módulos: `docs/modules/core_seguridad/README.md`, `docs/modules/base_modulos/README.md`

## Reloj Checador (Asistencia)

- Modulo backend:
- `src/modules/reloj-checador/reloj-checador.module.ts`
- `src/modules/reloj-checador/reloj-checador.controller.ts`
- `src/modules/reloj-checador/reloj-checador.service.ts`
- `src/modules/reloj-checador/dto/*`
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
- SQL versionado:
- `sql/reloj_checador/001_ATT_POLICY_create.sql`
- `sql/reloj_checador/002_ATT_TIME_LOG_create.sql`
- `sql/reloj_checador/003_ATT_BIOMETRIC_TEMPLATE_create.sql`
- `sql/reloj_checador/004_ATT_INCIDENCIA_create.sql`
- `sql/reloj_checador/005_ATT_DOCUMENTO_create.sql`
- `sql/reloj_checador/006_ATT_OVERRIDE_create.sql`
- `sql/reloj_checador/007_ATT_ALERTA_create.sql`
- `sql/reloj_checador/101_sp_att_policy_upsert.sql` .. `115_sp_att_override_list.sql`
- Estructura de tablas por submódulo:
- `sql/reloj_checador/README_TABLAS_SUBMODULOS.md`
- Comportamiento clave:
- `sp_att_timelog_create` valida secuencia ENTRADA/SALIDA_COMER/REGRESO_COMER/SALIDA, geocerca, ventanas y liveness.
- cuando corresponde, valida override vigente en `ATT_OVERRIDE`.
- inserta marcaje bloqueado (`ATT_TIME_LOG.LOCKED=1`) y genera alertas de overtime en `ATT_ALERTA`.
- Seguridad/alcance:
- employee: solo marcajes y consultas propias.
- manager/supervisor: consulta por SUC/DEPTO, aprobacion de incidencias y gestion de overrides.
- admin/rrhh: gestion completa, incluyendo correccion admin de timelog.
- admin/rrhh: visibilidad global de sucursales y colaboradores (sin restriccion por SUC fija del usuario).
- Auditoria:
- todas las operaciones criticas escriben en `AUDIT_LOG` (`MODULO='reloj_checador'`) con metadata JSON (url, method, body, before/after, reason segun aplique).

## Submódulos y tablas involucradas (resumen)
- Marcaje core: `ATT_POLICY`, `ATT_TIME_LOG`, `MARCAJES`, `ATT_BIOMETRIC_TEMPLATE`, `ATT_ALERTA`.
- Incidencias y evidencias: `ATT_INCIDENCIA`, `ATT_DOCUMENTO`, `ATT_OVERRIDE`.
- Sucursales/dispositivos: `SUCURSALES`, `ATT_ASISTENCIA_FOTO`, `COMANDOS_ADMS`.
- Colaboradores/biometría: `COLABORADORES`, `BIO_TEMPLATES`, `COLABORADORES_SUCURSALES`.
- Horarios/turnos: `HORARIOS`, `COLABORADORES_HORARIOS`, `TURNOS_CATALOGO`, `HORARIOS_CONFIRMACION`.
- Reporte y reglas de asistencia: `ATT_ASISTENCIA_ESTATUS`, `ATT_RULES`, `PERIODOS_CIERRE`.
- Incidencias-vacaciones: `ATT_PERMISOS_TIPOS`, `ATT_SOLICITUDES`, `ATT_VACACIONES_SALDOS`.
- Notificaciones/cumplimiento: `NOTIFICACIONES`, `CONTRATOS`, `HISTORICO_PUESTOS`, `ATT_NOM035_RESPUESTAS`.
- Auditoría: `LOGS_AUDITORIA`, `AUDIT_LOGS`.
- Nota runtime: `TURNOS_CATALOGO`, `HORARIOS_CONFIRMACION` y `AUDIT_LOGS` están documentadas en BD, pero hoy no tienen consumo operativo directo en endpoints activos.

