# Entidades fiscales y sucursales — desarrollo

Fecha: 2026-10-21. Estado: aplicado únicamente en `IOEDESARROLLO`; API/Flutter siguen sin commit ni despliegue.

## Alcance

Agrega un maestro fiscal separado de `dbo.EMPRESA` y relaciones con vigencia hacia `dbo.DAT_SUC`. Importa únicamente candidatos con forma de RFC de persona física encontrados en `DAT_SUC.RFC`; deja identidad y relación como `PENDIENTE`. No toma el nombre comercial como razón social ni valida RFC contra SAT. No actualiza tablas existentes, datos contables, CSD/KEY/PAC, ni publica asientos.

## Destino y guardas

- Servidor SQL: `172.16.100.40,1434`, nombre esperado `dd7842d7ba7e`.
- Base permitida: `IOEDESARROLLO`.
- No usar estos scripts en `IOELOCAL` ni Odoo.
- `instalar-dev.cjs` corre preflight de solo lectura por defecto. La opción `--apply` exige destino exacto, esquema ausente o compatible, permiso de respaldo, backup `COPY_ONLY` con `CHECKSUM`, `RESTORE VERIFYONLY` y evidencia en carpeta privada fuera de Git.
- El DDL es transaccional e idempotente para el esquema completo. Si detecta instalación parcial o definición distinta, aborta. La ejecución no inicia ni reinicia API, Flutter, SQL Server o Coolify.

## Cambios SQL

- Tablas: `ENTIDAD_FISCAL`, `ENTIDAD_FISCAL_SUCURSAL`, `ENTIDAD_FISCAL_AUDIT`.
- PK: `PK_ENTIDAD_FISCAL`, `PK_ENTIDAD_FISCAL_SUCURSAL`, `PK_ENTIDAD_FISCAL_AUDIT`.
- UQ: `UQ_ENTIDAD_FISCAL_RFC`.
- FK: `FK_ENTIDAD_FISCAL_SUCURSAL_ENTIDAD`, `FK_ENTIDAD_FISCAL_SUCURSAL_SUC`, `FK_ENTIDAD_FISCAL_AUDIT_ENTIDAD`, `FK_ENTIDAD_FISCAL_AUDIT_REL`.
- CHECK: formato RFC/CP/persona/estado/datos mínimos al validar; vigencia y JSON de auditoría.
- Índices: `IX_ENTIDAD_FISCAL_SUCURSAL_SUC_VIGENCIA`, `IX_ENTIDAD_FISCAL_SUCURSAL_ENTIDAD`, `UX_ENTIDAD_FISCAL_SUC_PENDIENTE`, `IX_ENTIDAD_FISCAL_AUDIT_ENTIDAD`.
- Vistas, funciones, procedimientos, triggers persistentes, jobs, sinónimos y permisos nuevos: ninguno.
- DML: candidatos marcados `PENDIENTE` y auditoría sin valores personales completos.

## Aplicar y revisar

Desde `ioe-api`:

```powershell
node sql/2026-10-21_entidades_fiscales_dev/instalar-dev.cjs
node sql/2026-10-21_entidades_fiscales_dev/instalar-dev.cjs --apply
```

La primera orden informa destino, esquema, conteos y permiso; no escribe en SQL. La segunda repite preflight, crea y verifica respaldo antes de DDL, luego registra postflight. Revisar `preflight.json`, `backup.json` y `aplicacion.json` en:

`C:/Users/DAVID/proyectos/proyecto_ioe/outputs/integracion_entidades_fiscales_dev_20261021/`

Los archivos son evidencia privada local; no agregarlos a Git. El postflight debe confirmar servidor/base, cantidades de sucursales/empresas/movimientos iguales al preflight y que todos los candidatos sigan pendientes. Un cambio concurrente de conteos marca `APLICADO_REQUIERE_REVISION`; no afirma UAT.

## Reversa

La migración es aditiva y no reescribe tablas operativas. Primera reversa recomendada: deshabilitar la ruta/pantalla de mantenimiento y conservar esquema y auditoría mientras se investiga; no borrar ni cambiar estados de entidades manualmente validadas. Si se requiere retirar estructura antes de uso, primero exportar conteos/IDs y confirmar que no existan referencias de aplicación; después preparar un script de retiro separado y aprobado que elimine únicamente las tres tablas en orden FK. El backup verificado permite recuperación integral de desarrollo si no hubo escrituras posteriores; revisar el impacto de restauración antes de usarlo.

## Resultado aplicado en desarrollo

- Preflight y aplicación: 2026-10-21 hora local; resultado `APLICADO`, destino y servidor coincidentes.
- Backup anterior al DDL: `/var/opt/mssql/data/IOEDESARROLLO_pre_entidades_fiscales_20261022030923.bak`; `COPY_ONLY`, `CHECKSUM`, `RESTORE VERIFYONLY` aprobados.
- Postflight: 3 entidades fiscales y 10 vínculos, todos `PENDIENTE`; 13 filas de auditoría. El placeholder y los RFC genéricos no se incorporaron.
- `DAT_SUC`: 11 sucursales antes/después; `EMPRESA`: 1 fila; `DAT_CTRL_CTAS`: 34,457 movimientos antes/después. Se compararon conteos, no hash de movimientos.
- Evidencia privada fuera de Git: `C:/Users/DAVID/proyectos/proyecto_ioe/outputs/integracion_entidades_fiscales_dev_20261021/` (`preflight.json`, `backup.json`, `aplicacion.json`).
- En la aplicación del DDL (2026-10-21) no se cambió producción, Odoo, `FACT_CSD`, timbrado ni asientos. Las actualizaciones posteriores de candidatos y Odoo se registran abajo.

## Pendiente después de aplicar

Confirmar UAT ADMIN en desarrollo y revisar candidatos con constancias fiscales/contador. Odoo Online raíz ahora contiene candidato ID 1; no crear las compañías 2/3 ni seleccionar emisor Quadrum desde la relación sucursal hasta validar identidad y vínculos. No promover a producción sin preflight, backup, lista blanca y autorización productiva renovados.

## Completar datos candidatos de ID 1 — 2026-10-23

- Se agregó `02_completar_candidato_id1.sql`, con guardas para servidor `dd7842d7ba7e`, base `IOEDESARROLLO`, estado `ONLINE` y modo `READ_WRITE`. Actualiza solo `ENTIDAD_FISCAL.ID_ENTIDAD_FISCAL=1` dentro de una transacción.
- Fuente leída de `FACT_CSD`: una fila activa/vigente para el RFC candidato, con nombre, régimen y CP. Fuente leída de `DAT_SUC`: los vínculos pendientes `DF01` y `DF16` conservan el mismo RFC; solo `DF01` tiene dirección. `EMPRESA.idempresa=1` es catálogo operativo con etiqueta `IOE BUSINESS`, sin RFC, CP ni domicilio; no se usó como identidad legal.
- Se completaron `NOMBRE_LEGAL`, `REGIMEN_FISCAL`, `CP_FISCAL` y `DOMICILIO_FISCAL` como **datos candidatos**. El domicilio proviene de `DAT_SUC.DIRECCION` de `DF01` y requiere cotejo contra constancia fiscal.
- `ESTADO_VALIDACION` permanece `PENDIENTE`; `REFERENCIA_VALIDACION`, `VALIDADO_POR` y `FCN_VALIDACION_UTC` siguen nulos. Los dos vínculos siguen pendientes y sin vigencias. No se inventó evidencia ni se habilitó consumo contable.
- Auditoría: evento `CAMBIO`, `ID_AUDIT=14`. No se modificaron `EMPRESA`, `DAT_SUC`, `FACT_CSD`, tablas financieras, Odoo ni producción. No se leyeron `CER`, `LLAVE` ni credenciales PAC.
- Postflight confirmó identidad del servidor/base, cuatro campos presentes y coincidencia de nombre/régimen/CP con CSD activo, domicilio con DF01, entidad y dos vínculos aún pendientes.
- Evidencia privada y reversa condicionada: `C:/Users/DAVID/proyectos/proyecto_ioe/outputs/integracion_entidades_fiscales_dev_20261021/` (`preflight_update_id1_20261023.json`, `aplicacion_update_id1_20261023.json`, `reversa_candidato_id1_20261023.sql`). No agregar esos archivos a Git.
- Antes de marcar `VALIDADA` o usar el candidato de `IOEB` en operación, cotejar nombre, RFC, régimen, domicilio y sucursales con constancia fiscal vigente y referencia verificable; registrar responsable y vigencias aprobadas.

## Completar candidatos fiscales 2 y 3 — 2026-10-23

- Se agregó `03_completar_candidatos_id2_id3.sql`, con destino fijo y guardas de servidor/base, candidatos pendientes, CSD activo/vigente, lista exacta de sucursales, relaciones pendientes y empresa operativa.
- ID 2: siete sucursales vinculadas; un CSD vigente aporta nombre, régimen y CP. Se copiaron esos tres campos como candidatos. `DF05` y `DF14` contienen dos domicilios distintos; `DOMICILIO_FISCAL` queda vacío hasta identificar domicilio fiscal con constancia.
- ID 3: una sucursal vinculada (`DF04`) y un domicilio candidato único. Se copiaron nombre, régimen, CP del CSD y domicilio de DF04; el estado queda `PENDIENTE` y el domicilio requiere validación documental.
- Las ocho relaciones de IDs 2/3 siguen `PENDIENTE`; no se modificaron `EMPRESA`, `DAT_SUC`, `FACT_CSD`, `DAT_CTRL_CTAS`, Odoo, CSD/KEY, timbrado ni producción. Auditoría nueva: IDs 15 y 16.
- Postflight independiente confirmó coincidencia de nombre/régimen/CP con CSD activo, vínculo y RFC fuente coincidentes, estados pendientes y domicilio ID 2 vacío. No se validó identidad ante SAT ni por contador.
- Evidencia privada y reversa condicionada (no ejecutada): `C:/Users/DAVID/proyectos/proyecto_ioe/outputs/integracion_entidades_fiscales_dev_20261021/` (`preflight_update_candidatos_id2_id3_20261023.json`, `aplicacion_candidatos_id2_id3_20261023.json`, `reversa_candidatos_id2_id3_20261023.sql`). No agregar a Git.
- No crear aún compañías Odoo 2/3 ni usar candidatos para contabilizar. Confirmar domicilio fiscal de ID 2 y las tres identidades/vínculos con contador antes de habilitar operaciones; producción requiere compuerta independiente.

## Preflight actual de validación — 2026-10-23

Script de solo lectura: `preflight-validacion-fiscal.cjs`. Confirma destino `172.16.100.40:1434/IOEDESARROLLO` y servidor `dd7842d7ba7e`; inspecciona metadatos CSD y coincidencias de RFC sucursal, sin leer certificados, llaves, PAC, RFC/nombres/domicilios a la salida. Genera evidencia privada bajo `outputs/odoo_fiscal_preflight_dev/`.

Último resultado: los tres candidatos tienen nombre legal, régimen, CP y domicilio; cada uno coincide en nombre/régimen/CP con un CSD activo y vigente. Las diez sucursales coinciden por RFC con su entidad y cada una tiene un CSD activo/vigente. Ningún candidato ni vínculo quedó validado: las tres entidades no tienen referencia de evidencia/validador/fecha; los diez vínculos no tienen fecha inicial efectiva ni referencia de validación. `DAT_SUC` no tiene columnas de tipo fecha. Estos datos son obligatorios en API y no se infieren desde vigencia del CSD.

Consulta ejecutada sin DML; estados y tablas sin cambios. Evidencia al corte: `outputs/odoo_fiscal_preflight_dev/preflight_20261024023844.json`. Para habilitar la validación, cotejar cada entidad con constancia fiscal vigente, guardar una referencia verificable y confirmar fecha efectiva de cada relación. Después validar entidad y relaciones con API ADMIN, con auditoría y preflight posterior. No aplicar estos estados en producción sin autorización productiva independiente.
