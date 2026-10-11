#!/usr/bin/env node
/**
 * Prueba de conexion con el PAC Quadrum.
 *
 * Usa la operacion `consulta`, que solo necesita usuario, contrasena y un UUID.
 * NO necesita CSD, ni XML, ni sellado — asi que sirve para verificar de forma
 * barata que el endpoint, las credenciales y el sobre SOAP estan bien, mucho
 * antes de tener listo el sellado.
 *
 * Se espera que Quadrum responda que el UUID no existe. Eso YA ES EXITO:
 * significa que llego, autentico y contesto.
 *
 * Uso — pon las credenciales en el .env de la raiz (ya esta en .gitignore):
 *
 *   QUADRUM_ENDPOINT=https://devws.cfdiquadrum.com.mx/timbrar
 *   QUADRUM_USUARIO=...
 *   QUADRUM_CONTRASENA=...
 *
 * y corre:
 *   node --env-file=.env scripts/quadrum-ping.mjs
 *
 * Con un UUID real para consultar su estado:
 *   node --env-file=.env scripts/quadrum-ping.mjs A1B2C3D4-1111-2222-3333-444455556666
 */

const ENDPOINT =
  process.env.QUADRUM_ENDPOINT || 'https://devws.cfdiquadrum.com.mx/timbrar';
// NUNCA poner las credenciales aqui como valor por defecto: este archivo se
// commitea, y sacarlas del historial de git despues es un dolor. Van en .env,
// que ya esta en .gitignore.
const USUARIO = process.env.QUADRUM_USUARIO || '';
const CONTRASENA = process.env.QUADRUM_CONTRASENA || '';
const TIMEOUT_MS = Number(process.env.QUADRUM_TIMEOUT_MS || 30000);

// UUID que no existe, solo para provocar una respuesta.
const UUID = process.argv[2] || '00000000-0000-0000-0000-000000000000';

if (!USUARIO || !CONTRASENA) {
  console.error('Faltan QUADRUM_USUARIO y/o QUADRUM_CONTRASENA.');
  console.error('');
  console.error('  Agregalas al .env de la raiz (ya esta en .gitignore):');
  console.error('    QUADRUM_USUARIO=tu-usuario');
  console.error('    QUADRUM_CONTRASENA=tu-contrasena');
  console.error('');
  console.error('  Y corre:');
  console.error('    node --env-file=.env scripts/quadrum-ping.mjs');
  process.exit(2);
}

const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NS_TIMBRAR = 'http://ws.cfdiquadrum.com.mx/timbrar';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sobre =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}">` +
  `<soapenv:Header/>` +
  `<soapenv:Body>` +
  `<tim:consulta xmlns:tim="${NS_TIMBRAR}">` +
  `<tim:usuario>${esc(USUARIO)}</tim:usuario>` +
  `<tim:contrasena>${esc(CONTRASENA)}</tim:contrasena>` +
  `<tim:uuid>${esc(UUID)}</tim:uuid>` +
  `</tim:consulta>` +
  `</soapenv:Body></soapenv:Envelope>`;

const censurar = (xml) =>
  xml.replace(
    /(<(?:[\w.-]+:)?(?:contrasena|usuario)>)([\s\S]*?)(<\/)/gi,
    '$1***$3',
  );

console.log(`endpoint: ${ENDPOINT}`);
console.log(`ambiente: ${/dev/i.test(ENDPOINT) ? 'PRUEBAS' : '*** PRODUCCION ***'}`);
console.log(`uuid:     ${UUID}`);
console.log(`usuario:  ${USUARIO.slice(0, 3)}***`);
console.log('');
console.log('--- peticion (censurada) ---');
console.log(censurar(sobre));
console.log('');

const control = new AbortController();
const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);
const t0 = Date.now();

try {
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"consulta"',
    },
    body: sobre,
    signal: control.signal,
  });

  const texto = await resp.text();
  const ms = Date.now() - t0;

  console.log(`--- respuesta (HTTP ${resp.status}, ${ms} ms) ---`);
  console.log(texto);
  console.log('');

  if (/[<:]Fault[ >]/i.test(texto)) {
    const fs = texto.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
    const mensaje = fs ? fs[1].trim() : '(sin faultstring)';

    // Quadrum reporta "no encontrado" como Fault, no como resultado vacio.
    // Para un UUID inventado eso ES la respuesta correcta, y demuestra que la
    // conexion, el sobre SOAP y las credenciales funcionan.
    const noEncontrado = /no\s+e?ncontre|no\s+encontrad|informacion de la factura/i.test(
      mensaje,
    );

    if (noEncontrado) {
      console.log('RESULTADO: OK — el PAC contesto que ese UUID no existe.');
      console.log(`  "${mensaje}"`);
      console.log('');
      console.log('  Verificado: conexion, sobre SOAP y CREDENCIALES VALIDAS.');
      console.log('  (con credenciales malas el mensaje seria de autenticacion)');
      process.exit(0);
    }

    console.log('RESULTADO: SOAP Fault del PAC.');
    console.log(`  "${mensaje}"`);
    console.log('');
    console.log('  Si habla de usuario/contrasena -> el sobre y la conexion');
    console.log('  estan bien, solo hay que corregir las credenciales.');
    process.exit(1);
  }

  if (/consultaResult/i.test(texto)) {
    console.log('RESULTADO: OK — el PAC respondio en el nodo consultaResult.');
    console.log('  Conexion, autenticacion y sobre SOAP verificados.');
    process.exit(0);
  }

  console.log('RESULTADO: respondio, pero sin consultaResult ni Fault.');
  console.log('  Revisar el cuerpo de arriba para ajustar el parser.');
  process.exit(1);
} catch (e) {
  const ms = Date.now() - t0;
  if (control.signal.aborted) {
    console.error(`RESULTADO: timeout tras ${ms} ms.`);
    console.error('  Revisar red, proxy o firewall hacia el PAC.');
  } else {
    console.error(`RESULTADO: fallo la conexion tras ${ms} ms.`);
    console.error(`  ${e.message}`);
  }
  process.exit(1);
} finally {
  clearTimeout(reloj);
}
