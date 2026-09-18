# Desacoplamiento del trigger DEV_PROVD

Fecha: 2026-08-29  
Destino ejecutado: `IOELOCAL`  
Estado: aplicado y verificado en entorno local

## Alcance ejecutado

- Preflight de trigger, SP, tablas, índices, FK, dependencias y conteos DEV.
- Respaldo de definición exacta del trigger y hashes de SP relacionados.
- Deshabilitación reversible de `dbo.trg_dat_art_dev_provd_reserva`.
- Verificación genérica sobre `DAT_ART` dentro de una transacción revertida.
- Documentación del diseño futuro en el prompt definitivo.

No se modificaron:

- SP `sp_dev_provd_*`.
- Tablas o registros DEV.
- API o Flutter.
- Otros módulos.
- Producción.

## Evidencia previa

- Trigger presente y habilitado.
- SHA2-256:
  `B9D075C96B547875EE5AFCC026EA24812AA8A56D48EBACFDB205412A00C10A2D`.
- Dependencias directas: `DEV_CTRL_PROVD`, `DEV_DOC_PROVD` e `inserted`.
- Documentos, detalles, evidencias, envíos y relaciones de envío DEV: cero
  registros.
- Movimiento `101`: entrada de mercancía.
- Movimiento `102`: devolución de mercancía.

## Acción

Se ejecutó:

```sql
DISABLE TRIGGER dbo.trg_dat_art_dev_provd_reserva ON dbo.DAT_ART;
```

El objeto no fue eliminado. Definición y rollback permanecen disponibles.

## Verificación

- `ExecIsTriggerDisabled = 1`.
- No existe otro trigger habilitado sobre `DAT_ART` cuya definición consulte
  tablas `DEV_*` o contenga misma regla de reserva.
- Prueba `UPDATE DAT_ART SET STOCK = STOCK` sobre un solo artículo ejecutada
  dentro de transacción y terminada con `ROLLBACK`.
- Resultado: correcto, sin datos persistidos.

## Incidente de validación y corrección

Durante una validación de parseo del archivo de respaldo, el lote independiente
`ENABLE TRIGGER` llegó a ejecutarse y reactivó el objeto a las `10:28:51`.
Esto restauró temporalmente el acoplamiento anterior.

El estado fue detectado mediante consulta directa de `sys.triggers`, corregido
con el script `apply` y verificado nuevamente a las `11:22:02`:

- `is_disabled = 1`.
- Hash de definición sin cambios.
- Prueba transaccional correcta y revertida.

El respaldo quedó convertido en evidencia comentada no ejecutable. El único
mecanismo operativo de reactivación es ahora el rollback explícito.

## Artefactos

- `sql/2026-08-29_dev_provd_trigger_desacoplamiento_preflight.sql`.
- `sql/2026-08-29_dev_provd_trigger_backup_before_disable.sql`.
- `sql/2026-08-29_dev_provd_trigger_desacoplamiento_apply.sql`.
- `sql/2026-08-29_dev_provd_trigger_desacoplamiento_verify.sql`.
- `sql/2026-08-29_dev_provd_trigger_desacoplamiento_rollback.sql`.
- `docs/modules/inventarios/PROMPT_DEFINITIVO_DEVOLUCIONES_A_PROVEEDOR.md`.

## Rollback

Rollback vuelve a habilitar regla anterior. Requiere coincidencia de base y
hash de definición. Su uso restaura acoplamiento global y debe ser una decisión
explícita.

## Límites

- Evidencia solo local.
- Sin UAT operativo del módulo.
- Sin migración o despliegue productivo.
- Desarrollo funcional pendiente conforme al prompt definitivo.
