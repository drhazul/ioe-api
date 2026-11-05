# Equivalencias contables IOE–Odoo — desarrollo

Fecha: 2026-10-23. Alcance de esta fase: preparar y crear estructura vacía de equivalencias en `IOEDESARROLLO`.

## Decisión de diseño

`DAT_CAT_CTAS.CTA` sigue siendo clave operativa de IOE. `DAT_CTRL_CTAS` y cierres existentes mantienen sus referencias actuales. La equivalencia contable vive en tablas nuevas, con compañía Odoo, entidad fiscal, sucursal opcional, evento, rol y signo. Así una misma cuenta operativa puede mapear a cuentas Odoo distintas por empresa, sucursal o tipo de movimiento sin reescribir historial.

La estructura comienza sin filas. No se crean cuentas Odoo, equivalencias pendientes, pólizas ni asientos. Las propuestas de cuenta siguen pendientes de revisión del contador y de validar entidad/vínculo sucursal.

## Tablas e integridad

- `dbo.INT_ODOO_CTA_MAP`: relación IOE–Odoo; estados `PENDIENTE`, `VALIDADA`, `INACTIVA`.
- `dbo.INT_ODOO_CTA_MAP_AUDIT`: destino para eventos de auditoría; API deberá escribir cada cambio en la misma transacción. No hay trigger de auditoría todavía.
- FKs a `ENTIDAD_FISCAL`, `DAT_CAT_CTAS.CTA` y `DAT_SUC.SUC`; FK de auditoría a mapeo.
- Índices únicos separan equivalencias generales (`SUC IS NULL`) y específicas por sucursal; índice de resolución por entorno, entidad, `CTA_IOE` y estado.
- SP, trigger, vista, job y permiso persistente nuevos: ninguno.

Un resolvedor futuro deberá aceptar sólo equivalencias `VALIDADA`, confirmar compañía/entidad y sucursal, y rechazar resultados inexistentes o ambiguos. No usar candidatos `PENDIENTE` para contabilizar.

## Preflight y aplicación

Desde `ioe-api`:

```powershell
node sql/2026-10-23_odoo_cuenta_map_dev/instalar-dev.cjs
node sql/2026-10-23_odoo_cuenta_map_dev/instalar-dev.cjs --apply
```

La primera orden es de solo lectura y exige servidor/base exactos, SQL `ONLINE`, acceso `MULTI_USER`, tipos y llaves esperados. `--apply` repite el preflight, exige permiso de respaldo, genera `COPY_ONLY` + `CHECKSUM`, ejecuta `RESTORE VERIFYONLY` y después aplica DDL transaccional. Si detecta esquema parcial o incompatible, aborta.

Si cliente pierde conexión después de crear el backup, confirmar su `VERIFYONLY` y reutilizarlo con `--apply --reuse-backup=YYYYMMDDHHMMSS`. El instalador repite preflight, valida el registro `COPY_ONLY/CHECKSUM`, vuelve a ejecutar `VERIFYONLY` y acepta sólo backup de esta migración con menos de cuatro horas.

Destino permitido: SQL `172.16.100.40,1434`, servidor `dd7842d7ba7e`, base `IOEDESARROLLO`. Credenciales se leen de `.env` y nunca se muestran. Evidencia y backup viven fuera de Git.

## Reversa

`02_reversa.sql` tiene guardas exactas y `@Aplicar=0`. Sólo elimina las dos tablas si ambas existen y están vacías. Para activar reversa se debe cambiar la bandera dentro de una copia revisada y ejecutar exclusivamente en el destino permitido. Si aparece cualquier fila, la reversa aborta para conservar equivalencias e historial.

## Resultado en desarrollo

- Preflight previo a DDL: `2026-10-23T23:14:59Z`; servidor/base correctos, esquema ausente; 3 entidades, 10 vínculos, 7 cuentas fuente y 34,457 movimientos.
- Respaldo: `/var/opt/mssql/data/IOEDESARROLLO_pre_odoo_cta_map_20261023231459.bak`; `COPY_ONLY`, `CHECKSUM` y `RESTORE VERIFYONLY` aprobados. La verificación final corrió a `2026-10-23T23:20:43Z`.
- Postflight: tablas presentes; firma completa validada; 2 PK, 4 FK, 9 CHECK, 5 defaults, 6 índices totales y cero triggers. Tablas vacías (0 mapeos, 0 auditorías); conteos operativos estables en 3/10/7/34,457.
- Evidencia privada fuera de Git: `outputs/odoo_cuenta_map_dev_20261023/preflight_20261023231459.json`, preflight final `preflight_20261023232004.json` y `postflight_20261023232043.json`. El cliente informó timeout durante espera; la consulta posterior confirmó estructura, cero filas y backup íntegro.
- No se modificó `DAT_CAT_CTAS`, `DAT_CTRL_CTAS`, Odoo Online, CT105, IOE producción, API ni Flutter. No hay crosswalk aprobado ni asiento creado.

## Validación pendiente

Antes de llenar equivalencias: validar las tres entidades y sus sucursales; validar cuentas, impuestos, diarios, caja/bancos y eventos con contador. Las diferencias de catálogo no autorizan cambiar `DAT_CAT_CTAS.CTA`. Odoo Online permanece en modo de prueba, sin escritura de cuentas ni asientos en esta fase.
