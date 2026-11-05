import { ConfigService } from '@nestjs/config';
import { QuadrumCancelacionClient } from './quadrum-cancelacion.client';
import { PacError } from './quadrum.client';

// Contratos observados en los WSDL oficiales el 2026-10-13.
// Credenciales y documentos ficticios; fetch siempre simulado.
const contratos = [
  {
    host: 'ws',
    campos: [
      'usuario',
      'contrasena',
      'taxpayer_id',
      'rtaxpayer_id',
      'uuid',
      'total',
    ],
  },
  {
    host: 'devws',
    campos: [
      'usario',
      'password',
      'taxpayer_id',
      'rtaxpayer_id',
      'uuid',
      'total',
    ],
  },
];

const entrada = {
  uuid: 'AAAAAAAA-1111-2222-3333-444455556666',
  rfcEmisor: 'AAA010101AAA',
  rfcReceptor: 'BBB010101BBB',
  total: '139.20',
  cuenta: { usuario: 'cuenta&prueba', contrasena: 'clave<prueba>' },
};

function cliente(host: string) {
  const variables: Record<string, string> = {
    QUADRUM_ENDPOINT: `https://${host}.cfdiquadrum.com.mx/timbrar`,
    QUADRUM_CANCELAR_ENDPOINT: `https://${host}.cfdiquadrum.com.mx/cancelar`,
    QUADRUM_USUARIO: 'cuenta-global-no-seleccionada',
    QUADRUM_CONTRASENA: 'clave-global-no-seleccionada',
  };
  const config = { get: (key: string) => variables[key] } as ConfigService;
  return new QuadrumCancelacionClient(config);
}

const respuesta = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <obtiene_status_satResponse xmlns="http://ws.cfdiquadrum.com.mx/cancelar">
      <obtiene_status_satResult>
        <CodigoEstatus>S - Comprobante obtenido satisfactoriamente.</CodigoEstatus>
        <Estado>Vigente</Estado>
        <EsCancelable>Cancelable sin aceptacion</EsCancelable>
      </obtiene_status_satResult>
    </obtiene_status_satResponse>
  </soap:Body>
</soap:Envelope>`;

afterEach(() => jest.restoreAllMocks());

describe('QuadrumCancelacionClient — contrato de consulta SAT por ambiente', () => {
  it.each(contratos)(
    'usa el contrato oficial de $host y cuenta del RFC',
    async ({ host, campos }) => {
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(respuesta, { status: 200 }));

      await expect(cliente(host).estatusSat(entrada)).resolves.toMatchObject({
        estado: 'Vigente',
        esCancelable: 'Cancelable sin aceptacion',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://${host}.cfdiquadrum.com.mx/cancelar`);
      expect(init).toMatchObject({
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"obtiene_status_sat"',
        },
      });
      const cuerpo = String(init?.body);
      expect(cuerpo).toContain(
        'xmlns:can="http://ws.cfdiquadrum.com.mx/cancelar"',
      );
      const valores = [
        'cuenta&amp;prueba',
        'clave&lt;prueba&gt;',
        entrada.rfcEmisor,
        entrada.rfcReceptor,
        entrada.uuid,
        entrada.total,
      ];
      const peticionContrato = campos
        .map((campo, i) => `<can:${campo}>${valores[i]}</can:${campo}>`)
        .join('');
      expect(cuerpo).toContain(`>${peticionContrato}</can:obtiene_status_sat>`);
      expect(cuerpo.match(/<can:(?!obtiene_status_sat\b)[\w]+>/g)).toHaveLength(
        6,
      );
      expect(cuerpo).not.toContain('global-no-seleccionada');
    },
  );

  it('no convierte error PAC dentro de HTTP 200 en estado Vigente', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          respuesta.replace(
            '<Estado>Vigente</Estado>',
            '<error>Consulta rechazada</error>',
          ),
          { status: 200 },
        ),
      );
    await expect(cliente('ws').estatusSat(entrada)).rejects.toThrow(PacError);
  });
});

describe('QuadrumCancelacionClient — contrato de cancelar revisado 2026-10-29', () => {
  const certPem = Buffer.from(
    '-----BEGIN CERTIFICATE-----\nCERTIFICADO-FICTICIO\n-----END CERTIFICATE-----',
  );
  const keyPem = Buffer.from('LLAVE-FICTICIA-DE-PRUEBA');
  const sustituye = 'BBBBBBBB-1111-2222-3333-444455556666';
  const response = (codigo: string) =>
    `<cancelarResult><Folios><Folio><UUID>${entrada.uuid}</UUID><EstatusUUID>${codigo}</EstatusUUID></Folio></Folios></cancelarResult>`;

  it.each(['ws', 'devws'])(
    'SOAP cancelar de %s usa datos del emisor y PEM en base64, sin reintento',
    async (host) => {
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(response('201'), { status: 200 }));
      await cliente(host).cancelar({
        ...entrada,
        motivo: '01',
        folioSustitucion: sustituye,
        cer: certPem,
        key: keyPem,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://${host}.cfdiquadrum.com.mx/cancelar`);
      expect(init?.headers).toEqual({
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"cancelar"',
      });
      const body = String(init?.body);
      expect(body).toContain(
        'xmlns:can="http://ws.cfdiquadrum.com.mx/cancelar"',
      );
      expect(body).toContain('xmlns:vw="apps.services.soap.core.views"');
      const campos = [...body.matchAll(/<can:(\w+)>/g)].map(
        (match) => match[1],
      );
      expect(campos).toEqual([
        'UUIDS',
        'usuario',
        'contrasena',
        'rfc',
        'cer',
        'key',
        'reintentar',
      ]);
      expect(body).toContain(`UUID="${entrada.uuid}"`);
      expect(body).toContain('Motivo="01"');
      expect(body).toContain(`FolioSustitucion="${sustituye}"`);
      expect(body).toContain('<can:usuario>cuenta&amp;prueba</can:usuario>');
      expect(body).toContain(
        '<can:contrasena>clave&lt;prueba&gt;</can:contrasena>',
      );
      expect(body).toContain(`<can:rfc>${entrada.rfcEmisor}</can:rfc>`);
      expect(body).toContain(
        `<can:cer>${certPem.toString('base64')}</can:cer>`,
      );
      expect(body).toContain(`<can:key>${keyPem.toString('base64')}</can:key>`);
      expect(body).toContain('<can:reintentar>false</can:reintentar>');
      expect(body).not.toContain('global-no-seleccionada');
    },
  );

  it.each(['02', '03', '04'])(
    'motivo %s no agrega atributo de sustitución al request',
    async (motivo) => {
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(response('201'), { status: 200 }));
      await cliente('ws').cancelar({
        ...entrada,
        motivo,
        cer: certPem,
        key: keyPem,
      });
      expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain(
        'FolioSustitucion=',
      );
    },
  );

  it.each(['201', '202'])(
    'clasifica código documentado %s sin declarar estado Cancelado',
    async (codigo) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(response(codigo), { status: 200 }));
      const result = await cliente('ws').cancelar({
        ...entrada,
        motivo: '03',
        cer: certPem,
        key: keyPem,
      });
      expect(result.exitoso).toBe(true);
      expect(result.folios).toEqual([
        { uuid: entrada.uuid, estatusUUID: codigo },
      ]);
      expect(result).not.toHaveProperty('estado');
    },
  );

  it.each(['203', '204', '205', '207', '208', '209', '210', '211', '212'])(
    'no considera éxito código de rechazo %s aunque HTTP sea 200',
    async (codigo) => {
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(response(codigo), { status: 200 }));
      const result = await cliente('ws').cancelar({
        ...entrada,
        motivo: '03',
        cer: certPem,
        key: keyPem,
      });
      expect(result.exitoso).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
