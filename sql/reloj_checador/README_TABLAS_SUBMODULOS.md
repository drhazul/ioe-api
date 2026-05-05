# Reloj Checador - Estructura de tablas por submódulo

Fuente base: scripts `001..133` de esta carpeta y consumo actual en módulos API (`reloj-checador`, `asistencia`, `colaboradores`, `horarios`, `incidencias-vacaciones`, `notificaciones`, `sucursales`).

## Matriz de tablas
| Tabla | Datos que guarda | Submódulo |
|---|---|---|
| `ATT_POLICY` | Configuración de asistencia por sucursal/departamento: zona horaria, tolerancias, geocerca, liveness, ventanas y límites de horas extra. | Política de marcaje |
| `ATT_TIME_LOG` | Marcajes oficiales: usuario, sucursal, tipo (`ENTRADA/SALIDA...`), fecha-hora, GPS, método de autenticación, notas, hash y bloqueo lógico. | Marcaje core |
| `MARCAJES` | Marcajes enriquecidos/inteligentes: `punch_time`, terminal, fotos, modo de verificación, GPS `GEOGRAPHY`, vínculo a `ATT_TIME_LOG`. | Marcaje inteligente / historial |
| `ATT_BIOMETRIC_TEMPLATE` | Plantillas biométricas históricas por usuario (`TEMPLATE`, `HASH`, activo). | Biometría (core) |
| `BIO_TEMPLATES` | Plantillas biométricas operativas por colaborador para enrolamiento/mantenimiento. | Colaboradores / biometría |
| `ATT_INCIDENCIA` | Incidencias de asistencia con rango de fechas, motivo, estatus y aprobador. | Incidencias base |
| `ATT_PERMISOS_TIPOS` | Catálogo de tipos de permiso (goce de sueldo, justifica asistencia). | Incidencias y vacaciones |
| `ATT_SOLICITUDES` | Solicitudes de permisos/vacaciones con rango, motivo, evidencia y estatus. | Incidencias y vacaciones |
| `ATT_VACACIONES_SALDOS` | Saldos anuales de vacaciones por colaborador (`dias_totales`, `dias_usados`). | Incidencias y vacaciones |
| `ATT_DOCUMENTO` | Documentos binarios asociados a incidencias/usuarios (archivo, MIME, tamaño, hash). | Evidencias documentales |
| `COLABORADORES_DOCUMENTOS` | Expediente documental de colaboradores (tipo doc, URL/archivo, metadatos de carga). | Expediente laboral |
| `ATT_OVERRIDE` | Excepciones autorizadas por admin/supervisor: tipo, motivo, vigencia y autorizado por. | Overrides operativos |
| `ATT_ALERTA` | Alertas de asistencia (ej. overtime) con mensaje y metadata JSON. | Alertas y monitoreo |
| `NOTIFICACIONES` | Notificaciones a colaborador/PIN (tipo, título, mensaje, lectura, fechas). | Notificaciones |
| `COLABORADORES` | Maestro de personal: pin, nombre, sucursal base, privilegios, accesos app/GPS/QR, estado. | Gestión de colaboradores |
| `SUCURSALES` | Catálogo operativo de sucursales (código, nombre, empresa, estado). | Gestión de sucursales |
| `COLABORADORES_SUCURSALES` | Relación N:N colaborador-sucursal para multi-sucursal. | Asignación multi-sucursal |
| `ATT_RULES_HORARIOS` (antes `HORARIOS`) | Definicion de horarios (entrada, salida, tolerancia, almuerzo) + campos absorbidos de ATT_RULES: horas_jornada_minutos, horas_extra_minimo_minutos, horas_extra_requiere_autorizacion, activo, creado_en, actualizado_en. | Gestion de horarios / Motor de reglas |
| `COLABORADORES_HORARIOS` | Relación colaborador-horario con prioridad y activo. | Horarios rotativos |
| `TURNOS_CATALOGO` | Catálogo de turnos semanales LFT (entrada/comida/regreso/salida). | Turnos semanales |
| `HORARIOS_CONFIRMACION` | Confirmaciones semanales de horarios por sucursal/departamento y estatus. | Planeación semanal |
| `ATT_ASISTENCIA_ESTATUS` | Resumen diario calculado por colaborador (min trabajados, extras, retardos, salida temprana, estatus). Campo `pin` eliminado por sensibilidad de datos. | Reporte mensual / nomina |
| `ATT_RULES` | Reglas avanzadas de calculo de asistencia/horas extra por sucursal/horario. Solape parcial con ATT_RULES_HORARIOS (campos absorbidos). | Motor de reglas (legacy) |
| `ATT_ASISTENCIA_FOTO` | Evidencia fotográfica del marcaje (`id_timelog`, ruta, MIME, hash). | Evidencia de marcaje |
| `COMANDOS_ADMS` | Cola de comandos para dispositivos administrados (push operativo a terminales/kioscos). | Operación de dispositivos |
| `LOGS_AUDITORIA` | Bitácora de cambios administrativos con acción, módulo, IP y detalles JSON. | Auditoría funcional |
| `AUDIT_LOGS` | Auditoría extendida de entidades/periodos (antes/después, usuario, timestamps). | Auditoría de cierre |
| `PERIODOS_CIERRE` | Apertura/cierre de periodos de asistencia con motivos y responsables. | Cierres operativos |
| `CONTRATOS` | Contratos de colaborador (inicio, vencimiento, tipo, estatus). | Cumplimiento laboral |
| `HISTORICO_PUESTOS` | Catalogo de sueldos y puestos con relacion a ROL (idrol) e INCENTIVOS (id_incent). Campo `estado` para control de vigencia. | Cumplimiento laboral |
| `FESTIVOS` | Dias festivos (oficiales, empresariales, regionales) con tipo, recurrencia y alcance nacional. | Control de asistencia |
| `INCENTIVOS` | Catalogo de incentivos laborales (porcentaje o importe): capacitacion, apoyo, transporte, etc. | Nomina / compensaciones |
| `ATT_NOM035_RESPUESTAS` | Respuestas de cuestionario NOM-035 por colaborador y fecha. | NOM-035 / auto-servicio |

## Tablas compartidas (integración)
| Tabla | Uso en reloj checador |
|---|---|
| `USUARIO` | Resolver identidad/rol y seguridad de acciones. |
| `ROL` | Normalización de permisos (`admin`, `rrhh`, etc.). |
| `DAT_SUC` | Soporte de catálogo sucursal legado en consultas/mapeos. |

## Nota de compatibilidad
- Existen pares de tablas históricas y nuevas para biometría/auditoría (`ATT_BIOMETRIC_TEMPLATE` vs `BIO_TEMPLATES`, `LOGS_AUDITORIA` vs `AUDIT_LOGS`). Mantener ambos flujos mientras haya ambientes mixtos.

## Tablas sin consumo runtime directo actual
- `TURNOS_CATALOGO`: en código actual de `horarios` el catálogo se deriva de `HORARIOS` (endpoint `GET /horarios/turnos-catalogo` no consulta esta tabla).
- `HORARIOS_CONFIRMACION`: endpoint `POST /horarios/confirmacion` hoy responde `persisted: false` (sin escritura física).
- `AUDIT_LOGS`: no hay referencias directas en `src/modules/*`; auditoría activa usa `AUDIT_LOG` y `LOGS_AUDITORIA`.
- `HISTORICO_PUESTOS`: reestructurado (puesto -> idrol, +id_incent, +estado, -colaborador_id). COLABORADORES.id_sueldo referencia a HISTORICO_PUESTOS.id.
