#!/usr/bin/env node
/**
 * Prueba integral del motor de timbrado CFDI 4.0 en Node.
 *
 * Recorre la cadena completa y genera un reporte con evidencia:
 *
 *   CSD -> comprobante -> cadena original -> SELLO -> verificacion -> Quadrum
 *
 * Sin banderas NO gasta timbres: con el PAC solo usa `consulta`, que es de
 * solo lectura, y el sellado se verifica contra la llave publica del
 * certificado.
 *
 * Con `--timbrar` agrega el paso 6: timbra en el ambiente de PRUEBAS de
 * Quadrum (se niega si el endpoint no es devws) y consulta el UUID obtenido.
 *
 * Uso:
 *   node --env-file=.env scripts/cfdi-prueba-integral.mjs
 *   node --env-file=.env scripts/cfdi-prueba-integral.mjs --timbrar
 *
 * Variables (en .env):
 *   CSD_CER_PATH, CSD_KEY_PATH, CSD_PASSWORD
 *   QUADRUM_ENDPOINT, QUADRUM_USUARIO, QUADRUM_CONTRASENA
 *   CFDI_LUGAR_EXPEDICION (opcional, 39000 por defecto)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
// `skipProject` ignora el tsconfig del proyecto: sus ajustes de nodenext
// chocan con cargar los .ts desde un .mjs suelto, y aqui solo hace falta
// transpilar archivos sin decoradores.
require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  compilerOptions: {
    target: 'ES2022',
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    strictNullChecks: true,
  },
});

const { serializarXml, aUtf8SinBom } = require('../src/modules/cfdi/cfdi-node.ts');
const { cargarCsd, sellar, verificarSello } = require('../src/modules/cfdi/cfdi-sellador.ts');
const { comprobantePrueba } = require('../src/modules/cfdi/comprobante-prueba.ts');
const { fechaCfdi } = require('../src/modules/cfdi/fecha-expedicion.ts');
const {
  decodificarXmlEmbebido,
  elementos,
  escaparTexto,
  existe,
  valor,
} = require('../src/modules/cfdi/soap-xml.ts');

const TIMBRAR = process.argv.includes('--timbrar');

const CER = process.env.CSD_CER_PATH;
const KEY = process.env.CSD_KEY_PATH;
const PASS = process.env.CSD_PASSWORD;

if (!CER || !KEY || PASS === undefined) {
  console.error('Faltan CSD_CER_PATH, CSD_KEY_PATH y/o CSD_PASSWORD en el .env');
  process.exit(2);
}

const lineas = [];
const log = (s = '') => {
  console.log(s);
  lineas.push(s);
};
const pasos = [];
let timbreConsumido = false;
const paso = (nombre, ok, detalle) => {
  pasos.push({ nombre, ok, detalle });
  log(`  [${ok ? 'OK ' : 'FALLA'}] ${nombre}`);
  if (detalle) log(`         ${detalle}`);
};

log('='.repeat(78));
log('  PRUEBA INTEGRAL — MOTOR DE TIMBRADO CFDI 4.0 EN NODE.JS');
log(`  ${new Date().toISOString()}${TIMBRAR ? '   (con --timbrar)' : ''}`);
log(`  Node ${process.version} / OpenSSL ${process.versions.openssl}`);
log('='.repeat(78));

// ---------------------------------------------------------------- 1. CSD ---
log('');
log('1. CARGA Y VALIDACION DEL CSD');
log('');

let csd;
try {
  csd = cargarCsd({
    cer: readFileSync(resolve(CER)),
    key: readFileSync(resolve(KEY)),
    password: PASS,
  });
  paso('Abrir el .key cifrado (PBES2 + PBKDF2 + 3DES)', true, 'node:crypto, sin node-forge');
  paso('Derivar NoCertificado del .cer', true, csd.noCertificado);
  paso('NoCertificado son 20 digitos (es CSD, no e.firma)', /^\d{20}$/.test(csd.noCertificado));
  paso('El .key corresponde al .cer', true, 'verificado firmando y validando');
  paso(
    'Certificado vigente',
    new Date() <= csd.validoHasta,
    `${csd.validoDesde.toISOString().slice(0, 10)} -> ${csd.validoHasta.toISOString().slice(0, 10)} ` +
      `(${Math.floor((csd.validoHasta - new Date()) / 86400000)} dias restantes)`,
  );
  log('');
  log(`  RFC emisor:    ${csd.rfc ?? '(no encontrado)'}`);
  log(`  Razon social:  ${csd.razonSocial ?? '(no encontrada)'}`);
} catch (e) {
  paso('Cargar el CSD', false, e.message);
  finalizar(1);
}

// -------------------------------------------------------- 2. Comprobante ---
log('');
log('2. CONSTRUCCION DEL COMPROBANTE');
log('');

const ahora = new Date();
// Bug #3: la fecha va en hora local del CP de expedicion, no en UTC.
// Un minuto atras por si el reloj del PAC va detras del nuestro.
const FECHA = fechaCfdi(new Date(ahora.getTime() - 60000));

const comprobante = comprobantePrueba({
  rfcEmisor: csd.rfc,
  nombreEmisor: csd.razonSocial,
  lugarExpedicion: process.env.CFDI_LUGAR_EXPEDICION || '39000',
  fecha: FECHA,
  folio: String(ahora.getTime()),
});

const [concepto] = elementosDe(comprobante, 'cfdi:Concepto');
const CANTIDAD = concepto.attrs.get('Cantidad');
const VALOR_UNITARIO = concepto.attrs.get('ValorUnitario');
const IMPORTE = concepto.attrs.get('Importe');

paso(
  'Comprobante armado',
  true,
  `${CANTIDAD} x ${VALOR_UNITARIO} = ${IMPORTE}, total ${comprobante.attrs.get('Total')}`,
);
paso(
  'Bug #2 evitado: Importe cuadra con Cantidad x ValorUnitario',
  IMPORTE === (Number(CANTIDAD) * Number(VALOR_UNITARIO)).toFixed(2),
  `${CANTIDAD} x ${VALOR_UNITARIO} = ${IMPORTE}`,
);
paso(
  'Bug #3 evitado: Fecha en hora local del CP, sin zona',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(FECHA),
  `${FECHA} (UTC seria ${ahora.toISOString().slice(0, 19)})`,
);

// ------------------------------------------------------------ 3. Sellado ---
log('');
log('3. CADENA ORIGINAL Y SELLADO');
log('');

const sellado = sellar(comprobante, csd);

paso('Cadena original generada', true, `${sellado.cadena.length} caracteres`);
paso(
  'Bug #1 evitado: el "&" va literal, no escapado',
  sellado.cadena.includes('GRUPO A & B') && !sellado.cadena.includes('&amp;'),
  'la cadena lleva "&", el XML llevara "&amp;"',
);
paso(
  'Arranca con || y termina con || (formato del XSLT del SAT)',
  sellado.cadena.startsWith('||') && !sellado.cadena.startsWith('|||') && sellado.cadena.endsWith('||'),
);
paso('El Sello NO forma parte de la cadena original', !sellado.cadena.includes(sellado.sello));
paso('Sello SHA256withRSA generado', true, `${sellado.sello.length} caracteres base64`);

const xml = serializarXml(sellado.comprobante, {
  namespaces: {
    cfdi: 'http://www.sat.gob.mx/cfd/4',
    xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  },
  schemaLocation:
    'http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
});
const bytes = aUtf8SinBom(xml);

paso('XML serializado', true, `${bytes.length} bytes`);
paso('XML sin BOM', bytes[0] !== 0xef, `primer byte 0x${bytes[0].toString(16)}`);
paso('El XML SI escapa el "&"', xml.includes('GRUPO A &amp; B'));

// ------------------------------------------------------- 4. Verificacion ---
log('');
log('4. VERIFICACION CRIPTOGRAFICA DEL SELLO');
log('');

const selloValido = verificarSello(sellado, readFileSync(resolve(CER)));
paso(
  'El sello valida contra la llave publica del certificado',
  selloValido,
  selloValido
    ? 'prueba matematica de que el sellado es correcto'
    : 'el sello NO corresponde a la cadena — el PAC lo rechazaria',
);

// ------------------------------------------------------------ 5. Quadrum ---
log('');
log('5. CONEXION CON EL PAC QUADRUM');
log('');

const ENDPOINT = process.env.QUADRUM_ENDPOINT || 'https://devws.cfdiquadrum.com.mx/timbrar';
const esProduccion = !/dev/i.test(ENDPOINT);
const USUARIO = process.env.QUADRUM_USUARIO;
const CONTRASENA = process.env.QUADRUM_CONTRASENA;
const hayCredenciales = Boolean(USUARIO && CONTRASENA);

if (!hayCredenciales) {
  paso('Credenciales de Quadrum presentes', false, 'faltan en el .env, se omite el paso');
} else {
  log(`  endpoint: ${ENDPOINT}`);
  log(`  ambiente: ${esProduccion ? '*** PRODUCCION ***' : 'PRUEBAS'}`);
  log('');

  try {
    const { status, ms, texto } = await consulta('00000000-0000-0000-0000-000000000000');
    const mensaje = valor(texto, 'faultstring') ?? '';
    const noEncontrado = /no\s+e?ncontre|informacion de la factura/i.test(mensaje);

    paso('El PAC respondio', true, `HTTP ${status} en ${ms} ms`);
    paso('El sobre SOAP es el que Quadrum espera', Boolean(mensaje) || existe(texto, 'consultaResult'));
    paso(
      'Credenciales validas',
      noEncontrado || existe(texto, 'consultaResult'),
      noEncontrado
        ? `"${mensaje}" — respuesta correcta para un UUID inexistente`
        : mensaje || 'respondio en consultaResult',
    );
  } catch (e) {
    paso('Conexion con el PAC', false, e.message);
  }
}

// ------------------------------------------------------------ 6. Timbrar ---
log('');
log('6. TIMBRADO EN EL AMBIENTE DE PRUEBAS');
log('');

if (!TIMBRAR) {
  log('  (omitido: correr con --timbrar para gastar un timbre de pruebas)');
} else if (esProduccion) {
  paso('Endpoint de pruebas', false, 'QUADRUM_ENDPOINT no es devws: este script no timbra en produccion');
} else if (!hayCredenciales) {
  paso('Credenciales de Quadrum presentes', false, 'faltan en el .env');
} else {
  const carpeta = resolve('cfdi-timbrados', `script_${comprobante.attrs.get('Serie')}-${comprobante.attrs.get('Folio')}`);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'enviado.xml'), bytes);
  writeFileSync(join(carpeta, 'cadena.txt'), aUtf8SinBom(sellado.cadena));
  log(`  evidencia: ${carpeta}`);
  log('');

  try {
    const cuerpo =
      `<tim:timbrar xmlns:tim="http://ws.cfdiquadrum.com.mx/timbrar">` +
      `<tim:xml>${bytes.toString('base64')}</tim:xml>` +
      `<tim:usuario>${escaparTexto(USUARIO)}</tim:usuario>` +
      `<tim:contrasena>${escaparTexto(CONTRASENA)}</tim:contrasena>` +
      `</tim:timbrar>`;
    const { status, ms, texto } = await soap('timbrar', cuerpo, 60000);
    timbreConsumido = true;
    writeFileSync(join(carpeta, 'respuesta.xml'), texto);

    paso('El PAC respondio', true, `HTTP ${status} en ${ms} ms`);

    if (existe(texto, 'Fault')) {
      paso('Timbrado', false, `SOAP Fault: ${valor(texto, 'faultstring') ?? '(sin faultstring)'}`);
    } else {
      const uuid = valor(texto, 'UUID') ?? valor(texto, 'uuid');
      const incidencias = elementos(texto, 'Incidencia');

      paso('El PAC devolvio UUID', Boolean(uuid), uuid ?? '(sin UUID)');
      paso('Sin incidencias', incidencias.length === 0, `${incidencias.length} incidencia(s)`);
      for (const inc of incidencias) {
        log(`         - ${valor(inc, 'CodigoError') ?? '?'}: ${valor(inc, 'MensajeIncidencia') ?? ''}`);
      }

      const xmlAcuse = valor(texto, 'xml');
      if (xmlAcuse) {
        const xmlTimbrado = decodificarXmlEmbebido(xmlAcuse);
        writeFileSync(join(carpeta, 'timbrado.xml'), aUtf8SinBom(xmlTimbrado));
        paso(
          'El XML timbrado trae el TimbreFiscalDigital',
          /TimbreFiscalDigital/.test(xmlTimbrado),
          join(carpeta, 'timbrado.xml'),
        );
      }

      if (uuid) {
        const c = await consulta(uuid);
        const uuidConsulta = valor(c.texto, 'UUID') ?? valor(c.texto, 'uuid');
        paso(
          'La consulta encuentra el mismo UUID',
          !existe(c.texto, 'Fault') && uuidConsulta?.toUpperCase() === uuid.toUpperCase(),
          existe(c.texto, 'Fault') ? valor(c.texto, 'faultstring') : `HTTP ${c.status} en ${c.ms} ms`,
        );
      }
    }
  } catch (e) {
    // Timeout o corte de red: el PAC PUDO haber timbrado.
    timbreConsumido = true;
    paso(
      'Timbrado',
      false,
      `${e.message} — RESULTADO INCIERTO: no reintentar sin consultar primero`,
    );
  }
}

finalizar(0);

// ---------------------------------------------------------------------------

function elementosDe(raiz, nombre) {
  const out = [];
  for (const hijo of raiz.children) {
    if (hijo.name === nombre) out.push(hijo);
    out.push(...elementosDe(hijo, nombre));
  }
  return out;
}

async function soap(accion, cuerpo, timeoutMs = 30000) {
  const sobre =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Header/><soapenv:Body>${cuerpo}</soapenv:Body></soapenv:Envelope>`;
  const t0 = Date.now();
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${accion}"` },
    body: sobre,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: resp.status, texto: await resp.text(), ms: Date.now() - t0 };
}

function consulta(uuid) {
  return soap(
    'consulta',
    `<tim:consulta xmlns:tim="http://ws.cfdiquadrum.com.mx/timbrar">` +
      `<tim:usuario>${escaparTexto(USUARIO)}</tim:usuario>` +
      `<tim:contrasena>${escaparTexto(CONTRASENA)}</tim:contrasena>` +
      `<tim:uuid>${escaparTexto(uuid)}</tim:uuid>` +
      `</tim:consulta>`,
  );
}

function finalizar(codigoBase) {
  const fallas = pasos.filter((p) => !p.ok);
  log('');
  log('='.repeat(78));
  log(`  RESULTADO: ${pasos.length - fallas.length}/${pasos.length} verificaciones OK`);
  if (fallas.length) {
    log('');
    for (const f of fallas) log(`  FALLA: ${f.nombre}`);
  }
  log('='.repeat(78));
  log('');
  if (timbreConsumido) {
    log('  NOTA: se envio un comprobante a `timbrar` en el ambiente de PRUEBAS.');
    log('  La evidencia quedo en cfdi-timbrados/.');
  } else {
    log('  NOTA: no se consumio ningun timbre. El sellado se valido localmente');
    log('  contra la llave publica del certificado, y con el PAC solo se uso la');
    log('  operacion `consulta`, que es de solo lectura.');
  }
  log('');

  const destino = resolve('cfdi-prueba-integral.txt');
  writeFileSync(destino, lineas.join('\n') + '\n', 'utf8');
  console.log(`Reporte escrito en: ${destino}`);
  process.exitCode = fallas.length ? 1 : codigoBase;
  // Salida inmediata solo en el fallo temprano (antes de cualquier fetch). Con
  // un fetch recien terminado, `process.exit()` en Windows truena en libuv
  // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"); al final basta
  // con dejar que el proceso termine solo.
  if (codigoBase !== 0) process.exit(process.exitCode);
}
