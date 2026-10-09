import { ConfigService } from '@nestjs/config';
import { PacError, QuadrumClient } from './quadrum.client';

/**
 * ConfigService de mentira con solo lo que el cliente consulta.
 *
 * Las credenciales son INVENTADAS y deben seguir siendolo. Nunca poner las
 * reales aqui: este archivo se commitea, y la contrasena falsa trae `&` y `<>`
 * a proposito para que la prueba de escapado tenga algo que verificar.
 */
function configFalso(vars: Record<string, string> = {}) {
  const base: Record<string, string> = {
    QUADRUM_ENDPOINT: 'https://devws.cfdiquadrum.com.mx/timbrar',
    QUADRUM_USUARIO: 'usuario-prueba',
    QUADRUM_CONTRASENA: 'p4ssw0rd&<secreta>',
    ...vars,
  };
  return { get: (k: string) => base[k] } as unknown as ConfigService;
}

/** Captura el fetch para inspeccionar el sobre y responder lo que se quiera. */
function mockFetch(
  responder: (
    url: string,
    init: RequestInit,
  ) => { status: number; body: string },
) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const fake = jest.fn((url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const { status, body } = responder(url, init);
    return Promise.resolve({ status, text: () => Promise.resolve(body) });
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fake;
  return llamadas;
}

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = fetchOriginal;
  jest.restoreAllMocks();
});

const RESPUESTA_OK = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <timbrarResponse xmlns="http://ws.cfdiquadrum.com.mx/timbrar">
      <timbrarResult>
        <UUID>A1B2C3D4-1111-2222-3333-444455556666</UUID>
        <Fecha>2026-09-10T10:15:00</Fecha>
        <CodEstatus>Comprobante timbrado satisfactoriamente</CodEstatus>
        <SelloSAT>abc123==</SelloSAT>
        <NoCertificadoSAT>30001000000400002495</NoCertificadoSAT>
        <xml>&lt;cfdi:Comprobante Version="4.0" Nombre="GRUPO A &amp;amp; B"/&gt;</xml>
      </timbrarResult>
    </timbrarResponse>
  </soap:Body>
</soap:Envelope>`;

/** La consulta responde en `consultaResult`, no en `timbrarResult`. */
const RESPUESTA_CONSULTA_OK = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <consultaResponse xmlns="http://ws.cfdiquadrum.com.mx/timbrar">
      <consultaResult>
        <UUID>A1B2C3D4-1111-2222-3333-444455556666</UUID>
        <CodEstatus>Vigente</CodEstatus>
      </consultaResult>
    </consultaResponse>
  </soap:Body>
</soap:Envelope>`;

/**
 * Respuesta REAL de devws.cfdiquadrum.com.mx (10-sep-2026) al consultar un UUID
 * inexistente. Capturada con `scripts/quadrum-ping.mjs`.
 *
 * Dos cosas que solo se supieron al hablar con el servicio de verdad:
 *  1. "No encontrado" llega como SOAP Fault con HTTP 500, no como un
 *     consultaResult vacio.
 *  2. El PAC usa el prefijo `senv:` y declara una docena de namespaces. Por eso
 *     el parser busca por nombre local y no por namespace.
 *
 * El error de dedo en "econtre" es de ellos; se deja literal a proposito.
 */
const RESPUESTA_REAL_UUID_INEXISTENTE = `<?xml version='1.0' encoding='UTF-8'?>
<senv:Envelope xmlns:plink="http://schemas.xmlsoap.org/ws/2003/05/partner-link/" xmlns:s0="apps.services.soap.core.views" xmlns:senv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://ws.cfdiquadrum.com.mx/timbrar" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><senv:Body><senv:Fault><faultcode>senv:Server</faultcode><faultstring>No econtre informacion de la factura.</faultstring><faultactor></faultactor></senv:Fault></senv:Body></senv:Envelope>`;

describe('QuadrumClient — contra la respuesta real del PAC', () => {
  it('lee el Fault de "no encontrado" que devuelve devws', async () => {
    mockFetch(() => ({ status: 500, body: RESPUESTA_REAL_UUID_INEXISTENTE }));

    const c = new QuadrumClient(configFalso());
    try {
      await c.consultar('00000000-0000-0000-0000-000000000000');
      throw new Error('debio lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(PacError);
      expect((e as PacError).message).toContain(
        'No econtre informacion de la factura',
      );
      // El PAC contesto: se sabe que ese UUID no existe. No es incierto.
      expect((e as PacError).resultadoIncierto).toBe(false);
    }
  });
});

describe('QuadrumClient — configuracion', () => {
  it('usa devws como endpoint por defecto', () => {
    const c = new QuadrumClient(configFalso({ QUADRUM_ENDPOINT: '' }));
    expect(c.getEndpoint()).toBe('https://devws.cfdiquadrum.com.mx/timbrar');
  });

  it('distingue pruebas de produccion por el "dev" del endpoint', () => {
    expect(new QuadrumClient(configFalso()).esProduccion()).toBe(false);
    const prod = new QuadrumClient(
      configFalso({
        QUADRUM_ENDPOINT: 'https://ws.cfdiquadrum.com.mx/timbrar',
      }),
    );
    expect(prod.esProduccion()).toBe(true);
  });

  it('falla claro si faltan credenciales', async () => {
    const c = new QuadrumClient(configFalso({ QUADRUM_USUARIO: '' }));
    expect(c.hasCredentials()).toBe(false);
    await expect(c.consultar('x')).rejects.toThrow(/QUADRUM_USUARIO/);
  });
});

describe('QuadrumClient — el sobre SOAP', () => {
  it('arma el sobre de timbrar con el contrato de Quadrum', async () => {
    const llamadas = mockFetch(() => ({ status: 200, body: RESPUESTA_OK }));
    const c = new QuadrumClient(configFalso());
    await c.timbrar(Buffer.from('<cfdi:Comprobante/>', 'utf8'));

    const { url, init } = llamadas[0];
    expect(url).toBe('https://devws.cfdiquadrum.com.mx/timbrar');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('text/xml; charset=utf-8');
    expect(headers.SOAPAction).toBe('"timbrar"');

    const sobre = init.body as string;
    expect(sobre).toContain(
      'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"',
    );
    expect(sobre).toContain(
      '<tim:timbrar xmlns:tim="http://ws.cfdiquadrum.com.mx/timbrar">',
    );
    // El XML sellado viaja en base64.
    expect(sobre).toContain(
      `<tim:xml>${Buffer.from('<cfdi:Comprobante/>', 'utf8').toString('base64')}</tim:xml>`,
    );
  });

  it('escapa las credenciales para no romper el XML del sobre', async () => {
    // La contrasena de prueba trae & y <> a proposito: sin escapar produciria
    // un sobre mal formado y el PAC responderia un Fault indescifrable.
    const llamadas = mockFetch(() => ({
      status: 200,
      body: RESPUESTA_CONSULTA_OK,
    }));
    await new QuadrumClient(configFalso()).consultar('algun-uuid');

    const sobre = llamadas[0].init.body as string;
    expect(sobre).toContain(
      '<tim:contrasena>p4ssw0rd&amp;&lt;secreta&gt;</tim:contrasena>',
    );
    expect(sobre).not.toContain('<secreta>');
  });

  it('consulta no necesita CSD ni XML, solo credenciales y UUID', async () => {
    const llamadas = mockFetch(() => ({
      status: 200,
      body: RESPUESTA_CONSULTA_OK,
    }));
    await new QuadrumClient(configFalso()).consultar('  UUID-CON-ESPACIOS  ');

    const { init } = llamadas[0];
    expect((init.headers as Record<string, string>).SOAPAction).toBe(
      '"consulta"',
    );
    expect(init.body as string).toContain(
      '<tim:uuid>UUID-CON-ESPACIOS</tim:uuid>',
    );
  });
});

describe('QuadrumClient — lectura de la respuesta', () => {
  it('extrae UUID y datos del timbre', async () => {
    mockFetch(() => ({ status: 200, body: RESPUESTA_OK }));
    const acuse = await new QuadrumClient(configFalso()).timbrar(
      Buffer.from('<x/>', 'utf8'),
    );

    expect(acuse.exitoso).toBe(true);
    expect(acuse.uuid).toBe('A1B2C3D4-1111-2222-3333-444455556666');
    expect(acuse.noCertificadoSAT).toBe('30001000000400002495');
    expect(acuse.incidencias).toHaveLength(0);
  });

  it('decodifica el XML timbrado que viene escapado', async () => {
    mockFetch(() => ({ status: 200, body: RESPUESTA_OK }));
    const acuse = await new QuadrumClient(configFalso()).timbrar(
      Buffer.from('<x/>', 'utf8'),
    );
    // El &amp;amp; del transporte debe quedar como &amp; del XML real,
    // no colapsarse hasta & — perder un nivel corromperia el comprobante.
    expect(acuse.xml).toBe(
      '<cfdi:Comprobante Version="4.0" Nombre="GRUPO A &amp; B"/>',
    );
  });

  it('lee las incidencias y no marca exitoso', async () => {
    mockFetch(() => ({
      status: 200,
      body: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
        <timbrarResult>
          <Incidencias>
            <Incidencia>
              <CodigoError>CFDI33133</CodigoError>
              <MensajeIncidencia>El campo FormaPago no cumple con el patron</MensajeIncidencia>
              <RfcEmisor>XIQB891116QE4</RfcEmisor>
            </Incidencia>
            <Incidencia>
              <CodigoError>CFDI40147</CodigoError>
              <MensajeIncidencia>MetodoPago PUE no admite FormaPago 99</MensajeIncidencia>
            </Incidencia>
          </Incidencias>
        </timbrarResult>
      </soap:Body></soap:Envelope>`,
    }));

    const acuse = await new QuadrumClient(configFalso()).timbrar(
      Buffer.from('<x/>', 'utf8'),
    );
    expect(acuse.exitoso).toBe(false);
    expect(acuse.incidencias).toHaveLength(2);
    expect(acuse.incidencias[0].codigoError).toBe('CFDI33133');
    expect(acuse.incidencias[1].mensajeIncidencia).toMatch(/PUE no admite/);
  });

  it('encuentra los nodos aunque Quadrum cambie el namespace', async () => {
    // El cliente C# documenta que el PAC ha cambiado namespaces entre
    // versiones; por eso se busca por nombre local.
    mockFetch(() => ({
      status: 200,
      body: `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>
        <q7:timbrarResult xmlns:q7="http://otro.namespace.inventado/v9">
          <q7:UUID>NS-CAMBIADO-OK</q7:UUID>
        </q7:timbrarResult>
      </s:Body></s:Envelope>`,
    }));
    const acuse = await new QuadrumClient(configFalso()).timbrar(
      Buffer.from('<x/>', 'utf8'),
    );
    expect(acuse.uuid).toBe('NS-CAMBIADO-OK');
  });
});

describe('QuadrumClient — errores y reintentos', () => {
  it('lee el SOAP Fault que llega con HTTP 500, no lo descarta', async () => {
    mockFetch(() => ({
      status: 500,
      body: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
        <soap:Fault>
          <faultcode>soap:Server</faultcode>
          <faultstring>Usuario o contrasena incorrectos</faultstring>
        </soap:Fault>
      </soap:Body></soap:Envelope>`,
    }));

    const c = new QuadrumClient(configFalso());
    await expect(c.consultar('x')).rejects.toThrow(/Usuario o contrasena/);
  });

  it('un Fault NO marca resultado incierto: se sabe que no timbro', async () => {
    mockFetch(() => ({
      status: 500,
      body: `<Envelope><Body><Fault><faultcode>Client</faultcode><faultstring>XML invalido</faultstring></Fault></Body></Envelope>`,
    }));
    try {
      await new QuadrumClient(configFalso()).timbrar(Buffer.from('<x/>'));
      throw new Error('debio lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(PacError);
      expect((e as PacError).resultadoIncierto).toBe(false);
    }
  });

  it('un timeout SI marca resultado incierto y avisa que hay que consultar', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('The operation was aborted')),
          );
        }),
    );

    const c = new QuadrumClient(configFalso({ QUADRUM_TIMEOUT_MS: '20' }));
    try {
      await c.timbrar(Buffer.from('<x/>'));
      throw new Error('debio lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(PacError);
      expect((e as PacError).resultadoIncierto).toBe(true);
      expect((e as PacError).message).toMatch(
        /consulta por UUID antes de reintentar/,
      );
    }
  });

  it('una respuesta vacia es resultado incierto', async () => {
    mockFetch(() => ({ status: 200, body: '   ' }));
    try {
      await new QuadrumClient(configFalso()).timbrar(Buffer.from('<x/>'));
      throw new Error('debio lanzar');
    } catch (e) {
      expect((e as PacError).resultadoIncierto).toBe(true);
    }
  });

  it('rechaza un XML sellado vacio antes de gastar una llamada', async () => {
    const llamadas = mockFetch(() => ({ status: 200, body: RESPUESTA_OK }));
    await expect(
      new QuadrumClient(configFalso()).timbrar(Buffer.alloc(0)),
    ).rejects.toThrow(/vacio/);
    expect(llamadas).toHaveLength(0);
  });
});

describe('QuadrumClient.censurar', () => {
  it('oculta usuario y contrasena para poder registrar el sobre', () => {
    const sobre =
      '<tim:usuario>sergio</tim:usuario><tim:contrasena>secreta123</tim:contrasena>';
    const seguro = QuadrumClient.censurar(sobre);
    expect(seguro).not.toContain('secreta123');
    expect(seguro).not.toContain('sergio');
    expect(seguro).toContain('<tim:contrasena>***</tim:contrasena>');
  });
});
