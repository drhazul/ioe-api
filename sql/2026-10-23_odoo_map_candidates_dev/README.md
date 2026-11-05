# Propuestas de equivalencia de cuenta IOE–Odoo

Fecha: 2026-10-23. Destino: solo `IOEDESARROLLO` (`172.16.100.40:1434`, servidor `dd7842d7ba7e`) y Odoo Online `https://ioeb.odoo.com` para preflight autenticado de lectura.

## Alcance

El paquete registró 33 propuestas en `dbo.INT_ODOO_CTA_MAP`, 11 eventos por cada una de las tres entidades. El titular autorizó las 33 equivalencias: en `IOEDESARROLLO` están `VALIDADA` con aprobador, referencia y fecha, y 66 auditorías acumuladas (propuesta y aprobación). La autorización no cubre tres movimientos `CLSD=0` ni la cuenta fuente `110001020`, que siguen sin mapa.

No se crean cuentas Odoo: los seis códigos candidatos ya existen activos y con tipo esperado en cada compañía. No se crean pólizas, facturas, pagos, diarios ni movimientos. No se modifica `DAT_CAT_CTAS.CTA`, `DAT_CTRL_CTAS`, empresas, sucursales ni producción.

## Candidatos y evidencia

| CTA IOE | Evento fuente | Signo observado de `IMPT` | Código Odoo | Tipo Odoo | Observación |
|---|---|---|---|---|---|
| `101001001` | CMOV 801, abono cliente ORD | Positivo | `105.01.01` | Cuenta por cobrar | El CMOV 802 cargo cliente usa signo negativo y mismo control CxC. |
| `101001001` | CMOV 802, cargo cliente ORD | Negativo | `105.01.01` | Cuenta por cobrar | Evento identificado como cliente en `DAT_CMOV`. |
| `101001002` | CMOV 601, abono crédito cliente | Positivo y negativo | `105.01.01` | Cuenta por cobrar | Una fila histórica de abono tiene signo negativo; quedan ambas variantes para revisión. |
| `101001002` | CMOV 602, cargo crédito cliente | Negativo | `105.01.01` | Cuenta por cobrar | `DAT_CMOV` identifica crédito/deudor; evitar duplicar saldo si Odoo registra factura/pago. |
| `101001003` | CMOV 912, disposición/reintegro caja chica | Positivo | `101.01.01` | Banco y efectivo | Odoo usa cuenta `Cash`; conciliable = No; diarios/cajas por sucursal siguen pendientes. |
| `210001019` | CMOV 611, abono apartados | Positivo | `206.01.01` | Pasivo corriente | Candidato anticipo de cliente. |
| `210001019` | CMOV 612, cargo apartados | Negativo | `206.01.01` | Pasivo corriente | Aplicación/reverso del apartado; confirmar evento de negocio. |
| `704010003` | CMOV 901, sobrante OPV | Negativo | `403.01.01` | Ingreso | CMOV lo clasifica como abono; cruzar signo IOE con debe/haber Odoo antes de contabilizar. |
| `704010003` | CMOV 902, faltante OPV | Positivo | `601.84.02` | Gasto | CMOV lo clasifica como cargo. |
| `704010004` | CMOV 914, disposición por gasto | Negativo | `601.84.01` | Gasto | Candidato por `RELACION=DG`; revisar CFDI, IVA y deducibilidad. |

La lista tiene 11 filas por entidad `1→1`, `2→2`, `3→3`; todas las cuentas Odoo comprobadas en las tres compañías independientes. Se usa código de cuenta, no ID interno de Odoo. Odoo reportó `asset_receivable` conciliable para `105.01.01`, `liability_current` conciliable para `206.01.01`, `asset_cash` no conciliable para `101.01.01`, `income` para `403.01.01` y `expense` para las cuentas `601.84.01/02`.

Quedan fuera por ahora: `101001001` y `101001002` tienen 3 movimientos históricos con `CLSD=0`, sin evento que permita asignarlos; `110001020` no tiene movimientos en `DAT_CTRL_CTAS` y su descripción no define una cuenta contable. Ninguno recibe cruce automático. El resto de clases revisadas coincide con `DAT_CMOV`; el script aborta ante una clase no prevista.

## Dependencias y límites

- Los nombres legales y compañías Odoo 1–3 coincidieron; domicilios/RFC/régimen ya estaban reflejados en maestros y no se reescriben en esta fase.
- Las tres compañías no tienen `account.move` ni líneas contables al preflight.
- Las tres entidades fiscales y sus 10 vínculos con sucursales siguen `PENDIENTE`. Por eso el resolvedor API no permite resolverlas todavía ni publicar documentos.
- `SIGNO_IMPORTE` describe signo del `IMPT` de IOE y quedó aprobado como parte del crosswalk; no se convierte directamente en `debit`/`credit` Odoo. Para crear y contabilizar asientos aún se deben definir referencia documental, cliente/proveedor, CFDI, impuestos, contrapartidas y tratamiento debe/haber.
- El corte de caja debe modelar diario por sucursal, cobros en tránsito, retiros, depósito bancario y conciliación bancaria. El mapeo de `CTA` no demuestra que esos eventos estén conciliados.
- No modificar `DAT_CAT_CTAS.CTA`: es PK operativa y tiene referencias/códigos usados por procesos. Resolver por crosswalk, nunca reescribir historia ni SPs en esta fase.

## Ejecución

Desde `ioe-api`:

Estado actual: usar solo el preflight de lectura. Los comandos de alta inicial que siguen registran el procedimiento histórico, ya completado; no son pasos pendientes ni se deben repetir sobre las 33 filas aprobadas.

```powershell
node sql/2026-10-23_odoo_map_candidates_dev/validar-dev.cjs

# Alta inicial histórica, ya ejecutada
node sql/2026-10-23_odoo_map_candidates_dev/aplicar-dev.cjs
node sql/2026-10-23_odoo_map_candidates_dev/aplicar-dev.cjs --apply
node sql/2026-10-23_odoo_map_candidates_dev/aplicar-dev.cjs --apply --reuse-backup=20261023234442
# Comandos de origen/reversa del lote inicial; no ejecutar sobre el estado aprobado actual
# node sql/2026-10-23_odoo_map_candidates_dev/aplicar-dev.cjs --rollback

# Aprobación ya aplicada; requiere preflight y autorización nueva para repetir
# node sql/2026-10-23_odoo_map_candidates_dev/validar-dev.cjs --apply
# --rollback requiere autorización nueva y revoca la aprobación conservando auditoría
# node sql/2026-10-23_odoo_map_candidates_dev/validar-dev.cjs --rollback
```

`aplicar-dev.cjs` crea las propuestas iniciales; su `--rollback` retira solo propuestas pendientes intactas. `validar-dev.cjs` sin bandera es preflight de lectura; compara SQL exacto, API Odoo, compañías/cuentas y conteos. Su `--apply` toma backup nuevo `COPY_ONLY/CHECKSUM`, valida con `RESTORE VERIFYONLY`, cambia las 33 propuestas exactas a `VALIDADA` y agrega auditoría en transacción. Su `--rollback` revierte solo esa aprobación, la devuelve a `PENDIENTE` y agrega auditoría de revocación; no borra historial. Ambos runners fijan servidor/base y abortan ante estado inesperado. No aplicar a otras bases.

El servicio `src/modules/odoo-accounting/odoo-account-map.service.ts` acepta únicamente mapas `VALIDADA`, pero además exige que la entidad fiscal y la relación con sucursal estén `VALIDADA` para la fecha. El servicio no publica documentos ni llama a Odoo.

La aprobación vigente y su reversa controlada están documentadas arriba. Evidencia privada en `outputs/odoo_cta_map_approval_dev_20261023/`, incluido preflight final `preflight_20261024001821.json`; evidencia de inserción inicial en `outputs/odoo_cta_map_candidates_dev_20261023/`. Credenciales nunca se escriben ahí. No ejecutar en `IOELOCAL`, CT105 ni producción.
