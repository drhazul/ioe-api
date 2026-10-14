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
