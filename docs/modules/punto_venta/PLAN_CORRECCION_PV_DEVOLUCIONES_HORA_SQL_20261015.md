# Corrección del bloqueo al preparar devolución PV — 2026-10-15

## Causa confirmada

- La pantalla se detuvo al preparar el detalle de una devolución con respuesta HTTP `409`.
- Auditoría de IOELOCAL confirmó creación del folio y dos ediciones de cantidades. El folio seguía pendiente y las cantidades seleccionadas eran válidas.
- `PvDevolucionesService.loadSqlProcessNow()` ejecutaba `GETDATE()` y leía el offset del sistema SQL. La instancia SQL observada usaba UTC (`OFFSET_MINUTES=0`), mientras el servicio exigía `-360` para `America/Mexico_City`. Esa comprobación ocurre después de validar los renglones, por eso la devolución no avanzaba.
- El interceptor global guarda mutaciones exitosas, no respuestas excepcionales; la solicitud fallida original no dejó evento de auditoría. El contenedor API original ya no estaba disponible para recuperar su log.
- Consulta SQL de solo lectura confirmó que `Central Standard Time (Mexico)` existe y que la conversión UTC actual produce hora local con offset `-360`.

## Corrección integrada

1. Calcular hora de proceso como `SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)'`; enviar el valor local `datetime2` a las operaciones existentes. El mismo helper sirve para preparar y finalizar devolución.
2. Tras rollback, registrar fallos de `detalle/preparar` con folio, sucursal, etapa, estado y tipo de excepción. Solo conflictos incluyen mensaje; no se guarda body ni secretos.
3. Frontend muestra el mensaje de API mediante `apiErrorMessage` para hacer visible la validación que bloquea el avance.
4. Reconstruir imagen conjunta API+Flutter Web con los SHAs de ambos commits y Node 24 LTS. La auditoría detectó un `proxy-addr` crítico; el lockfile queda en `2.0.8`. Permanecen 16 avisos altos de dependencias productivas; la integración no hace actualización masiva de paquetes.
5. Mantener SQL, sus relojes, puertos, mounts, red, proxy y variables privadas sin cambios.

## Validación y activación

- Preflight de solo lectura: confirmar IOELOCAL, zona y estado de los servicios; verificar mounts SMB de CFDI, red Coolify y variables requeridas sin imprimir valores.
- Build reproducible de imagen candidata: el script comprueba SHAs exactos y checkout limpio; registra tag e image ID, sin iniciar servicios.
- Activación reemplaza una API y un front en conjunto y puede interrumpir solicitudes. Hacerla en ventana coordinada; mantener disponible tag anterior para rollback.
- Postflight: verificar `DB_NAME()=IOELOCAL`, health de DB/API, frontend y proxy; después UAT autenticada de preparación de detalle con cantidades y ticket consistentes. No finalizar pago como parte de esta validación.

## Estado

La consulta SQL de solo lectura confirma disponibilidad de la zona y offset esperado. Registrar el build de imagen, activación y UAT autenticada en evidencia de release al completar cada gate.
