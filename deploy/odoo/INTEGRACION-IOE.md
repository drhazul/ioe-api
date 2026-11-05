# Diseño de integración IOE ↔ Odoo

Fecha: 2026-10-21<br>
Estado: diseño verificable; no se han creado asientos ni sincronizado documentos comerciales.

**Estado operativo actualizado al 2026-10-23:** pruebas apuntan a Odoo Online `https://ioeb.odoo.com` (`20.0+e`); CT105 local queda para fase posterior. Odoo tiene tres compañías raíz y diez sucursales hijas. En `IOEDESARROLLO` se completaron datos de sucursal indicados por el titular y `VIGENTE_DESDE` se derivó del folio más antiguo en ocho sucursales; DF02 y DF03 no tienen folios históricos y siguen sin fecha. Estas fechas describen antigüedad de la relación, no el inicio del registro contable. Corte contable previsto: 2026-11-01; periodo de pruebas: 2026-10-01 a 2026-10-31. Las tres entidades fiscales y los diez vínculos siguen `PENDIENTE`; no se crearon asientos ni documentos financieros. Odoo refleja RFC en compañías raíz y RFC vacío en sucursales. La copia de contactos se limita a siete sucursales con datos disponibles.

## Estado observado

- CT105 aloja Odoo 19, PostgreSQL 17 y pgAdmin mediante Coolify. Base de prueba `ioe_odoo_pilot` contiene `base`, `account` y `l10n_mx`; Odoo y pgAdmin responden HTTP local y PostgreSQL está saludable.
- Odoo corre con `odoo:19.0`, imagen oficial Community. País de compañía México; `account` y `l10n_mx` instalados. Verificado: 148 cuentas, 33 impuestos, 8 diarios y 0 movimientos (`account_move`).
- `l10n_mx_edi` y `l10n_mx_reports` no están en la imagen Community. Módulos Enterprise requieren licencia autorizada y montaje/imagen compatible.
- Preflight de conectividad: el contenedor IOE `erp-api` llega a Odoo por `172.16.100.40:18069` (HTTP 200 en `/web/login`). JSON-2 sin credenciales responde HTTP 401. Los servicios están en redes Docker distintas. El 2026-10-21 se validó también `https://odoo.ioebusiness.com.mx/web/login` con TLS y HTTP 200; POST JSON-2 sin clave respondió 401 sobre HTTPS. No se ha creado clave ni leído datos contables por API.
- Punto de retorno previo a módulos: dump PostgreSQL y tar del filestore guardados en `/root/ioe_odoo_pilot/backups/ioe_odoo_pilot_mx_pre_modules_20261021.dump` y `/root/ioe_odoo_pilot/backups/ioe_odoo_pilot_mx_filestore_pre_modules_20261021.tar`, permisos `0600`; ambos archivos validaron estructura y SHA-256. Restauración todavía no probada.
- IOE conserva IOELOCAL en SQL Server y CFDI en `/ArchivosUsuarios/respaldoCFDI`, montado en CT105 desde `//127.0.0.1/IOE_CFDI`. Odoo aún no tiene ese montaje.
- DNS A `odoo.ioebusiness.com.mx` → `74.208.174.229`, TTL 300, quedó publicado en HostGator. Autoritativos `ns94`/`ns95` y Google 8.8.8.8 resolvieron; Cloudflare 1.1.1.1 y resolvedor local mostraron NXDOMAIN intermitente. Nginx en `.3` tiene certificado Let's Encrypt dedicado y proxy HTTPS a `172.16.100.40:18069`; `nginx -t` y recarga gradual pasaron. El navegador interno cargó la página de acceso.
- El acuerdo funcional previo plantea importar CFDI a borrador Odoo y evitar un segundo asiento equivalente. Contador debe aprobar el momento y la regla de contabilización.

## Regla de autoridad

IOE mantiene operación comercial, sucursales, movimientos de inventario, cobros y devoluciones. Odoo será libro contable cuando Contabilidad y localización México estén licenciados y el contador apruebe el mapeo.

Antes de esa aprobación, toda factura importada queda en borrador. El importador no publica, cancela, timbra ni modifica documentos en IOE. No escribir directamente en SQL Server ni en PostgreSQL; integrar por API.

## Eventos que deben cuadrar

| Evento IOE | Efecto financiero/contable a contemplar en Odoo | Controles antes de publicar |
|---|---|---|
| Venta con CFDI | Ingreso, IVA trasladado y cliente/cuenta por cobrar; XML como evidencia. | Importar `out_invoice` en borrador; clave única por RFC emisor + UUID CFDI. No duplicar venta ya resumida desde POS. |
| Venta sin CFDI individual | Ingreso, impuestos y forma de pago según el cierre POS/caja. | No inventar CFDI. Definir si se importa cada ticket o resumen diario/sucursal y conciliarlo contra folios/caja. |
| Venta PUE / contado | Aplicación a caja, banco o cuenta de compensación por tarjeta, según forma de pago real. | Mapear forma de pago y fecha de liquidación; no asumir que depósito de tarjeta llega el mismo día. |
| Venta PPD / crédito y REP | Cuenta por cobrar al facturar; uno o más pagos y CFDI complemento de pago al cobrar. | Aplicar cada pago a factura(s); UUID REP y parcialidad; evitar reconocer el cobro dos veces. |
| Devolución de venta | Reversa de ingreso/IVA y salida de efectivo, reembolso de tarjeta o saldo a favor; posible reingreso físico a inventario. | Vincular folio original, líneas/cantidades, forma de reembolso y CFDI relacionado. Separar devolución operativa de nota de crédito fiscal. |
| Recepción de mercancía | La captura física registra cantidades/calidad; por sí sola no mueve stock ni crea cuenta por pagar. El paso autorizado/contabilizado genera la entrada de inventario (movimiento 101) y puede cerrar la O.C. | Replicar solo el estado que produjo el movimiento; usar `DOCREC`/`IDREC` idempotente y relacionar `NPED`/artículos. No crear factura de proveedor solo por recibir mercancía. |
| CFDI de proveedor | Cuenta por pagar, gasto o inventario, IVA acreditable y retenciones, según XML y política fiscal. | Importar `in_invoice` en borrador; RFC + UUID único; validar estado SAT, moneda, tasas, uso/fecha, proveedor, orden y recepción. |
| Devolución a proveedor | Salida/reversa de inventario y, con nota de crédito del proveedor, reducción de cuenta por pagar o saldo a favor e IVA. | Relacionar devolución, recepción/factura original y UUID de nota de crédito. No inferir nota fiscal desde el movimiento de almacén. |
| Pago a proveedor | Disminuye cuenta por pagar y banco/caja; puede haber anticipo, diferencia cambiaria o comisión. | Aplicar a facturas/anticipos identificados. Banco/caja no debe registrar el gasto otra vez. |
| Cierre de caja, retiro y depósito | Efectivo en caja, tránsito a caja general/banco, faltante/sobrante y liquidación de tarjetas. | `caja-general` y `retiros` aportan control operacional; transferencia/retiro no es ingreso ni gasto por sí mismo. Cuadrar por sucursal, forma de pago y fecha. |
| Estado de cuenta bancario | Conciliación de depósitos, transferencias, comisiones, contracargos y pagos. | No encontré API de banco ni importador de estados bancarios entre las rutas revisadas. Definir extracto CSV/OFX o conexión bancaria y conciliación con Odoo. |
| Inventario, costo y traspasos | Existencias, costo de venta, merma, ajuste y mercancía en tránsito. | Definir costeo, cuentas puente, sucursal/almacén y tratamiento de transferencias; evitar duplicar el efecto que ya se origine en venta/recepción. |
| Cancelación y nota de crédito | Reversas fiscales y contables relacionadas con el comprobante original. | Revisar estado SAT/PAC y folios vinculados. Una cancelación fiscal no borra automáticamente cobro, devolución o movimiento de inventario. |

Las cuentas, impuestos, costo y reglas de fecha son decisiones contables. No inferirlas del XML ni del código operativo.

## Hechos del código IOE

- CFDI de cliente: `cfdi.controller.ts` expone XML/PDF y notas de crédito con JWT y control por sucursal. `facturacion.controller.ts` tiene artefactos y operaciones Facturify.
- Hay rutas separadas para Facturify (`facturacion`) y Quadrum (`cfdi`). El código de Quadrum indica que no reemplaza Facturify; `FAC_SVR_SHAP.CFDI_PAC` identifica quién emitió el CFDI. El importador debe leer el PAC/UUID existente y nunca volver a timbrar.
- Recepciones: `recepciones.controller.ts` ofrece lectura, autorización, cantidades, costos, rechazo y confirmación de recepción; no aparece un importador CFDI de proveedor en ese contrato.
- Devolución a proveedor: `devoluciones-proveedor.controller.ts` maneja ciclo de devolución/envío/recepción y evidencia; la evidencia operativa no equivale a nota de crédito fiscal.
- Caja: `caja-general.controller.ts`, `retiros.controller.ts` y `pv-devoluciones.controller.ts` ofrecen datos de caja, retiros y reembolsos. Los controladores revisados requieren JWT.
- Las rutas financieras existentes son contratos de IOE, no un API contable listo para Odoo. Falta definir una API de integración de solo lectura o una bandeja de eventos restringida.

## Arquitectura propuesta

1. IOE publica eventos confirmados en una bandeja/outbox de integración con ID de origen, tipo de evento, sucursal/empresa, fecha de negocio, versión y hash de adjuntos.
2. Un trabajador dedicado consulta la bandeja y llama a Odoo por JSON-2 sobre HTTPS. Usa usuario bot sin permisos interactivos, permisos mínimos y clave separada; nunca conecta a SQL Server o PostgreSQL directamente.
3. El trabajador guarda una clave idempotente por documento. Reintentos consultan primero el resultado Odoo. Caída de red no autoriza repetir una operación financiera a ciegas.
4. Primera prueba: XML/PDF de una factura de cliente, importada en borrador, con ID de IOE, UUID, RFC, importes e impuestos reconciliados. No se usa XML solo para generar inventario o movimiento bancario.
5. Segunda etapa: compras, recepciones, devoluciones, pagos y conciliación de caja/bancos con IDs separados. No publicar asientos hasta aprobación contable.

Para XML/PDF emitidos por IOE, preferir un endpoint autenticado y limitado al folio/UUID en vez de montar toda la carpeta SMB dentro de Odoo. La carpeta contiene documentos fiscales compartidos y está montada RW para IOE; Odoo no necesita escritura. Si se decide montar SMB, limitarlo a lectura, ruta y servicio concretos, validar identidad/permisos y confirmar el alcance de acceso antes de aplicarlo.

## Dependencias y decisiones pendientes

1. **Hecho para pruebas:** `https://ioeb.odoo.com` responde JSON-2 autenticado con `API_ODOO`; acceso API vigente. No copiar la clave a scripts, tickets o mensajes.
2. País México está configurado en las tres compañías. El titular autorizó crear compañías 2/3 con maestros candidatos de `IOEDESARROLLO`; identidades y vínculos siguen `PENDIENTE`. Validar RFC, domicilios y sucursales antes de documentos o asientos; aprobar cuentas, impuestos y reglas contables antes de contabilizar.
3. Destino actual es Odoo Online `ioeb.odoo.com`. CT105 local es otra base y permanece diferido; no se ha migrado ni vinculado licencia a CT105.
4. Contador define: catálogo de cuentas, IVA/retenciones, entidad fiscal por sucursal y periodo, centros analíticos, costeo, fecha de contabilización, tratamiento de CFDI importado, pagos PUE/PPD y cierres.
5. IOE define fuente exacta para XML de compra y notas de crédito de proveedores; no se ha demostrado que estén en `respaldoCFDI`.
6. Tesorería define origen de estados bancarios, cuentas/diarios de Odoo, liquidación de tarjeta, depósitos de caja y comisiones.
7. Definir muestra UAT por cada evento y reglas de conciliación: total, impuestos, pagos, costo/stock, UUID, sucursal y fecha. El contador firma el resultado antes de habilitar publicación automática.

## Secuencia

1. Hecho: publicar DNS A y habilitar HTTPS para `odoo.ioebusiness.com.mx`; HTTP redirige a HTTPS y `/web/login` responde 200. Resolver cachés todavía muestran NXDOMAIN intermitente. Confirmar que plan Custom quede activo y aplique a este despliegue antes de crear API key.
2. Hecho en piloto: país México y módulos Community `account`/`l10n_mx`; no hay movimientos. El modelo fiscal está aplicado en desarrollo, pero faltan datos validados. No configurar CSD/PAC ni emisión SAT en Odoo; IOE conserva timbrado. Módulos EDI/reportes mexicanos requieren edición/licencia autorizada.
3. Diseñar API/eventos de solo lectura IOE y usuario bot Odoo; probar conexión JSON-2 sin leer documentos comerciales en bloque.
4. Importar una factura/nota seleccionada a borrador y conciliarla con su XML/PDF.
5. Añadir compras/recepciones/devoluciones y luego cobros, pagos, caja y bancos.
6. Ejecutar UAT acotada y paralela; activar asientos automáticos solo con autorización contable explícita.

## Documentación oficial

- [Odoo 19 JSON-2 API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html): `/json/2`, bearer API key, permisos estándar Odoo, bot de mínimos privilegios y rotación.

## Aprobación contable y resolvedor API — 2026-10-23

- El titular autorizó las 33 equivalencias registradas (11 combinaciones evento/signo para cada una de las tres compañías). En `IOEDESARROLLO` cambiaron a `VALIDADA` con evidencia y auditoría; ahora hay 66 auditorías. No incluye tres movimientos históricos `CLSD=0` ni la cuenta fuente `110001020`.
- Backup previo verificado con `COPY_ONLY/CHECKSUM/RESTORE VERIFYONLY`: `/var/opt/mssql/data/IOEDESARROLLO_pre_odoo_map_approval_20261024001333.bak`. Evidencia privada de preflight y postflight en `outputs/odoo_cta_map_approval_dev_20261023/`. Las 3 entidades fiscales y 10 vínculos siguen pendientes; 7 cuentas fuente y 34,457 movimientos conservaron sus conteos.
- La API contiene `OdooAccountMapService.resolve`, exportado por `OdooAccountingModule`. Solo devuelve cuenta destino si entidad, relación sucursal-fecha y mapa están validados y el cruce es único; rechaza estados pendientes, ausencia/ambigüedad y entrada inválida. Aún no hay endpoint HTTP, outbox, proceso de sincronización ni escritura a Odoo.
- Verificación técnica: `npm run build` y pruebas Jest del servicio 7/7 PASS; cero escrituras Odoo o asientos. Reversa de aprobación disponible en `sql/2026-10-23_odoo_map_candidates_dev/04_revertir_validacion.sql`, no ejecutada.
- Para habilitar una prueba con evento IOE todavía falta validar las tres entidades y diez vínculos con documentos fiscales; después ejecutar UAT de resolución. La aprobación de equivalencias no define por sí sola diarios, impuestos, débitos/créditos, pagos, caja, bancos, compras, devoluciones ni inventario.

## Preflight de identidades y vínculos — 2026-10-23

- Script solo lectura: `sql/2026-10-21_entidades_fiscales_dev/preflight-validacion-fiscal.cjs`. Fija destino `172.16.100.40:1434/IOEDESARROLLO` y servidor `dd7842d7ba7e`; no lee `CER`, `LLAVE` ni credenciales PAC; salida omite RFC, nombres y domicilios.
- Resultado: 3/3 entidades tienen nombre legal, régimen, CP y domicilio candidato; cada RFC tiene exactamente un CSD activo/vigente y nombre/régimen/CP coinciden con sus metadatos. 10/10 vínculos coinciden con el RFC de `DAT_SUC` y cada sucursal tiene un CSD activo/vigente.
- Compuertas aún abiertas: las 3 entidades carecen de referencia/usuario/fecha de validación. Los 10 vínculos carecen de `VIGENTE_DESDE` y referencia. La API exige esos datos y que primero se valide la entidad; no se cambió ningún estado.
- Evidencia privada, sin RFC ni dirección: `outputs/odoo_fiscal_preflight_dev/preflight_20261024023844.json`. SQL fue solo lectura; cero cambios en entidad, sucursal, CSD, cuentas, Odoo o asientos. Consulta de metadatos confirmó que `DAT_SUC` no tiene columnas de fecha.
- Siguiente paso: cotejar cada identidad con constancia fiscal vigente y asignar referencia verificable; confirmar fecha inicial efectiva de cada relación sucursal-entidad. Con esos datos, validar con API ADMIN, registrar auditoría y volver a correr preflight; no inferir la fecha desde la vigencia del CSD ni de la apertura de sucursal.
- [Odoo 19 multiempresa](https://www.odoo.com/documentation/19.0/applications/general/multi_company.html): compañías separan entidades legales; validar el plan antes de habilitar multiempresa.
- [Odoo 19 sucursales contables](https://www.odoo.com/documentation/19.0/applications/finance/accounting.html): una sucursal comparte con su compañía matriz plan contable, moneda e impuestos; puede tener diarios propios y la localización fiscal se configura en la matriz.
- [Planes Odoo](https://www.odoo.com/pricing): el plan Custom incluye API externa y opciones Odoo.sh/on-premise.
- [Imagen oficial Odoo en Docker Hub](https://hub.docker.com/_/odoo): imagen `odoo:19.0` y nota sobre módulos Enterprise.

## Preflight de suscripción y catálogo de empresas (2026-10-21)

- El titular inició sesión en `https://ioebusiness1.odoo.com/`. La pantalla muestra prueba gratis con 14 días restantes y el formulario “Registra tu suscripción” solicita un código. Esto no confirma contrato Custom activo ni cobertura on-premise para CT105. No se envió código ni se compró/activó plan. La base SaaS `ioebusiness1.odoo.com` es distinta de `ioe_odoo_pilot`; no registrar código ahí si CT105 sigue como destino.
- Preflight SQL de solo lectura en `172.16.100.40:1434/IOEDESARROLLO`: `dbo.EMPRESA` contiene una fila “IOE BUSINESS” sin RFC ni CP; `dbo.DAT_SUC` contiene 11 sucursales, tres valores RFC distintos no nulos y el placeholder `CAMBIO` en sucursal `000`; faltan domicilios en algunos registros. La relación técnica sucursal→empresa 1 usada en desarrollo no demuestra una sola identidad fiscal. No copiar estos datos a Odoo hasta confirmar razón social, RFC, domicilio y relación legal con documentación y contador.
- La lectura prevista de `IOELOCAL` no autenticó con la identidad SQL intentada; no devolvió filas ni alteró datos. Producción sigue pendiente de una ruta/identidad autorizada de solo lectura.
- CT105 sigue en Community `odoo:19.0`; `account` y `l10n_mx` están instalados en `ioe_odoo_pilot`, con 0 movimientos. JSON-2 sin autenticación respondió 401 por HTTPS. No hay API key, licencia Enterprise local ni sincronización.
- Próximas puertas: confirmar Custom activo y aplicable a on-premise/API; disponer de acceso autorizado a módulos Enterprise; probar restauración de backup; vincular solo `ioe_odoo_pilot`; validar catálogo legal y sucursales antes de crear compañías. Sin compra, publicación de asientos ni sincronización hasta completar esas validaciones.

## Plan correctivo: entidades fiscales y sucursales

Alcance: corregir el modelo de identidad fiscal antes de dar de alta compañías Odoo o sincronizar documentos. El titular precisa que las entidades emisoras del alcance son personas físicas. Cada RFC y nombre legal se debe confirmar contra constancia de situación fiscal y contador; no deducir identidad legal por el nombre comercial de una sucursal.

### Modelo objetivo

- Mantener `dbo.EMPRESA` como catálogo operativo existente. No convertirla en maestro fiscal ni reutilizar `DAT_SUC.IDEMPRESA`: ese vínculo conserva su uso de configuración comercial/crédito. No cambiarlo en este plan.
- Agregar, después de aprobación y migración autorizada, un maestro independiente `dbo.ENTIDAD_FISCAL`, con identificador interno, RFC normalizado, tipo de persona, nombre legal, régimen fiscal, código postal fiscal, domicilio y estado de validación. RFC y datos fiscales se dan de alta solo con evidencia validada.
- Agregar relación histórica `dbo.ENTIDAD_FISCAL_SUCURSAL` entre entidad fiscal y `DAT_SUC.SUC`, con vigencia desde/hasta, estado y auditoría. Regla preliminar: una entidad fiscal puede cubrir varias sucursales y cada sucursal tiene una entidad fiscal activa por fecha. Titular/contador deben confirmar si alguna sucursal puede emitir con más de un RFC; en ese caso la asignación debe resolverse por documento/flujo y nunca inferirse solo por sucursal.
- Conservar `DAT_SUC.RFC` durante transición. Normalizar y comparar valores solo en un cruce revisable; no sobrescribir ni borrar RFC existentes hasta mover y verificar cada consumidor.

### Estado implementado en desarrollo (2026-10-21)

- DDL aditivo aplicado en `172.16.100.40,1434/IOEDESARROLLO` después de preflight y backup `COPY_ONLY/CHECKSUM` verificado. Se crearon `ENTIDAD_FISCAL`, `ENTIDAD_FISCAL_SUCURSAL` y `ENTIDAD_FISCAL_AUDIT`.
- Se generaron tres candidatos fiscales y diez vínculos sucursal, todos `PENDIENTE`; no se copiaron nombres legales ni se validó RFC por inferencia. `CAMBIO` y RFC genéricos quedaron fuera.
- Conteos antes/después: 11 sucursales, 1 empresa operativa y 34,457 movimientos. El proceso no actualiza estas tablas; esta ejecución verificó conteos, no hash de movimientos.
- API ADMIN ROL 1 y pantalla Flutter para administrar entidad/vínculo están implementadas en worktree, sin commit, despliegue o UAT autenticada.
- Backup y evidencia privados: `outputs/integracion_entidades_fiscales_dev_20261021/`. Inventario y seguimiento de back/front/SQL: [`CONTROL_CAMBIOS_DESARROLLO_PRODUCCION.md`](../../docs/CONTROL_CAMBIOS_DESARROLLO_PRODUCCION.md).
- Producción y Odoo no cambiaron. No se crearon compañías ni asientos.

## Cambio de Community a Enterprise en CT105 (2026-10-21)

- Preflight actual confirma imagen `odoo:19.0` Community en CT105 y módulos `account`/`l10n_mx` instalados en `ioe_odoo_pilot`. No se modificaron imagen, licencia ni base.
- El acceso al repositorio oficial Enterprise 19.0 no quedó acreditado desde este equipo (`git ls-remote` respondió `Repository not found`). Suscripción Custom activa y código de registro siguen sin confirmación vigente.
- El corte se prepara solo después de prueba de restauración y validación en copia aislada. Procedimiento, reversa y responsables: [`ENTERPRISE-CT105.md`](ENTERPRISE-CT105.md).
- Actualización: el titular informa que ya tiene licencia. Falta verificar su estado `In Progress`, cobertura on-premise y si quedó asociada a `ioebusiness1.odoo.com` o a CT105; la base local no tiene Enterprise instalado. El acceso de este equipo al repositorio Enterprise 19.0 sigue sin acreditarse.

### Reglas para Odoo y timbrado

- Crear una compañía Odoo por entidad fiscal/RFC validado cuando esa persona lleve contabilidad propia. Sucursales de la misma persona se modelan como sucursales Odoo o dimensiones operativas bajo la matriz, según lo que apruebe el contador; no crear una compañía contable por cada tienda automáticamente. Odoo documenta plan contable, moneda e impuestos compartidos por matriz y sucursales, con diarios propios opcionales y localización fiscal en matriz.
- Para Quadrum, la identidad emisora sigue viniendo de `RfcEmisor` explícito en cada solicitud/documento. La relación sucursal-entidad es mapeo contable y de reporteo; no selecciona ni reemplaza RFC de emisor.
- Para Facturify, mantener el fallback actual a `DAT_SUC.RFC` hasta inventariar consumidores y migrarlos con pruebas. No cambiar timbrado ni guardar/copiar CSD, KEY, contraseña PAC o secretos en Odoo.
- En eventos contables, usar RFC/UUID del CFDI como identidad fiscal del documento y la relación histórica de sucursal para su dimensión operativa. Si hay conflicto entre documento y cruce, poner en cuarentena; no elegir RFC automáticamente.

### Fases y criterios de salida

1. **Preflight de lectura:** recopilar por sucursal código, RFC actual, RFC normalizado, nombre legal validado, vigencia, evidencia y estado (`VALIDADO`, `PENDIENTE`, `CONFLICTO`, `SIN_RFC`). Separar desarrollo y producción. El preflight existente solo cubre `IOEDESARROLLO`; `IOELOCAL` sigue pendiente de acceso autorizado de solo lectura.
2. **Aprobación del cruce:** titular/contador confirman persona física, RFC, nombre legal, régimen, domicilio, sucursales cubiertas y vigencias. Resolver `CAMBIO`, RFC faltantes, domicilios incompletos y duplicados; no cargar placeholders a Odoo.
3. **Aprobación de estructura:** revisar cardinalidad por sucursal/fecha y decidir si sucursales serán sucursales Odoo o analíticas/almacenes. Confirmar Custom/Enterprise y el alcance multiempresa antes de habilitarlo.
4. **Estructura de desarrollo:** completada en `IOEDESARROLLO` para este alcance; ver estado implementado y bundle SQL. Cualquier delta nuevo exige preflight y respaldo propios. La aplicación a producción requiere autorización específica para destino, alcance y ventana.
5. **Piloto de maestros:** en `ioe_odoo_pilot`, registrar solo la primera entidad fiscal validada y su(s) sucursal(es), sin asientos ni documentos. Verificar RFC único, relación vigente y acceso por compañía.
6. **Compatibilidad y UAT:** probar consumidores Facturify/Quadrum y reconciliar muestra por RFC, UUID, sucursal y fecha. Mantener bloqueado cualquier evento sin mapeo validado; no habilitar publicación de asientos hasta firma contable.

**Criterio de cierre:** todas las sucursales del alcance tienen relación fiscal validada por periodo; no hay placeholders ni RFC contradictorios; compañía/sucursal Odoo coincide con la estructura aprobada; pruebas no duplican CFDI ni movimientos. Los datos actuales de desarrollo no prueban el estado de producción.

## Fase de prueba Odoo Online ↔ IOEDESARROLLO (2026-10-23)

- Destino actual confirmado por el titular: `https://ioeb.odoo.com`, con suscripción **Custom mensual** verificada en Mi suscripción, un usuario activo y Odoo **20.0 Enterprise**. La página indica que Custom incluye API/multiempresa. CT105 queda pendiente para una fase posterior; no confundir esta base con `ioebusiness1.odoo.com` ni con `ioe_odoo_pilot`.
- Preflight SQL de solo lectura validó `@@SERVERNAME=dd7842d7ba7e`, base `IOEDESARROLLO`, endpoint configurado `172.16.100.40:1434`. Conteos: 1 `EMPRESA`, 11 `DAT_SUC`, 34,457 `DAT_CTRL_CTAS`, 3 `ENTIDAD_FISCAL` y 10 vínculos. Las 3 entidades y 10 vínculos siguen `PENDIENTE`. No se consultaron valores RFC/nombres ni se ejecutó DML.
- En Odoo autenticado, Ajustes muestra `Odoo 20.0+e (Edición Enterprise)`. Mi suscripción muestra plan personalizado mensual. En Settings, lista de CIMD MCP contiene `https://chatgpt.com/oauth/client.json` y el registro dinámico de clientes (DCR) está apagado. No se cambió ninguna opción.
- La app Contabilidad abre para la compañía `IOEB` (México); plan de cuentas lista 149 cuentas. El tablero muestra facturas y gastos por $0 y ofrece activar facturación electrónica. No se activó CFDI en Odoo; esto concuerda con timbrado local IOE. `/doc` abrió su interfaz, pero el catálogo de modelos quedó en blanco; no se considera inventario de esquema completado.
- Preflight HTTP sin credenciales a `https://ioeb.odoo.com`: `/web/login` devuelve 200 y JSON-2 `res.company/search_read` devuelve 401. Confirma dominio/ruta y control de autenticación; no equivale a lectura autenticada.
- Odoo 20 JSON-2 requiere plan Custom y bearer API key; documentación oficial: `https://www.odoo.com/documentation/20.0/developer/reference/external_api.html`. La clave hereda permisos del usuario y vence como máximo en tres meses. Odoo recomienda usuario bot con privilegios mínimos; la suscripción muestra un usuario activo, por lo que no crear otro ni asumir un cargo adicional. No se creó clave. Primera prueba prevista: lectura mínima de `res.company`, sin mostrar ni guardar el secreto en código, `.env`, logs o documentación.
- IOE conserva emisión/timbrado CFDI. Odoo será el libro contable de prueba: no activar timbrado, cancelación ni complementos desde Odoo. XML de CFDI emitidos localmente puede importarse como borrador con localización mexicana; validar importes/impuestos y UUID antes de contabilizar. No crear segunda factura CFDI.
- Alcance de información a mapear: (1) entidad fiscal validada, relación histórica sucursal-entidad y datos fiscales mínimos; (2) clientes/proveedores y productos/unidades con claves estables; (3) CFDI de venta, nota de crédito/cancelación y UUID/XML/PDF; (4) compras, XML de proveedor, recepción física y devolución a proveedor, separando recepción de factura y nota de crédito; (5) pagos PUE/PPD, recibos/complementos ya emitidos localmente, reembolsos y saldos; (6) cierre de caja, retiro, depósito, liquidación de tarjetas y comisiones; (7) bancos/extractos, conciliación, inventario/costo y saldos iniciales.
- No sincronizar directamente tablas SQL ni copiar `CSD`, `.KEY`, contraseñas PAC u otros secretos. IOE API será intermediario de lectura para `IOEDESARROLLO`; Odoo se consume por JSON-2 HTTPS. Mantener UUID CFDI + ID de origen como claves idempotentes. Poner en cuarentena entidades/vínculos pendientes, RFC contradictorios y documentos duplicados.
- MCP: Odoo 20 Online incluye servidor MCP nativo en `https://ioeb.odoo.com/mcp`; documentación oficial: `https://www.odoo.com/documentation/20.0/applications/productivity/ai/mcp_server.html`. Settings ya permite el cliente OAuth oficial de ChatGPT y DCR sigue apagado. Codex no tiene aún esta instancia conectada en el entorno. MCP puede servir para explorar modelos y funciones, y exponer herramientas de solo lectura; no reemplaza JSON-2 para sincronización determinista del backend IOE. No se expusieron herramientas ni se concedió acceso OAuth/API.
- API MCP y JSON-2 son accesos distintos: MCP usa la ruta `/mcp` y credencial/consentimiento MCP; backend IOE usa JSON-2 `/json/2`. No reutilizar una clave MCP como clave de sincronización. La creación de cualquier clave persistente queda pendiente de autorización puntual, almacenamiento seguro fuera de repositorio y selección del usuario/permisos.
- Sin lectura autenticada, alta Odoo, documento, asiento, DDL/DML, despliegue ni cambio en facturación. Siguiente compuerta: definir mecanismo de credencial de mínimo privilegio para la prueba JSON-2; luego ejecutar solo `res.company/search_read` y validar respuesta sin imprimir datos fiscales.

## Prueba autenticada y cruce fiscal — 2026-10-23

- El titular guardó una clave temporal JSON-2 con vigencia de un mes en `ioe-api/.env`, variable `API_ODOO`. El archivo está ignorado por Git. No registrar ni imprimir su valor. La primera clave expuesta accidentalmente en terminal fue revocada; esta clave nueva se usó solo para lecturas autorizadas.
- La sonda `deploy/odoo/probe-json2.mjs` respondió correctamente: JSON-2 HTTPS autenticado, `res.company/search_read`, una compañía devuelta. Se ajustó para leer únicamente `API_ODOO`, `ODOO_URL` y `ODOO_DATABASE` desde `ioe-api/.env` privado; la URL predeterminada es `https://ioeb.odoo.com`. El valor de la clave no se imprime, documenta ni pasa por CLI.
- `res.company` devuelve una compañía raíz con país, moneda y VAT configurados, sin compañías hijas. `fields_get` confirma campos `id`, `name`, `country_id`, `currency_id`, `vat`, `parent_id`, `child_ids`, `root_id` y `account_fiscal_country_id`; `company_registry` y `branch_ids` no existen en este esquema. No inferirlos ni consultarlos como campos disponibles.
- Cruce agregado de solo lectura contra `IOEDESARROLLO`: 3 entidades fiscales de persona física, todas `PENDIENTE`; 11 sucursales; 10 vínculos activos, todos `PENDIENTE`; 1 sucursal sin vínculo activo; 0 sucursales con vínculos activos múltiples. El VAT de la compañía Odoo no coincide con RFC candidato local en comparación exacta ni normalizada con prefijo `MX`/`MEX`. No se guardaron valores fiscales en la evidencia.
- Consecuencia: detener altas de compañías/sucursales y documentos. Titular/contador debe identificar qué entidad representa la raíz Odoo `IOEB` y validar las tres entidades y diez relaciones pendientes, incluido el vínculo faltante. No emparejar por nombre ni usar candidato pendiente para contabilizar.
- La prueba no escribió datos en Odoo ni SQL Server: sin compañías, contactos, facturas, pagos, pólizas, DDL o DML. Sin cambios en frontend, emisión CFDI, despliegue o producción.
- Próximo trabajo autorizado por etapas: (1) resolver cruce entidad fiscal ↔ sucursal con evidencia legal; (2) revisar catálogo de cuentas/impuestos y terceros con el contador; (3) diseñar eventos de venta/CFDI, notas de crédito, compras/recepciones/devoluciones, pagos PUE/PPD, caja, retiros, bancos/conciliación e inventario/costo; (4) solo después probar un lote borrador idempotente. IOE mantiene timbrado y Odoo no debe duplicar factura ni complemento.
- La credencial hereda permisos del usuario Odoo; aunque las llamadas de esta prueba son de lectura, la clave no es técnicamente read-only. Mantenerla fuera de logs y código, y revocarla al terminar la ventana de prueba. JSON-2 está documentado para Custom; Odoo recomienda usuario técnico de privilegio mínimo para automatización de largo plazo.

Fuentes oficiales: [Odoo 20 JSON-2](https://www.odoo.com/documentation/20.0/developer/reference/external_api.html), [Odoo 20 MCP](https://www.odoo.com/documentation/20.0/applications/productivity/ai/mcp_server.html), [Odoo 20 multiempresa](https://www.odoo.com/documentation/20.0/applications/general/companies/multi_company.html).

## Inventario contable de solo lectura — 2026-10-23

- JSON-2 devuelve 150 cuentas Odoo, todas activas, con código y asignadas a una compañía. La vista web había mostrado 149; la diferencia sigue sin explicación. Tipos: caja 2, activo corriente 30, activo fijo 15, activo no corriente 2, cuentas por cobrar 7, capital 3, gastos 30, costo directo 23, ingresos 4, otros ingresos 2, pasivo corriente 25 y cuentas por pagar 7.
- Odoo tiene 28 impuestos activos y 11 diarios activos: 1 banco, 1 caja, 7 generales, 1 compras y 1 ventas. Impuestos incluyen configuraciones etiquetadas IVA/ISR/IEPS/local, tasas y retenciones diversas; el conteo no demuestra que cada una aplique a IOE. No se leyeron datos de cuenta bancaria. Contador debe aprobar cuentas, impuestos y diarios antes de cualquier documento.
- En `IOEDESARROLLO`, `DAT_CAT_CTAS` contiene 7 cuentas globales sin `SUC`; `DAT_CTRL_CTAS` contiene 34,457 registros, usa 6 de esos códigos y muestra 8 sucursales distintas. Coincidencia exacta normalizada entre los 7 códigos locales y códigos Odoo: 0.
- La fuente del módulo IOE usa `DAT_CTRL_CTAS` como control/subledger asociado a cliente, folio y sucursal; su esquema tiene `IMPT` y no columnas explícitas de debe/haber. Por sí sola no prueba que cada fila sea póliza contable balanceada. No cargar sus 34,457 filas directamente como asientos; primero identificar eventos originales, contrapartidas, impuestos, pagos y reglas de reconocimiento.
- Sin escrituras. Próxima compuerta: resolver entidad legal de `IOEB`, documentar crosswalk de cuentas/impuestos aprobado por contador y relacionar cada evento de IOE con origen, UUID/folio idempotente, cuenta débito/crédito, impuesto, tercero, fecha, sucursal y liquidación. Después probar borradores aislados; no contabilizar automáticamente.
- Odoo documenta que cada llamada JSON-2 usa transacción SQL independiente y no se puede encadenar junto con otras llamadas como una sola transacción. Diseñar reintentos idempotentes y conciliación de estados; creación de borrador y contabilización quedan como fases distintas, sin asumir atomicidad entre solicitudes.

## Decisión de estructura multiempresa — 2026-10-23

- El titular define que las tres entidades fiscales de IOE se administrarán en Odoo como **tres compañías independientes**, cada una con identidad fiscal y contabilidad propias. No representarlas como sucursales Odoo de una sola compañía.
- En `IOEDESARROLLO` hay tres registros candidatos en `ENTIDAD_FISCAL`, todos `PENDIENTE`; diez vínculos sucursal-entidad activos también `PENDIENTE`; una de las once sucursales no tiene vínculo activo. Esta decisión fija la arquitectura destino, pero no valida RFC, nombre legal, régimen, domicilio ni asignación de sucursales.
- Odoo Online contiene tres compañías raíz: ID 1 corresponde provisionalmente a entidad candidata 1; IDs 2 y 3 se crearon desde los candidatos 2/3. Las tres son empresas independientes con `parent_id` vacío. Sus identidades aún requieren cotejo con constancias/contador; no usar registros pendientes para operación fiscal.
- Odoo advierte que una compañía configurada como matriz no puede convertirse después en sucursal. La estructura actual de tres compañías independientes sigue la instrucción del titular. Las sucursales IOE se asignarán a la entidad fiscal validada por periodo; dentro de cada compañía Odoo se decidirá si cada ubicación requiere sucursal Odoo o dimensión analítica/almacén, según reporte y acceso requeridos.
- Compañías 1/2/3 tienen nombre, RFC, régimen y CP candidatos. El domicilio ID 2 proviene de la captura fiscal aportada por el titular. El domicilio fiscal de ID 3 queda vacío en Odoo: DF04 solo contiene dirección de sucursal, no evidencia fiscal. Antes de operar, confirmar domicilios, moneda, accesos permitidos y aislamiento de datos; asignar compañía predeterminada explícita. No activar transacciones intercompañía mientras no haya un caso autorizado.
- El plan de cuentas, impuestos, diarios de ventas/compras, cuentas de caja/banco y reglas de conciliación deben revisarse por compañía con el contador. El cruce de siete cuentas globales IOE contra cuentas Odoo permanece sin coincidencias exactas y no está aprobado. No asumir que un impuesto o diario actual aplica igual a las tres entidades. Odoo indica que cada compañía mantiene su propio plan contable; compartir cuentas solo cuando el diseño lo justifique.
- Mantener IOE como emisor/timbrador CFDI. Por entidad, mapear eventos de venta/nota de crédito, compras/recepciones/devoluciones a proveedor, cobros y complementos, caja/retiros, bancos/liquidaciones e inventario/costo. `DAT_CTRL_CTAS` no basta para formar pólizas balanceadas; no importar sus filas como asientos.
- Integración deberá enviar cada evento al `company_id` validado, incluir clave idempotente de origen y RFC/UUID cuando aplique, y cotejar la compañía devuelta al leer/escribir. JSON-2 mantiene llamadas separadas por transacción; registrar estado, reintentos y conciliación por compañía.

### Compuertas siguientes

1. Titular/contador valida las tres entidades y los diez vínculos candidatos; resuelve la sucursal sin vínculo y documenta vigencias. No requiere compartir RFC personales por chat.
2. La raíz `IOEB` ya representa provisionalmente la entidad candidata ID 1. Confirmar con contador RFC, nombre legal, régimen, domicilio y vínculos con constancia fiscal vigente antes de habilitar operaciones.
3. Aprobar por compañía el catálogo de cuentas, impuestos, diarios, caja/bancos, terceros y reglas de reconocimiento; documentar el cruce con los eventos de IOE.
4. Compañías 1/2/3 ya creadas como maestros candidatos. Tras validar identidades, revisar usuarios, aislamiento, cuentas/impuestos/diarios y la asignación de sucursales; cotejar domicilios ID 2/3 con constancias fiscales. Mantener sin documentos ni asientos.
5. Repetir lecturas JSON-2 para confirmar las tres compañías, RFC enmascarados en evidencia, permisos y aislamiento. Después probar borradores idempotentes de una muestra por entidad; no contabilizar hasta UAT firmada.

Fuentes oficiales Odoo 20: [Compañías y sucursales](https://www.odoo.com/documentation/20.0/applications/general/multi_companies.html), [Multiempresa](https://www.odoo.com/documentation/20.0/applications/general/companies/multi_company.html), [Contabilidad y multiempresa](https://www.odoo.com/documentation/20.0/applications/finance/accounting.html), [Usuarios y compañías permitidas](https://www.odoo.com/documentation/20.0/applications/general/users/manage_users.html).

## Alta de compañías 2 y 3 en Odoo Online — 2026-10-23

- **Autorización y destino:** el titular autorizó crear las compañías 2 y 3 en `https://ioeb.odoo.com`. No se modificó CT105, `IOELOCAL` ni producción IOE.
- **Preflight:** autenticación JSON-2; una sola compañía previa (raíz ID 1, RFC coincidente con candidato IOE 1); sin duplicados de RFC en compañías/contactos; México disponible; cero movimientos, pagos y líneas de estado bancario. En `IOEDESARROLLO`, cada RFC de ID 2/3 conserva un único CSD activo/vigente y nombre/régimen/CP coincidentes.
- **Alta:** Odoo creó `res.company` IDs 2 y 3 como compañías raíz independientes, con país y país fiscal México y moneda MXN. Contactos fiscales asociados recibieron nombre, RFC, régimen y CP del CSD. ID 2 recibió domicilio/calle y ciudad/estado de la constancia aportada por el titular. ID 3 quedó inicialmente sin calle fiscal; DF04 no se usó como domicilio fiscal y su domicilio se completó con evidencia posterior.
- **Postflight:** coincidieron compañía/contacto, RFC, régimen, CP y país; ambas tienen `parent_id` vacío. ID 2 conserva siete relaciones sucursal-entidad y ID 3 una; todas siguen `PENDIENTE` en IOE, al igual que las diez relaciones del proyecto. Odoo contiene tres compañías y no hay documentos `account.move`, `account.payment` ni `account.bank.statement.line`.
- **Configuración contable automática:** al crear las compañías mexicanas, Odoo dejó 150 cuentas, 28 impuestos y 11 diarios por compañía. Totales pasaron de 150/28/11 a 450/84/33; incremento 300/56/22. Son plantillas/configuración por empresa, no un cruce aprobado con cuentas IOE ni movimientos financieros. Odoo documenta que el país elegido para una compañía adicional determina la localización fiscal y plan estándar predeterminados ([plan de cuentas](https://www.odoo.com/documentation/20.0/applications/finance/accounting/get_started/chart_of_accounts.html)). No editar esos valores hasta revisión del contador.
- **Evidencia privada:** preflight, aplicación y postflight en `outputs/integracion_entidades_fiscales_dev_20261021/` (`preflight_alta_empresas_2_3_odoo_20261023.json`, `aplicacion_alta_empresas_2_3_odoo_20261023.json`, `postflight_alta_empresas_2_3_odoo_20261023.json`). Sin PII fiscal en evidencia, sin clave API.
- **Sin cambios de software o SQL por el alta:** no se modificó esquema IOE, SP, triggers, datos comerciales, frontend, imagen, commit o despliegue. Scripts de operación/evidencia están bajo `outputs/` y no deben versionarse.
- **Pendiente:** el contador valida constancias e identidad de las tres personas físicas, domicilios ID 2/3 y vínculos; aprobar cruce de cuentas/impuestos/diarios; configurar usuarios y comprobar aislamiento por compañía. IOE mantiene el timbrado local. No importar ni contabilizar CFDI, ventas, compras, pagos, caja/bancos o inventario todavía.

## Solicitud de reutilizar compañía raíz IOEB — 2026-10-23

- El titular solicita editar la compañía raíz Odoo `IOEB` para que represente una de las tres entidades fiscales de IOE; después se agregarían las otras dos como compañías independientes. No conservar `IOEB` como empresa cuarta por defecto.
- Sí es posible editar una compañía existente: Odoo documenta `Ajustes → Usuarios y empresas → Empresas`; al seleccionar un registro se puede modificar su ficha, que incluye nombre legal, domicilio y Tax ID/RFC. No es necesario crear otra compañía para actualizar esa ficha.
- La compañía actual tiene VAT que no coincide con ninguno de los tres candidatos de `IOEDESARROLLO`. El titular seleccionó `ID_ENTIDAD_FISCAL=1` para `IOEB`; preflight SQL de solo lectura confirmó estado `PENDIENTE`, RFC candidato presente, nombre legal/régimen/CP/domicilio/referencia/validador/fecha de validación ausentes y dos vínculos pendientes. Esta selección no basta para cargar identidad fiscal.
- Al corte de esta revisión previa aún no se había ejecutado `res.company/write` ni cambio por UI. La instrucción posterior del titular y la actualización candidata están registradas abajo. Los campos requieren cotejo contra constancia fiscal vigente antes de usarse en operaciones; no hace falta compartir RFC en chat.
- Preflight previo a escritura: releer la compañía objetivo, contar movimientos/facturas/pagos existentes y confirmar permisos; capturar estado anterior en evidencia privada; cambiar solo datos de identidad aprobados; releer la ficha y comprobar acceso/compañía activa. No cambiar plan contable, impuestos, diarios ni documentos en esta operación.
- Después, crear las otras dos compañías solo con identidades verificadas; revisar localización mexicana, cuentas/impuestos/diarios y accesos por empresa antes de importar borradores. El cambio de identidad no autoriza emitir CFDI ni contabilizar.

Fuente oficial: [Odoo 20 — editar compañía y campos Tax ID](https://www.odoo.com/documentation/20.0/applications/general/multi_companies.html).

## Completar candidato fiscal ID 1 desde IOE — 2026-10-23

- En `IOEDESARROLLO`, el RFC candidato de `ENTIDAD_FISCAL` ID 1 coincide con una fila CSD activa/vigente y con `DAT_SUC.RFC` de `DF01` y `DF16`. CSD aporta nombre, régimen y CP; `DF01` aporta la única dirección no vacía entre esos dos vínculos. `EMPRESA` solo aporta el registro operativo `IOE BUSINESS` y no contiene RFC, CP ni domicilio.
- Se actualizaron en una transacción cuatro campos candidatos de ID 1: `NOMBRE_LEGAL`, `REGIMEN_FISCAL`, `CP_FISCAL` y `DOMICILIO_FISCAL`. No se cambió el RFC ni el estado. Referencia/validador/fecha de validación siguen vacíos; entidad y relaciones continúan `PENDIENTE`.
- En ese corte, el domicilio de sucursal no demostraba por sí mismo domicilio fiscal y `res.company/write` aún no se había ejecutado. La actualización candidata posterior se registra en la sección siguiente; el domicilio sigue requiriendo cotejo con constancia vigente.
- Postflight: servidor `dd7842d7ba7e`, base `IOEDESARROLLO`, estado `ONLINE/READ_WRITE`; coincidencia de los cuatro campos candidatos con las fuentes; dos vínculos pendientes; auditoría nueva ID 14. Sin cambios en tablas operativas/financieras, CSD, timbrado, Odoo o producción.
- Script versionado: `sql/2026-10-21_entidades_fiscales_dev/02_completar_candidato_id1.sql`. Evidencia pre/post y reversa condicionada permanecen fuera de Git en `outputs/integracion_entidades_fiscales_dev_20261021/`.
- Siguiente paso después de la actualización: cotejar datos con constancia fiscal y completar referencia, responsable y vigencias de sucursal. No crear asientos ni documentos hasta validar identidad y mapa de sucursales.

## Actualizar compañía raíz Odoo con candidato ID 1 — 2026-10-23

- **Autorización/objetivo:** el titular seleccionó `ID_ENTIDAD_FISCAL=1` para reutilizar la raíz `IOEB` y pidió completar sus datos desde IOE. Operación ejecutada contra `https://ioeb.odoo.com`; no contra CT105.
- **Preflight fresco:** origen `IOEDESARROLLO` en servidor `dd7842d7ba7e`; candidato y coincidencias CSD/DF01/DF16 volvieron a validarse. En Odoo se confirmó compañía raíz ID 1, pareja `res.partner` ID 1, México como país y país fiscal, sin compañías hijas y sin movimientos `account.move`, pagos ni líneas bancarias.
- **Campos actualizados:** compañía `res.company`: nombre y VAT; contacto fiscal `res.partner`: nombre, VAT, domicilio, CP y régimen fiscal mexicano. Se conservaron país y país fiscal México. No se crearon documentos, pólizas, pagos, bancos, compañías adicionales ni sucursales.
- **Postflight:** los siete valores de identidad consultados coincidieron con el candidato; México se conservó y los conteos contables siguieron en cero. El maestro IOE ID 1 y sus dos relaciones continúan `PENDIENTE`; Odoo no refleja ese estado de validación.
- **Límite fiscal:** nombre/régimen/CP vienen del CSD registrado; el domicilio se tomó de `DAT_SUC.DF01`. La dirección de una sucursal no demuestra domicilio fiscal. Cotejar todos los datos con constancia fiscal vigente y contador antes de usar la compañía para facturar o contabilizar.
- **Reversa:** manifiesto privado `outputs/integracion_entidades_fiscales_dev_20261021/reversa_odoo_ioeb_id1_20261023.json`; no ejecutado. Requiere nueva autorización y guardas de `write_date`/cero movimientos.
- **Evidencia privada:** preflight, aplicación y reversa en `C:/Users/DAVID/proyectos/proyecto_ioe/outputs/integracion_entidades_fiscales_dev_20261021/`. No agregar a Git.
- **API usada:** Odoo JSON-2 autenticada con la variable privada `API_ODOO`; referencia oficial [API externa JSON-2 de Odoo 20](https://www.odoo.com/documentation/20.0/developer/reference/external_api.html).
- **Pendiente:** validar las tres identidades y sus asignaciones con contador; cotejar domicilio candidato de ID 2 con constancia fiscal vigente; después preparar compañías Odoo 2/3 independientes, cuentas, impuestos, diarios, bancos y permisos. No promover datos ni configuración a producción IOE sin preflight, respaldo, destino y autorización propios.

## Completar candidatos fiscales 2 y 3 desde IOE — 2026-10-23

- **Origen/destino:** solo `IOEDESARROLLO`, servidor `dd7842d7ba7e`. La revisión y escritura usaron túnel SSH con verificación de base; no se usó `IOELOCAL`.
- **ID 2:** se copió nombre, régimen y CP desde su único CSD activo/vigente. Siete sucursales tienen RFC coincidente y vínculos pendientes. `DF05` y `DF14` guardan domicilios distintos; en ese corte el domicilio fiscal quedó vacío para no escoger una sucursal como sede fiscal. La actualización posterior desde evidencia del titular se registra abajo.
- **ID 3:** se copió nombre, régimen y CP desde su único CSD activo/vigente. La sucursal `DF04` es su único vínculo y tiene una dirección candidata; se guardó como `DOMICILIO_FISCAL` pendiente de cotejo con constancia.
- **Postflight:** metadatos CSD coinciden con los campos candidatos de ambas entidades; 8 vínculos siguen pendientes. Auditoría ID 15 para ID 2 e ID 16 para ID 3. `EMPRESA` sigue siendo agrupación operativa sin RFC/domicilio fiscal; todas las sucursales fuente señalan `IDEMPRESA=1`.
- **Reversa:** privada, condicionada por rowversion y no ejecutada; requiere autorización fresca. Evidencia en `outputs/integracion_entidades_fiscales_dev_20261021/`.
- **Límite:** no se crearon compañías Odoo 2/3 ni documentos/asientos. CSD vigente demuestra metadatos registrados, no identidad legal validada. Contador debe confirmar las tres fichas, domicilio de ID 2 y asignaciones sucursal-entidad antes de activar operación. IOE conserva timbrado CFDI.

## Domicilio fiscal candidato ID 2 aportado por titular — 2026-10-23

- **Origen/destino:** imagen aportada por el titular; preflight fresco y escritura solo en `IOEDESARROLLO`, servidor `dd7842d7ba7e`. CP de imagen coincide con candidato y CSD vigente único.
- **Cambio:** solo `dbo.ENTIDAD_FISCAL.DOMICILIO_FISCAL` para ID 2; auditoría ID 17. La dirección completa no se replica en documentación ni evidencia privada.
- **Postflight:** coincidencia exacta con entrada confirmada en proceso; estado `PENDIENTE`, siete vínculos `PENDIENTE` y campos de validación oficial vacíos. Sin cambios operativos/financieros, Odoo, CT105 ni producción.
- **Evidencia/reversa privada:** preflight, aplicación, postflight y reversa en `outputs/integracion_entidades_fiscales_dev_20261021/`; la reversa está condicionada por rowversion y requiere autorización nueva.
- **Pendiente:** contador coteja domicilio, RFC y relación legal sucursal-entidad con constancia vigente. Aún no habilita empresa Odoo ni asiento contable.

## Preflight contable y fuentes IOE — 2026-10-23

- **Conexión técnica:** `https://ioeb.odoo.com/web/version` respondió `20.0+e`; JSON-2 autenticado con `API_ODOO` funcionó. `account`, `l10n_mx`, `l10n_mx_edi` y `l10n_mx_reports` aparecen instalados. La consulta no devolvió `l10n_mx_xml_polizas`; confirmar disponibilidad y necesidad antes de incluirlo. El inventario contable previo del piloto registró 150 cuentas activas, 28 impuestos y 11 diarios; la compañía raíz sigue siendo la única.
- **Cuentas:** `account.account` usa `company_ids` y `active`; en esta instancia no existe campo `deprecated`. Revisión de solo lectura: 7 filas `DAT_CAT_CTAS` contra 150 cuentas activas por compañía; cero coincidencias exactas de código en las tres compañías. Libro de revisión con 21 filas de cruce pendiente y 450 cuentas Odoo en `outputs/odoo_cuentas_revision_20261023/Revision_contable_IOE_Odoo_20261023.xlsx`. Ningún vínculo está aprobado.
- **Interpretación de fuente:** `CatCtasService` y `CtrlCtasService` usan `DAT_CAT_CTAS`/`DAT_CTRL_CTAS` para control auxiliar por sucursal, cliente, folio y saldo; no tratar `DAT_CAT_CTAS` como plan general de cuentas. El catálogo requiere una definición contable aprobada por el contador y cruce explícito por entidad.
- **Ventas y devoluciones:** `PV_CTR_FOL_ASVR` conserva folios, importes, formas resumidas y referencia de origen; `PV_CTR_FOL_FORM` conserva detalle por forma de pago. Mantener timbrado CFDI en IOE. Llevar UUID/XML/PDF y folio de origen a Odoo una sola vez; conciliar nota de crédito con factura original y reembolso como evento separado. No añadir póliza resumen equivalente a factura contabilizada.
- **Cuentas por cobrar/pagos:** `DAT_CTRL_CTAS` y `DAT_CTR_DOC` registran movimientos auxiliares de cliente/documento. Cruzar estos con CFDI, pagos PUE/PPD y complementos ya emitidos; no duplicar ingreso, cuenta por cobrar ni cobro cuando Odoo registre la factura y su pago.
- **Compras e inventario:** `REC_CAB_PED`/`REC_CTRL_DOC_REC` representan orden y recepción; `DAT_MB51` contiene movimientos de inventario. La recepción física se separa de la factura proveedor. Devoluciones (`DEV_CTRL_PROVD`) y movimiento 102 no equivalen a nota de crédito/AP: relacionar con XML/UUID del proveedor y asiento de devolución. En borrador de factura proveedor, la localización mexicana permite adjuntar XML en chatter para actualizar UUID y consultar estado SAT; revisar proveedor, impuestos, importes y duplicados antes de contabilizar.
- **Caja/bancos:** `DAT_FORM`, `PV_FORM_TIPOTRAN` y `PV_CTR_FOL_FORM` describen formas de cobro; `DAT_FORM_ENTR_OPV_SVR` registra cierre por OPV/terminal/forma; `DAT_FORM_FIN` registra arqueo/diferencia y `DAT_RET_CTR_SVR` retiros. La búsqueda de metadatos no encontró tablas de banco/extracto. Esto no acredita conciliación bancaria: obtener extractos por entidad desde el banco e importarlos a Odoo (CAMT.053, CSV, XLSX, OFX o QIF); conciliar contra pagos, depósitos, comisiones y retiros.
- **MCP:** versión Odoo `20.0+e` y documentación oficial confirman servidor nativo `/mcp`, con OAuth recomendado y herramientas/acciones configurables. El inventario de este entorno Codex no incluye conexión Odoo MCP y no se concedió OAuth. No reutilizar `API_ODOO` como credencial MCP. Para exploración, mantener solo acciones de lectura; `Readonly Tool` es una indicación al cliente, no una restricción técnica. Para sincronización contable usar integración JSON-2 determinista.
- **Diseño técnico:** JSON-2 funciona; cada llamada tiene su propia transacción. Para escrituras relacionadas, diseñar método atómico/idempotente y claves de origen (entidad validada + tipo/fuente + folio/UUID); no encadenar llamadas que puedan dejar factura/pago a medias.
- **Siguiente compuerta:** contador valida identidades y vínculos sucursal-entidad, domicilios ID 2/3, cuentas por compañía, impuestos, diarios y reglas de cobro. Después preparar lote borrador controlado y comparar totales por entidad/período. Esta revisión no lee archivos SMB, no crea asientos/facturas/pagos, no cambia IOELOCAL ni producción.

Fuentes oficiales Odoo 20: [API JSON-2](https://www.odoo.com/documentation/20.0/developer/reference/external_api.html), [MCP](https://www.odoo.com/documentation/20.0/applications/productivity/ai/mcp_server.html), [localización México](https://www.odoo.com/documentation/20.0/es_419/applications/finance/fiscal_localizations/mexico.html), [conciliación bancaria](https://www.odoo.com/documentation/20.0/applications/finance/accounting/bank/reconciliation.html), [importación de transacciones bancarias](https://www.odoo.com/documentation/20.0/applications/finance/accounting/bank/transactions.html).

## Domicilio fiscal ID 3 y revisión de cuentas — 2026-10-23

- El titular aportó imagen de domicilio fiscal para entidad candidata ID 3. En `IOEDESARROLLO`, el valor previo de `ENTIDAD_FISCAL.DOMICILIO_FISCAL` coincidía exactamente con dirección de sucursal DF04; se sustituyó por la dirección fiscal de la evidencia. Auditoría ID 18. CP coincide con ficha/CSD y domicilio quedó cotejado por lectura posterior.
- La entidad ID 3 y su vínculo único con sucursal siguen `PENDIENTE`; referencia, usuario y fecha de validación oficial siguen vacíos. No se cambió RFC, régimen, CSD/KEY, sucursal, facturación ni tabla operativa.
- En Odoo Online se actualizó contacto fiscal `res.partner` ID 10 de compañía `res.company` ID 3: calle, colonia/referencias, CP, localidad, estado Veracruz (código Odoo `VER`) y país México. Lectura posterior confirmó los campos. No se modificó identidad legal de compañía.
- Extracción de solo lectura: 150 cuentas activas por cada una de las tres compañías (450); `DAT_CAT_CTAS` 7 filas; `DAT_CTRL_CTAS` 34,457 registros en 8 sucursales; cero coincidencias exactas de código en 21 pares cuenta-origen/compañía. No se infirió equivalencia ni se aprobaron cuentas.
- Archivo para contador: `outputs/odoo_cuentas_revision_20261023/Revision_contable_IOE_Odoo_20261023.xlsx`. Incluye resumen, cruce editable pendiente, catálogo IOE de origen y detalle de cuentas Odoo por compañía.
- Evidencia operativa privada: preflight, aplicación, postflight y reversa bajo `outputs/integracion_entidades_fiscales_dev_20261021/`; la dirección completa y credenciales no se copian aquí. Reversa SQL/Odoo no ejecutada; requiere autorización nueva.
- Sin movimientos contables, pagos, documentos bancarios, facturas ni asientos creados; sin cambios en `IOELOCAL`, producción, CT105, DDL, SP, triggers, frontend/backend, commits o despliegues. Pendiente: contador valida las tres identidades/domicilios y vínculos; dicta cuenta Odoo por cada código IOE; aprueba impuestos, diarios y reglas de caja/bancos antes de documentos.

## Esquema inicial de equivalencias IOE–Odoo — 2026-10-23

- **Diseño:** `DAT_CAT_CTAS.CTA` conserva su función como clave operativa IOE. No reescribirla para imitar cuentas Odoo ni alterar `DAT_CTRL_CTAS`; la equivalencia se separa por entidad, compañía, sucursal opcional, evento, rol del apunte, signo y entorno.
- **Tablas:** `dbo.INT_ODOO_CTA_MAP` mantiene el crosswalk y su estado (`PENDIENTE`, `VALIDADA`, `INACTIVA`); `dbo.INT_ODOO_CTA_MAP_AUDIT` queda como destino para eventos que la API deberá registrar en la misma transacción. No existe trigger de auditoría. FKs apuntan a entidad fiscal, `DAT_CAT_CTAS.CTA`, `DAT_SUC.SUC` y al mapeo auditado.
- **Aplicación:** solo `IOEDESARROLLO`, servidor `dd7842d7ba7e`. Preflight previo vio estructura ausente; luego se verificó estructura completa: 2 tablas, 2 PK, 4 FK, 9 CHECK, 5 defaults, 4 índices secundarios, cero triggers y cero filas. Conteos operativos antes/después: 3 entidades, 10 vínculos, 7 cuentas fuente y 34,457 movimientos; todos estables.
- **Respaldo/evidencia:** `/var/opt/mssql/data/IOEDESARROLLO_pre_odoo_cta_map_20261023231459.bak`, `COPY_ONLY` + `CHECKSUM`; `RESTORE VERIFYONLY` pasó. Postflight privado: `outputs/odoo_cuenta_map_dev_20261023/postflight_20261023232043.json`. El cliente agotó timeout esperando la primera respuesta; postflight y metadatos del servidor confirman respaldo y DDL completos.
- **Reversa:** `sql/2026-10-23_odoo_cuenta_map_dev/02_reversa.sql`, desactivada (`@Aplicar=0`), solo permite retirar ambas tablas si siguen vacías. No ejecutada.
- **Pendiente funcional:** aún no hay servicio API ni filas de equivalencia. Contador debe validar entidades/sucursales y aprobar cuenta, evento, impuestos, diarios y reglas de caja/bancos por compañía. Después, resolver exclusivamente `VALIDADA`, rechazar cruces ambiguos y crear cuentas Odoo idempotentemente; comenzar con borradores y proteger UUID/folio contra duplicidad CFDI/asiento.
- **Sin escrituras:** Odoo Online, IOE producción, CT105, API funcional y Flutter sin cambios; no se crearon cuentas, documentos, pagos ni pólizas.

## Propuestas de equivalencia registradas en IOEDESARROLLO — 2026-10-23

- **Aplicación:** con autorización del titular se insertaron 33 propuestas de cruce y 33 eventos de auditoría en `172.16.100.40:1434/IOEDESARROLLO`, servidor SQL `dd7842d7ba7e`. Cada una de 11 combinaciones cuenta IOE/evento/signo se replica para entidades 1→compañía Odoo 1, 2→2 y 3→3. Todas están `PENDIENTE`, con aprobador y fecha vacíos; no se cambiaron a validadas.
- **Destinos comprobados:** códigos `101.01.01`, `105.01.01`, `206.01.01`, `403.01.01`, `601.84.01` y `601.84.02` aparecen una vez por compañía, activos, con compañía exclusiva, tipo y conciliabilidad esperados. No hizo falta crear ni modificar cuentas Odoo. No hubo escrituras Odoo ni movimientos contables.
- **Criterios candidatos:** CxC `101001001` (CMOV 801/802) y `101001002` (CMOV 601/602) → `105.01.01`; caja chica `101001003` (CMOV 912) → `101.01.01`; apartados `210001019` (CMOV 611/612) → `206.01.01`; sobrante/faltante OPV `704010003` (CMOV 901/902) → `403.01.01`/`601.84.02`; gasto `704010004` (CMOV 914) → `601.84.01`.
- **Exclusiones:** tres movimientos `CLSD=0` carecen de clase para clasificarlos; `110001020` no tiene movimientos y su nombre no define naturaleza contable. Sin mapa para ellos. El signo de `IMPT` documenta movimiento de IOE y no se traduce automáticamente a débito/crédito Odoo. Las propuestas no autorizan contabilizar ventas, cobros, devoluciones, compras, inventario ni caja/bancos.
- **Integridad fuente:** `DAT_CAT_CTAS.CTA`, `DAT_CTRL_CTAS`, entidades, sucursales y movimientos comerciales no se modificaron. Los 3 candidatos fiscales y sus 10 vínculos siguen pendientes; no hay resolvedor API, sincronización ni prueba de documentos todavía.
- **Postflight:** 33 mapas, 33 auditorías, 0 validadas; 3 entidades, 10 vínculos, 7 cuentas fuente y 34,457 movimientos. Backup `COPY_ONLY/CHECKSUM/VERIFYONLY`: `/var/opt/mssql/data/IOEDESARROLLO_pre_odoo_map_candidates_20261023234442.bak`. Evidencia privada bajo `outputs/odoo_cta_map_candidates_dev_20261023/`.
- **Reversa:** `sql/2026-10-23_odoo_map_candidates_dev/02_reversa.sql`, acotada a las 33 filas exactas de la propuesta si siguen pendientes y sin auditorías adicionales; no ejecutada.
- **Siguiente compuerta:** validar entidades/vínculos y obtener aprobación contable individual de cuenta, evento, signo y alcance por compañía; entonces cambiar a `VALIDADA` con auditoría y crear resolvedor idempotente. Antes de documentos, probar en borrador con totales controlados por empresa y período.

## Alta de sucursales bajo compañías Odoo — 2026-10-23

- **Autorización y destino:** el titular autorizó crear sucursales y dejar constancias/validación fiscal pendientes. Destino `https://ioeb.odoo.com`, versión `20.0+e`; CT105 local no se tocó.
- **Preflight:** SQL Server `dd7842d7ba7e`, base `IOEDESARROLLO`; 3 entidades y 10 relaciones esperadas, todas `PENDIENTE`, sin fechas efectivas. Compañías raíz Odoo 1–3 coincidieron con las entidades; no había sucursales duplicadas. Conteos Odoo previos: 0 movimientos, 0 pagos y 0 líneas bancarias.
- **Alta por API JSON-2:** se crearon registros `res.company` con `name` igual al código de sucursal y `parent_id` de su entidad. No se enviaron RFC, domicilios, CSD/KEY, impuestos, contactos fiscales ni datos de asientos.

| Entidad / compañía raíz | Código de sucursal | ID `res.company` |
|---|---|---:|
| 1 | DF01 | 4 |
| 1 | DF16 | 5 |
| 2 | DF02 | 6 |
| 2 | DF03 | 7 |
| 2 | DF05 | 8 |
| 2 | DF06 | 9 |
| 2 | DF10 | 10 |
| 2 | DF14 | 11 |
| 2 | OM01 | 12 |
| 3 | DF04 | 13 |

- **Postflight:** JSON-2 confirmó diez códigos únicos, padres 1/2/3 correctos y sucursales activas; repetición idempotente no creó duplicados. La UI interna de Odoo mostró las diez sucursales agrupadas bajo sus tres compañías. `account.move`, `account.payment` y `account.bank.statement.line` permanecen en cero. Relectura de `IOEDESARROLLO`: tres entidades y diez vínculos siguen `PENDIENTE`; sin cambios SQL.
- **Evidencia privada:** `outputs/odoo_branch_create_20261023/branch-create-evidence.json`; script operativo `outputs/odoo_branch_create_20261023/create-branches.mjs`. No guardar `.env` ni claves en evidencia o Git.
- **Alcance contable:** estos registros son ramas organizativas bajo tres compañías legales independientes. Odoo permite a la compañía matriz acceder a datos de sucursales; revisar herencia de plan/impuestos/diarios y permisos antes de UAT contable ([Compañías Odoo 20](https://www.odoo.com/documentation/20.0/applications/general/multi_companies.html), [Contabilidad Odoo 20](https://www.odoo.com/documentation/20.0/applications/finance/accounting.html)).
- **Pendiente:** recibir/cotejar constancias fiscales y confirmar fecha efectiva/referencia de cada relación; validar entidades y sucursales en IOE; comprobar usuarios/aislamiento y configuración contable por compañía. No activar el resolvedor ni importar CFDI, ventas, compras, pagos, caja/bancos o inventario hasta completar esas puertas.

## Datos de sucursales, vigencia histórica y corte contable — 2026-10-23

- **Autorización/destino:** titular autorizó completar datos faltantes de `DAT_SUC` en `IOEDESARROLLO` y replicar datos disponibles a contactos de sucursal en Odoo Online. No se tocó `IOELOCAL`, producción, CT105, `FACT_CSD` ni datos financieros.
- **RFC de sucursales:** se conserva RFC en compañía raíz y RFC vacío en sucursal. En la localización mexicana de Odoo, los datos de facturación se heredan de la compañía matriz, con código postal de sucursal como excepción; si se asigna RFC a sucursal, Odoo puede tomar identidad/datos fiscales propios. Esto no cambia por sí solo debe/haber, pero puede cambiar identidad fiscal de documentos emitidos por Odoo. IOE conserva timbrado Facturify; no emitir CFDI desde estas ramas. Ver [Localización mexicana Odoo 20](https://www.odoo.com/documentation/20.0/es_419/applications/finance/fiscal_localizations/mexico.html).
- **DAT_SUC:** DF02 tomó dirección y contacto de DF01; DF06 y DF16 recibieron domicilio y contacto proporcionados por el titular. DF03, DF10 y OM01 continúan sin dirección/contacto en la fuente, por lo que no se copiaron a Odoo. CP de DF01, DF02, DF04 y DF14 no está disponible en `DAT_SUC`; no iniciar emisión CFDI Odoo con estos datos incompletos.
- **Odoo JSON-2:** siete contactos de sucursal actualizados (DF01, DF02, DF04, DF05, DF06, DF14, DF16); tres omitidos por falta de domicilio/contacto fuente (DF03, DF10, OM01). Postflight confirma tres RFC de raíz, cero RFC de rama y cero facturas, asientos, pagos o líneas bancarias creados.
- **`VIGENTE_DESDE`:** por instrucción del titular, se usó el folio más antiguo de `PV_CTR_FOL_ASVR`, excluyendo filas de QA. Ocho vínculos recibieron fecha; DF02 y DF03 no tienen folios y conservan NULL. Esta fecha no es corte contable ni valida por sí sola identidad fiscal.

| Sucursal | Folios consultados | Folio más antiguo / `VIGENTE_DESDE` |
|---|---:|---|
| DF01 | 250,150 | 2022-08-29 |
| DF16 | 1,396 | 2023-02-01 |
| DF02 | 0 | Sin folios; NULL |
| DF03 | 0 | Sin folios; NULL |
| DF05 | 10,437 | 2024-10-01 |
| DF06 | 13,634 | 2023-02-01 |
| DF10 | 297 | 2023-02-01 |
| DF14 | 1,789 | 2023-02-01 |
| OM01 | 55 | 2024-02-03 |
| DF04 | 30,877 | 2024-07-15 |

- **Separación de periodos:** el periodo contable de prueba solicitado es 2026-10-01 a 2026-10-31; corte de operación contable esperado es 2026-11-01. No importar historia anterior al 1 de octubre por el valor de `VIGENTE_DESDE`. Al 2026-10-23, `PV_CTR_FOL_ASVR` contiene 5,378 folios de octubre en ocho sucursales; cifra parcial y solo de folios de venta, no conteo de todos los eventos contables. Cerrar conciliación de octubre después del día 31.
- **Prueba aislada:** usar copia de Odoo Online neutralizada para pruebas, no la base principal. Odoo indica que duplicados de prueba se neutralizan y expiran a los 15 días; renovar la copia o exportar resultados antes del vencimiento ([Odoo Online 20](https://www.odoo.com/documentation/20.0/administration/odoo_online.html)).
- **Validaciones que aún bloquean UAT del resolvedor:** las 3 entidades y los 10 vínculos siguen `PENDIENTE` en SQL; faltan referencias/usuario/fecha formal de validación. Los 33 mapas contables están `VALIDADA` (11 por entidad), pero cubren cuenta IOE → cuenta Odoo por evento/signo, no plantillas balanceadas Debe/Haber ni todos los procesos. `OdooAccountMapService` rechaza por estado fiscal pendiente. Aún no existe endpoint HTTP, outbox, generador de apuntes balanceados ni sincronización JSON-2 de movimientos.
- **Matriz funcional a probar en octubre:** ventas y notas de crédito/cancelaciones, pagos PUE/PPD/REP; compras con XML, recepción de mercancía y devolución a proveedor; cobros y pagos; cierre/retiros/depósitos/terminales y comisiones; extractos y conciliación bancaria; inventario, costo y transferencias. Mantener CFDI en Facturify y evitar duplicar ingreso, impuesto, cuenta por cobrar/cobro, devolución o nota de crédito.
- **Evidencia privada:** `outputs/odoo_branch_data_20261023/preflight.json`, `postflight.json`, `odoo-preflight.json` y `odoo-postflight.json`; scripts operativos en el mismo directorio. Sin credenciales ni domicilios completos en documentación.
- **Resultado:** DAT_SUC cambió solo para DF02/DF06/DF16 y ocho `VIGENTE_DESDE`; los estados de validación siguieron pendientes. No se crearon asientos o documentos Odoo. IOE producción y Odoo principal sin movimientos nuevos.
