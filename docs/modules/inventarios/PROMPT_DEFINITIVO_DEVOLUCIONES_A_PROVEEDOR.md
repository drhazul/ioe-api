# Prompt definitivo — Módulo Devoluciones a Proveedor

## 1. Regla de ejecución y autoridad

Trabaja en el proyecto `C:\Users\DAVID\proyectos\proyecto_ioe`, compuesto por:

- Backend: `ioe-api`.
- Frontend Flutter: `ioe_app`.
- Base de datos: SQL Server, con compatibilidad SQL Server 2014 / nivel 120.

Este documento reemplaza los requisitos históricos de bloqueo, reserva o
cuarentena global de inventario. Los documentos anteriores son fuentes de
contexto, no instrucciones vigentes cuando contradigan este prompt.

Antes de modificar:

1. Lee `AGENTS.md`, README y documentación aplicable de ambos repositorios.
2. Revisa estado Git y conserva cambios ajenos.
3. Analiza repositorio, objetos SQL vivos y estructura Flutter actual.
4. Presenta diagnóstico, inventario de reutilización y plan por fases.
5. No ejecutes migraciones ni escrituras de base hasta autorización explícita.
6. Separa validación local, UAT y producción. No presentes una como evidencia
   de otra.

Fuentes de verdad, en orden:

1. Reglas de negocio confirmadas en este prompt.
2. Esquema y datos vivos del entorno autorizado.
3. Repositorios, migraciones, README y AGENTS.
4. Documentos funcionales históricos, solo donde no exista contradicción.

## 2. Objetivo

Desarrollar módulo ERP de Devoluciones a Proveedor con trazabilidad desde una
recepción de mercancía previa hasta salida física contabilizada.

Debe controlar:

- Documento de devolución.
- Renglones y cantidades.
- Recepción y renglón de origen.
- Proveedor y sucursal.
- Motivo y evidencia.
- Revisión y autorización.
- Consolidación de varios documentos para envío.
- Transportista, guía, cajas y RMA.
- Salida física.
- Movimiento de inventario.
- Auditoría e histórico.

Fuera de alcance inicial:

- Aplicación de notas de crédito.
- Conciliación fiscal.
- Reembolsos.
- Resarcimiento contable.
- Cuentas por cobrar al proveedor.
- Cancelación posterior a salida si no existe clase oficial de reversa.

## 3. Principios no negociables

### 3.1 Independencia operativa

Una devolución en `BORRADOR`, `SOLICITADA`, `AUTORIZADA` o `CONSOLIDADA`:

- No reserva inventario global.
- No bloquea stock para otros módulos.
- No modifica `DAT_ART.STOCK`.
- No inserta movimientos en `DAT_MB51`.
- No instala triggers sobre tablas compartidas.
- No modifica SP, endpoints o reglas de otros módulos.

Única afectación global válida: movimiento `102` insertado cuando mercancía
sale físicamente. Esa salida forma parte legítima del historial de inventario.

No crear o rehabilitar lógica equivalente a una reserva mediante:

- Triggers sobre `DAT_ART` o `DAT_MB51`.
- Campos de stock bloqueado consumidos por módulos externos.
- Validaciones cruzadas que rechacen operaciones ajenas.
- Copias de inventario en tablas paralelas.

Bloqueos SQL breves para atomicidad al contabilizar salida son válidos. No son
reservas de negocio y deben limitarse a misma sucursal/artículo/origen.

### 3.2 Reutilizar antes de crear

Prioridad obligatoria:

```text
REUTILIZAR
  -> EXTENDER
  -> CREAR
```

No inventar tabla, campo, código de movimiento, rol, módulo front, catálogo o
SP cuando exista equivalente. Toda creación nueva debe incluir justificación.

## 4. Estructuras existentes que deben analizarse

### 4.1 Inventario

- `DAT_MB51`: libro de movimientos y fuente de existencia.
- `DAT_CMOV`: catálogo oficial de movimientos.
- `DAT_ART`: maestro de artículos; `STOCK` es proyección legacy, no autoridad.
- `DAT_CTR_DOC`: control documental de movimientos.
- `sp_dat_mb52_resumen`: referencia existente para totalización de MB51.
- `sp_dat_art_stock_rebuild_from_mb51`: referencia de reconstrucción, no fuente
  transaccional del nuevo módulo.

Movimiento confirmado:

- `101`: entrada de mercancía.
- `102`: devolución de mercancía a proveedor.

No inventar otros códigos.

### 4.2 Recepción y orden de compra

Reutilizar:

- `REC_CAB_PED`.
- `REC_DET_PED`.
- `REC_CTRL_DOC_REC`.
- `REC_CTO_HIST`.

Relaciones relevantes:

- `REC_CTRL_DOC_REC.DOCREC`: documento de recepción.
- `REC_CTRL_DOC_REC.NPED`: orden de compra.
- `REC_CTO_HIST.IDREC`: identidad única de renglón recibido.
- `REC_CTO_HIST.DOCREC`: recepción de origen.
- `REC_CTO_HIST.ART`: artículo recibido.
- `REC_CTO_HIST.CTD_ACEP`: cantidad aceptada.
- `REC_CTO_HIST.CTD`: fallback legacy cuando `CTD_ACEP` sea nulo.
- `REC_CAB_PED.SUC`: sucursal del pedido.
- `REC_CAB_PED.NPROV`: proveedor del pedido.

Solo una recepción `CONTABILIZADO` puede originar devolución.

### 4.3 Objetos DEV existentes

El entorno puede contener objetos aún no versionados en Git:

- `DEV_TIPO_PROVD`.
- `DEV_MOTIVO_PROVD`.
- `DEV_DOC_PROVD`.
- `DEV_CTRL_PROVD`.
- `DEV_EVIDENCIA_PROVD`.
- `DEV_ENVIO_PROVD`.
- `DEV_ENVIO_DOC`.
- `DEV_FOLIO_PROVD`.
- `sp_dev_provd_*`.

No asumir que su diseño actual es definitivo. Comparar definición viva contra
este prompt. Versionar toda estructura reutilizada o corregida mediante scripts
SQL idempotentes con `apply`, `verify` y `rollback`.

## 5. Fuente de existencia real

`DAT_ART.STOCK` no debe decidir disponibilidad.

Existencia real:

```sql
EXISTENCIA_REAL(SUC, ART) = SUM(ISNULL(DAT_MB51.CTDA, 0))
```

Reglas:

1. Agrupar por `SUC` y `ART` normalizados con `UPPER(LTRIM(RTRIM(...)))`.
2. Incluir todas las clases de movimiento.
3. Respetar signo almacenado en `CTDA`.
4. No filtrar una lista parcial de clases para calcular saldo total.
5. Resolver por conjunto; evitar consultas N+1.
6. Verificar índice útil sobre `DAT_MB51(SUC, ART)` antes de crear otro.
7. Mostrar divergencia contra `DAT_ART.STOCK` solo como diagnóstico.
8. No sincronizar `DAT_ART.STOCK` desde SP del módulo.

Crear una vista o SP reutilizable que devuelva:

- `SUC`.
- `ART`.
- `EXISTENCIA_REAL`.
- Opcionalmente almacén si negocio confirma que disponibilidad debe separarse
  por almacén.
- Fecha/hora de cálculo.

No persistir el resultado como inventario paralelo.

## 6. Relación obligatoria con recepción previa

### 6.1 Cabecera

Toda devolución debe tener `DOC_REC` obligatorio.

Validar:

1. `DOC_REC` existe en `REC_CTRL_DOC_REC`.
2. Recepción está `CONTABILIZADO`.
3. Recepción pertenece a una orden existente.
4. Sucursal de devolución coincide con `REC_CAB_PED.SUC`.
5. Proveedor coincide con `REC_CAB_PED.NPROV`.
6. `DOC_OC` se deriva de recepción; usuario no debe poder introducir relación
   contradictoria.

No basta guardar texto libre de documento.

### 6.2 Detalle

Cada renglón debe guardar referencia inmutable `IDREC_ORIGEN` hacia
`REC_CTO_HIST.IDREC`.

Validar:

1. `IDREC_ORIGEN` pertenece a `DOC_REC` de cabecera.
2. Artículo coincide con `REC_CTO_HIST.ART`.
3. Cantidad aceptada es mayor que cero.
4. Renglón fue contabilizado mediante movimiento `101` idempotente ligado a
   `IDREC`.
5. Una recepción con artículo repetido mantiene cada `IDREC` independiente.

Cantidad recibida de origen:

```sql
CANTIDAD_RECIBIDA_ORIGEN =
  ISNULL(REC_CTO_HIST.CTD_ACEP, REC_CTO_HIST.CTD)
```

Si falta columna compatible, proponer migración de `DEV_CTRL_PROVD` para
`IDREC_ORIGEN`. No guardar vínculo solo en observaciones o texto de MB51.

## 7. Cantidad devolvible

Por cada `IDREC_ORIGEN`:

```text
YA_DEVUELTO_ORIGEN =
  suma absoluta de movimientos 102 contabilizados,
  vinculados por detalle DEV e IDREC_ORIGEN

SALDO_ORIGEN =
  CANTIDAD_RECIBIDA_ORIGEN - YA_DEVUELTO_ORIGEN

CANTIDAD_DEVOLVIBLE =
  MAX(0, MIN(EXISTENCIA_REAL, SALDO_ORIGEN))
```

Reglas:

- Cantidad solicitada debe ser mayor que cero.
- No puede superar saldo de recepción.
- No puede superar existencia real.
- Cantidades de solicitudes pendientes no se restan del stock real.
- Mostrar al usuario cantidad recibida, ya devuelta, saldo de origen,
  existencia real y máximo devolvible.
- Recalcular al consultar, solicitar, autorizar y contabilizar.
- Validación decisiva ocurre dentro de transacción de salida.

## 8. Modelo funcional

### 8.1 Cabecera de devolución

Reutilizar o corregir `DEV_DOC_PROVD` para incluir:

- Identidad interna.
- Folio único y consecutivo según patrón existente.
- Sucursal.
- Almacén.
- Proveedor.
- `DOC_REC` obligatorio.
- Orden de compra derivada.
- Tipo de devolución.
- Estatus.
- Observaciones.
- Usuarios y fechas de cada transición.
- Documento de movimiento final.

### 8.2 Detalle

Reutilizar o corregir `DEV_CTRL_PROVD` para incluir:

- Identidad de renglón.
- Documento de devolución.
- `IDREC_ORIGEN` obligatorio.
- Artículo.
- Cantidad solicitada.
- Costo histórico aplicable y criterio documentado.
- Importe.
- Lote/caducidad cuando existan y sean aplicables.
- Motivo.
- Estado activo.
- Auditoría.

`CTDA_BLOQ` no debe representar reserva operativa. Opciones aceptables:

1. Eliminarlo mediante migración segura.
2. Mantenerlo temporalmente en cero por compatibilidad y marcarlo obsoleto.

No usarlo para disponibilidad ni autorización.

Descripción, UPC, jerarquía y atributos maestros deben consultarse desde
`DAT_ART`; no duplicarlos sin necesidad histórica demostrada.

### 8.3 Catálogos

Validar antes de reutilizar o crear:

- Tipo de devolución.
- Motivo.
- Requisito de evidencia.
- Permite parcial.
- Activo/inactivo.

Conservar códigos funcionales solo si no contradicen catálogos existentes.

### 8.4 Envíos consolidados

Reutilizar `DEV_ENVIO_PROVD` y `DEV_ENVIO_DOC` si cumplen:

- Relación normalizada muchos documentos a un envío.
- Mismo proveedor.
- Transportista.
- Guía.
- Cajas.
- RMA.
- Observaciones.
- Usuario y fecha de salida.

No guardar listas separadas por comas.

## 9. Máquina de estados

Flujo recomendado:

```text
BORRADOR
  -> SOLICITADA
  -> AUTORIZADA
  -> CONSOLIDADA
  -> SALIDA_CONTABILIZADA / EN_TRANSITO
```

Alternos:

- `RECHAZADA` desde `SOLICITADA`.
- `CANCELADA` desde `BORRADOR`, `SOLICITADA` o `AUTORIZADA`, siempre antes de
  salida.

Efectos:

| Estado/acción | DAT_MB51 | DAT_ART.STOCK | Reserva global |
|---|---:|---:|---:|
| Borrador | No | No | No |
| Solicitar | No | No | No |
| Autorizar | No | No | No |
| Consolidar | No | No | No |
| Rechazar/cancelar antes de salida | No | No | No |
| Salida física contabilizada | Movimiento 102 negativo | No directo | No |

`AUTORIZADA` significa aprobación administrativa, no salida de inventario.

## 10. Contabilización de salida

Movimiento `102` debe generarse exactamente al confirmar salida física.

Proceso transaccional:

1. `SET XACT_ABORT ON` y `BEGIN TRY/BEGIN TRANSACTION`.
2. Obtener `sp_getapplock` por documento de devolución o envío para impedir
   doble ejecución dentro del módulo.
3. Bloquear cabecera y detalles DEV.
4. Confirmar estado autorizado/consolidado.
5. Confirmar recepción y líneas de origen.
6. Recalcular `EXISTENCIA_REAL` desde MB51.
7. Recalcular saldo por `IDREC_ORIGEN`.
8. Usar bloqueo de rango breve sobre `DAT_MB51(SUC, ART)` para preservar
   atomicidad durante validación e inserción. Revisar plan de ejecución e índice.
9. Insertar `DAT_CTR_DOC` si corresponde y no existe.
10. Insertar `DAT_MB51` con:
    - `CLSM = 102`.
    - `CTDA = -ABS(cantidad)`.
    - `CTOT = -ABS(cantidad * costo)` según convención confirmada.
    - `DOCP = documento DEV`.
    - `IDPD` idempotente y único por detalle.
    - `SUC`, almacén, usuario y fechas correctos.
11. No actualizar directamente `DAT_ART.STOCK`.
12. Cambiar estado a salida contabilizada/en tránsito.
13. Registrar `AUDIT_LOG`.
14. Confirmar transacción.

Reintento con misma clave debe devolver resultado existente sin duplicar
`DAT_CTR_DOC`, `DAT_MB51` ni auditoría de contabilización.

Si existencia cambió antes de salida, rechazar esta devolución con mensaje
claro. No reservar mercancía desde estados anteriores.

## 11. Cancelación y reversa

Antes de salida:

- Cancelar sin movimiento de inventario.
- No existe cantidad que liberar.

Después de salida:

- No borrar movimiento 102.
- No permitir cancelación simple.
- Exigir proceso de reversa explícito y clase oficial existente en `DAT_CMOV`.
- Si no existe clase aprobada, dejar operación fuera de alcance y documentar
  pendiente de negocio.

## 12. Evidencias

Primero localizar patrón vigente de adjuntos y límites de API/Flutter.

Requisitos:

- Evidencia por renglón cuando motivo la requiera.
- MIME permitido.
- Tamaño máximo alineado a configuración del backend.
- Auditoría de alta y consulta.
- No crear almacenamiento paralelo si existe infraestructura reutilizable.
- No permitir transición a `SOLICITADA` cuando falte evidencia obligatoria.

## 13. Seguridad y autorización

Aplicar regla legacy del proyecto:

- Admin: alcance total según reglas existentes.
- Otros usuarios: sucursal autorizada por `USUARIO.SUC` y/o `USR_MOD_SUC`.
- Jefe/Analista de Inventarios: revisión, autorización y consolidación según
  matriz aprobada.
- Sucursal: creación y consulta limitada a sucursales autorizadas.

No inventar código `MOD_FRONT` ni roles. Verificar catálogos vivos y presentar
propuesta exacta antes de insertar permisos.

Toda acción sensible debe validar:

- Usuario autenticado.
- Rol y función.
- Sucursal.
- Estado actual.
- Transición solicitada.
- Idempotencia.

Reutilizar `AuditInterceptor` y `AUDIT_LOG`.

## 14. Backend/API

Seguir patrón NestJS existente:

```text
controller -> service -> dto/entity -> SP/consulta SQL
```

Operaciones mínimas:

1. Listar con filtros y paginación existente.
2. Consultar expediente.
3. Consultar recepciones contabilizadas elegibles.
4. Consultar líneas y saldos devolvibles de una recepción.
5. Crear borrador desde recepción.
6. Agregar/modificar/eliminar renglón en borrador.
7. Cargar/consultar evidencia.
8. Solicitar.
9. Autorizar.
10. Rechazar.
11. Cancelar antes de salida.
12. Consolidar documentos.
13. Registrar guía/transporte.
14. Contabilizar salida física.
15. Consultar histórico y reportes operativos.

No crear SP CRUD sin valor transaccional. Operaciones críticas sí deben quedar
en SP versionado.

## 15. Flutter

Seguir estructura Riverpod/Dio y convenciones actuales del proyecto.

Pantallas:

1. Gestión/listado.
2. Selección de recepción contabilizada.
3. Detalle de recepción con saldos por `IDREC`.
4. Alta y edición de borrador.
5. Evidencias.
6. Revisión/autorización.
7. Consolidación y envío.
8. Expediente e histórico.
9. Reportes operativos.

Mostrar por renglón:

- Recepción e `IDREC` de origen.
- Cantidad recibida.
- Cantidad devuelta previamente.
- Saldo de origen.
- Existencia real MB51.
- Cantidad máxima devolvible.
- Cantidad solicitada.
- Motivo y evidencia.

UI puede validar para experiencia, pero backend y SP conservan autoridad.

## 16. Reportes

Incluir:

- Por proveedor.
- Por sucursal.
- Por motivo.
- Por estatus.
- Pendientes de salida.
- En tránsito.
- Rechazadas/canceladas.
- Por artículo y recepción de origen.
- Cantidad recibida contra cantidad devuelta.
- Histórico de movimiento 102.

No incluir “inventario en cuarentena” porque ya no existe reserva operativa.
Excluir reportes contables del resarcimiento.

## 17. Auditoría mínima

Registrar:

- Creación.
- Modificación de cabecera y detalle.
- Alta/eliminación de evidencia.
- Solicitud.
- Autorización.
- Rechazo.
- Cancelación.
- Consolidación.
- Registro de guía.
- Salida física contabilizada.
- Intentos idempotentes relevantes.
- Errores de saldo o procedencia.

Metadatos deben incluir documento, recepción, `IDREC_ORIGEN`, sucursal,
artículo, cantidad y transición, sin secretos ni contenido binario completo.

## 18. Migración y versionado

Antes de ejecutar cambios:

1. Exportar definiciones y hashes de objetos vivos.
2. Contar documentos y movimientos existentes.
3. Detectar datos incompatibles.
4. Preparar backfill de `DOC_REC` e `IDREC_ORIGEN` solo si existe relación
   demostrable.
5. No inventar vínculo para registros ambiguos; reportarlos.
6. Crear scripts idempotentes `preflight/apply/verify/rollback`.
7. Proteger base esperada y abortar ante drift de definición.
8. Mantener compatibilidad SQL Server 2014.
9. Versionar tablas, índices, SP y permisos necesarios.

No ejecutar scripts de desarrollo en producción sin aprobación separada,
respaldo y preflight del destino real.

## 19. Pruebas obligatorias

### Existencia

- Totaliza todos los movimientos MB51 por `SUC + ART`.
- Respeta positivos y negativos.
- No usa `DAT_ART.STOCK` para decidir.
- Detecta divergencias sin corregirlas silenciosamente.

### Procedencia

- Rechaza recepción inexistente o no contabilizada.
- Rechaza proveedor/sucursal distintos.
- Rechaza `IDREC` de otro documento.
- Rechaza artículo distinto al recibido.
- No devuelve más de cantidad aceptada menos devoluciones previas.
- Maneja múltiples líneas del mismo artículo sin mezclarlas.

### Estados

- Borrador/solicitud/autorización/consolidación no crean MB51.
- Rechazo/cancelación previa no generan ajuste.
- Solo salida física crea movimiento 102.
- Transiciones inválidas fallan sin cambios parciales.

### Concurrencia e idempotencia

- Dos solicitudes pueden coexistir sin reservar stock.
- Dos salidas simultáneas no exceden existencia ni saldo de origen.
- Cambio concurrente de MB51 obliga revalidación.
- Reintento de salida no duplica movimiento.
- Error revierte documento, movimiento y auditoría de misma transacción.

### Seguridad

- Usuario sin sucursal autorizada recibe rechazo.
- Rol de sucursal no autoriza ni consolida si matriz no lo permite.
- Jefe/Analista operan solo acciones aprobadas.
- Admin no oculta fallas de permisos de usuarios no admin.

### Regresión

- No existe trigger de reserva DEV habilitado sobre tablas compartidas.
- Ningún estado pendiente altera disponibilidad global.
- Movimiento 102 final aparece correctamente en resumen MB51/MB52.
- Recepción y orden de compra permanecen históricamente intactas.

## 20. Entregables antes de implementación

Entregar y esperar aprobación:

1. Análisis de arquitectura API/Flutter/SQL.
2. Inventario de reutilización.
3. Definiciones vivas y diferencias contra Git.
4. Incongruencias y decisiones propuestas.
5. Modelo de datos y diagrama lógico.
6. Máquina de estados.
7. Fórmulas SQL exactas de existencia y saldo de origen.
8. Lista de tablas/columnas a reutilizar, alterar o crear.
9. Lista de SP a conservar, reemplazar o crear.
10. Contratos de endpoints.
11. Pantallas y permisos.
12. Plan de migración, rollback y backfill.
13. Matriz de pruebas.
14. Riesgos y decisiones aún pendientes.

## 21. Fases de implementación

Solo después de aprobar análisis:

1. Versionar baseline SQL vivo.
2. Migrar modelo de procedencia `DOC_REC + IDREC_ORIGEN`.
3. Implementar consulta de existencia MB51.
4. Corregir SP y máquina de estados.
5. Implementar API y permisos.
6. Implementar Flutter.
7. Ejecutar pruebas automatizadas.
8. Ejecutar migración controlada en desarrollo.
9. Ejecutar UAT con usuarios reales.
10. Preparar despliegue productivo separado.

Cada fase necesita evidencia y autorización antes de avanzar a escrituras o
despliegues del siguiente entorno.

## 22. Criterio de finalización

Módulo termina solo cuando:

- Existencia proviene de MB51.
- Cada devolución está vinculada a recepción contabilizada y línea `IDREC`.
- No se excede cantidad recibida ni stock real.
- Estados previos a salida no reservan ni afectan inventario.
- Movimiento 102 ocurre una sola vez en salida física.
- No hay triggers de reserva global.
- Operaciones críticas son transaccionales e idempotentes.
- Seguridad por rol/sucursal está probada con usuarios no admin.
- API, Flutter, SQL y documentación están versionados.
- Pruebas automatizadas pasan.
- UAT real está documentado por separado.
- Producción no se declara validada sin despliegue y evidencia propios.

