# C01: conexión, diagnóstico y UAT

## Causas verificadas y corrección

1. El despliegue inicial tenía `DB_PASSWORD=false`: durante la operación del navegador el agente editó una fila incorrecta al configurar `DB_ENCRYPT`. El titular restauró la contraseña privadamente. Se recreó el contenedor y `SELECT 1` devolvió `SQL_CONNECT_OK`; no fue necesario alterar el login SQL ni FEDERADA.
2. IOE no tenía URL ni cuenta HTTP de recompensas configuradas. La cuenta SQL no sustituye la cuenta de aplicación. Se conservan `RECOMPENSAS_API_URL`, `RECOMPENSAS_API_USERNAME` y `RECOMPENSAS_API_PASSWORD`; se admiten como alias privados `USER_API_FEDERADA` y `PASSWORD_API_FEDERADA`, indicados por el titular. Las claves canónicas no vacías tienen prioridad. El sufijo `/api` se normaliza una sola vez.
3. El contenedor solo exponía 3000 dentro de Docker. El destino aprobado para IOE es `https://api-recompensas.ioebusiness.com.mx`, independiente del frontend `https://ioebusiness.com.mx`. DNS, TLS y prueba autenticada deben verificarse antes de aceptar C01.

## Contrato de fallo y reconsulta

`GET /pv/cotizaciones/:idfol/lealtad/participacion` conserva JWT y validación de sucursal/cliente del folio persistido. La única respuesta de participación aceptada es un booleano autoritativo de recompensas. Error externo nunca equivale a `participante=false` y no entrega saldo.

Errores seguros incluyen `LEALTAD_URL_NO_CONFIGURADA`, `LEALTAD_URL_INVALIDA`, `LEALTAD_CUENTA_NO_CONFIGURADA`, `LEALTAD_AUTH_RECHAZADA`, `LEALTAD_AUTH_NO_DISPONIBLE`, `LEALTAD_PERMISO_DENEGADO`, `LEALTAD_TIMEOUT`, `LEALTAD_CONEXION_NO_DISPONIBLE`, `LEALTAD_CONSULTA_NO_DISPONIBLE`, `LEALTAD_RESPUESTA_INVALIDA` y `LEALTAD_CLIENTE_INCONSISTENTE`. No copiar cuerpo remoto, credenciales, tokens ni datos de conexión al mensaje de operador.

Flutter muestra referencia segura y permite **Volver a consultar** sobre el mismo folio. El panel agrega **Consultar lealtad** para folios existentes. Ninguna de esas acciones crea folio ni movimiento. El timeout de recepción exclusivo de C01 es 45 s para cubrir login y una renovación acotada del JWT externo.

## Fecha de la cotización

Consulta de solo lectura en `.40:1434/IOEDESARROLLO` confirmó `DF01-20261023-CP-0002.FCN = 2026-10-23 22:27:55.820`. Los SP de creación y folio ya usan hora México. TypeORM con `useUTC=false` y `TZ=America/Mexico_City` serializa ese instante como `2026-10-24T04:27:55.820Z`. El panel extraía día UTC sin `toLocal()`; por eso mostraba 24/10. Se corrige únicamente presentación con `formatCotizacionDate`, siguiendo el formato local usado en pago. No se reescriben fechas ni folios.

## Desarrollo y validación

`node scripts/start-c01-dev.cjs --check` valida conexión y fija exclusivamente `.40:1434/IOEDESARROLLO`. Sin `--check` arranca API local en 3000, sin segundo listener ADMS ni worker de correo. Lee `.env` privado sin cambiar su conexión productiva; no debe usarse para producción.

Pruebas enfocadas: 10 casos backend (true/false, configuración ausente, aliases, login rechazado, renovación única, cliente inconsistente, timeout y sucursal) y 4 Flutter (mensajes, reintento y fecha local). Build API y análisis Dart pasaron; hot reload pasó. Evidencia SQL y serialización: `outputs/lealtad_c01_correccion_20261023/diagnostico-readonly.json`.

La referencia read-only confirma que IDC 50007 participa en FEDERADA y coincide con cliente DF01 de IOEDESARROLLO. Eso no sustituye UAT del recorrido IOE → HTTPS → login API → participación. C01 no autoriza puntos, cambios SQL, workers ni operaciones financieras.

## Resultado de ejecución — 2026-10-23

API pública HTTPS y cuenta técnica funcionan. `.env` local tenía URL vacía en la comprobación final: se guardó endpoint real y se recargó exclusivamente backend de desarrollo con launcher seguro. `/health/environment` confirma conexión IOEDESARROLLO; su resultado global false corresponde a tablas de otros módulos ausentes en desarrollo, fuera de este cambio.

Prueba técnica real de servicio y UAT autenticada en navegador interno: folio DF01-20261023-CP-0002 → IDC50007 → participante=true. La UI muestra “El cliente 50007 participa en el programa de lealtad.” Reconsulta exitosa sobre el mismo folio, dos folios originales conservados, fechas23/10/2026. Sin crear cotización ni movimientos. Cuenta externa se autentica por API, nunca mediante SQL de FEDERADA desde IOE.

API/web de recompensas corren en Coolify CT105, con TLS en Nginx externo CT .3. Contrato de sesión web pasa login/me/logout200; cookies HttpOnly/Secure/SameSite=None y CORS credenciales correctos. Negativos funcionales, equivalencias/identidad y aceptación C01 completa aún pendientes. No confundir PASS de participante con aprobación de todos los casos de la matriz.
