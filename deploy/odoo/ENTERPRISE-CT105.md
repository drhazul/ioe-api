# Cambio controlado Odoo Community → Enterprise en CT105

Fecha de preflight: 2026-10-21

Estado: titular reporta licencia disponible; corte bloqueado por destino/vinculación sin verificar, acceso a Enterprise 19.0 no disponible desde este equipo y restauración de respaldo pendiente.

## Alcance

- Destino elegido: Odoo local en CT105 (`172.16.100.40`), base piloto `ioe_odoo_pilot`.
- La cuenta `ioebusiness1.odoo.com` es otra base. No registrar ahí el código de suscripción si el objetivo sigue siendo CT105.
- Mantener PostgreSQL y filestore actuales. No sincronizar movimientos IOE, crear asientos, emitir CFDI ni activar API durante el cambio de edición.

## Preflight observado

- Coolify, Odoo, PostgreSQL y pgAdmin están activos en CT105.
- Servicio Odoo usa `odoo:19.0`, imagen Community; PostgreSQL usa `postgres:17`.
- Consulta de solo lectura confirmó `account` y `l10n_mx` instalados en `ioe_odoo_pilot`. `web_enterprise`, `l10n_mx_edi` y `l10n_mx_reports` no aparecieron entre los módulos instalados.
- Inspección previa encontró `/mnt/extra-addons` vacío y sin directorio Enterprise dentro del contenedor.
- El respaldo de base y filestore del 2026-10-21 pasó verificación estructural; restauración aún no probada.
- `git ls-remote` al repositorio oficial `odoo/enterprise`, rama `19.0`, devolvió `Repository not found` con las credenciales disponibles en este equipo. Acceso de lectura al repositorio no quedó acreditado.
- En última inspección registrada de la cuenta SaaS aparecía una prueba con 14 días restantes y formulario para registrar código. Esta sesión no pudo refrescar el navegador; estado vigente de suscripción sigue sin confirmar.
- No se modificó contenedor, licencia, base, imagen ni código durante este preflight.
- El titular confirma que ya tiene licencia. No se ha verificado si el contrato está `In Progress`, si corresponde a Odoo Online o a CT105, ni si ya está vinculado a otra base.

## Puertas obligatorias

1. **Suscripción:** el titular reporta que ya tiene licencia. Confirmar en la cuenta Odoo contrato Custom activo y estado `In Progress`, cobertura on-premise/API y base a la que quedó asignado. La selección de un plan o la prueba SaaS no demuestra que este servidor local ya esté vinculado.
2. **Código Enterprise:** habilitar acceso autorizado a la rama `19.0` del repositorio oficial `odoo/enterprise`, o disponer de un paquete Enterprise oficial para esa versión. No guardar ese código en los repositorios IOE, imágenes públicas, logs o respaldos compartidos.
3. **Licencia:** obtener el código de suscripción directamente del portal Odoo y conservarlo privado. No compartirlo por chat. Odoo registra la suscripción en el banner de la base local y muestra expiración al registrarse; no introducirlo en `ioebusiness1.odoo.com` si CT105 sigue como destino.
4. **Recuperación:** crear respaldo fresco de PostgreSQL y filestore, restaurarlo como copia aislada y probar acceso antes de instalar módulos. El respaldo de octubre 21 no reemplaza esa prueba.
5. **Aprobación contable:** confirmar módulos requeridos, datos de compañías/personas físicas y sucursales. Los candidatos fiscales en desarrollo permanecen `PENDIENTE`; no crear compañías Odoo desde ellos todavía.

## Procedimiento de cambio

1. Conservar la imagen actual de Community y registrar su digest/configuración Coolify.
2. Preparar imagen privada derivada de Community 19.0 con add-ons Enterprise oficiales de la misma rama 19.0. Odoo documenta que Enterprise aporta add-ons; el servidor principal sigue siendo Community. Anteponer ruta Enterprise a `addons_path`. No colocar el repositorio privado bajo Git del proyecto IOE.
3. Crear copia aislada de `ioe_odoo_pilot` con su filestore, usando instancia/puerto propios. No registrar en ella el mismo código de suscripción que se reservará para la base piloto activa.
4. Ejecutar la primera carga de módulos en esa copia: actualizar lista de aplicaciones, comprobar `web_enterprise` y habilitar solo los módulos requeridos y licenciados. Evaluar `account_reports`, `l10n_mx_edi` y `l10n_mx_reports` según disponibilidad oficial y decisión contable; la edición Enterprise no autoriza por sí sola timbrado nuevo.
5. Validar login, vistas, reportes, configuración México, diarios, impuestos, datos fiscales, API, logs y conteo de movimientos (`account_move` debe conservar 0 en piloto). No conectar todavía el importador IOE ni SMB.
6. Con copia restaurada y prueba aceptada, detener o poner en mantenimiento el servicio; hacer respaldo final; desplegar la imagen Enterprise fijada por digest en Coolify; registrar el código solo en `ioe_odoo_pilot`; instalar módulos aprobados; verificar banner `In Progress`, fecha de expiración y salud HTTPS.
7. Mantener API JSON-2 y sincronización deshabilitadas hasta activar Custom, crear usuario bot de mínimos permisos y aprobar el piloto contable.

## Reversa

- Antes de actualizar módulos: volver a la imagen Community fijada y arrancar con base/filestore actuales.
- Después de instalar o actualizar módulos: no asumir que revertir solo la imagen revierte el esquema. Restaurar juntos el dump PostgreSQL y el filestore tomados antes del corte; luego desplegar la imagen Community previa y verificar login, módulos, cero movimientos y HTTPS.
- Mantener la base actual sin borrar hasta completar pruebas; no ejecutar `DROP DATABASE` como parte de la reversa.

## Quién hace cada paso

| Responsable | Acción |
|---|---|
| Titular | Confirmar si licencia está vinculada a `ioebusiness1.odoo.com` o reservada para CT105; verificar `In Progress` y cobertura Custom/on-premise; habilitar acceso Enterprise 19.0 en GitHub o paquete oficial por canal privado; no enviar código de suscripción en chat. |
| Codex | Al estar disponibles licencia y fuente, preparar imagen privada, copia aislada, respaldo/restauración, prueba de módulos y plan de corte; presentar resultado técnico antes de modificar la base piloto activa. |
| Titular/contador | Aprobar módulos, compañías/personas físicas, sucursales, localización, mapeo de cuentas y resultado UAT. |

## Documentación oficial

- [Planes Odoo](https://www.odoo.com/pricing): Custom enumera Odoo on-premise y API externa.
- [Odoo 19 on-premise](https://www.odoo.com/documentation/19.0/administration/on_premise.html): registro de base con código y comprobación de suscripción.
- [Instalación desde la fuente Odoo 19](https://www.odoo.com/documentation/19.0/es_419/administration/on_premise/source.html): Enterprise contiene add-ons adicionales; servidor principal y ruta `addons_path`.

## Criterio para habilitar corte

No iniciar corte hasta que se cumplan todas estas condiciones: plan activo `In Progress`; acceso autorizado a Enterprise 19.0; código disponible solo en portal local; restauración de respaldo probada; copia aislada acepta módulos aprobados; estado contable conserva cero movimientos; titular y contador aceptan UAT.
