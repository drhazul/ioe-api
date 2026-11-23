# Permisos Quadrum por RFC en FACT_CSD

## Estado al 2026-11-23

Integración local de API y pantalla. El titular realiza el despliegue conjunto.
Migración estructural aplicada en IOEDESARROLLO e IOELOCAL, servidor dd7842d7ba7e.
Los respaldos de metadatos previos están en outputs/quadrum_permisos_20261123
del workspace; no contienen certificados ni contraseñas.

En IOELOCAL se inicializó FACTURA para JICJ800630854, JIFJ4704238T5 y
JIFT6203071N7, según listas efectivas productivas al corte. JIGE810809HI4 y
XIQB891116QE4 deshabilitados; nota de crédito y complemento deshabilitados.
IOEDESARROLLO inició con los tres permisos deshabilitados para todos sus RFC:
su entorno local no tenía habilitación productiva ni listas.

## Contrato

FACT_CSD agrega tres banderas por certificado activo: QUADRUM_FACTURA_HABILITADA,
QUADRUM_NOTA_CREDITO_HABILITADA y QUADRUM_COMPLEMENTO_PAGO_HABILITADO.
Altas nuevas quedan deshabilitadas. Renovación copia los valores del CSD activo
anterior en la misma transacción. Usuario y fecha de la última edición se guardan
en QUADRUM_PERMISOS_USUARIO y QUADRUM_PERMISOS_FECHA.

PATCH /cfdi/csd/:rfc/quadrum/permisos exige JWT y AdminOnlyGuard; recibe
noCertificado, factura, notaCredito y complementoPago. Actualiza sólo el
certificado activo indicado; si cambió, responde conflicto.

En producción el API consulta el CSD activo en las dos verificaciones de
emisión. Permiso ausente niega operación. QUADRUM_PRODUCCION_HABILITADA sigue
siendo interruptor global; QUADRUM_RFC_HABILITADOS y
QUADRUM_FLUJOS_HABILITADOS dejan de decidir permisos en la versión nueva.
Cancelación conserva su regla independiente. Endpoints y secretos permanecen
en entorno. El entorno demo conserva comportamiento anterior.

## Pase y reversa

Antes del despliegue verificar nuevamente las matrices y que las cinco columnas
existan en la base del proceso. El API anterior sigue usando las listas del
entorno; al desplegar, el nuevo usa la base. La pantalla y API deben desplegarse
juntos; verificar imágenes, salud y carga efectiva según AGENTS del workspace.

Para volver a versión anterior, recuperar imagen API/App y conservar variables
globales/listas originales; reconciliar manualmente cualquier edición hecha en
FACT_CSD durante la versión nueva antes del rollback. No eliminar columnas ni
modificar credenciales durante reversa. No ejecutar la inicialización otra vez:
el SQL estructural es idempotente y no vuelve a definir permisos existentes.

## Validación pendiente de producción

La migración no habilita JIGE ni timbra. Tras el pase, un administrador puede
configurar su permiso en pantalla. Verificar UI autenticada, permisos por RFC,
certificado renovado y comportamiento de error; una emisión real necesita un
folio comercial propio y autorización expresa.
