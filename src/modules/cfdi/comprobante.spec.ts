import { cadenaOriginal } from './cadena-original';
import { serializarXml } from './cfdi-node';
import {
  ComprobanteInvalidoError,
  construirComprobante,
  DatosComprobante,
} from './comprobante';

function datos(cambios: Partial<DatosComprobante> = {}): DatosComprobante {
  return {
    serie: 'JIFJ',
    folio: '1234',
    fecha: '2026-09-22T10:15:00',
    formaPago: '01',
    metodoPago: 'PUE',
    emisor: {
      rfc: 'JIFJ4704238T5',
      nombre: 'JIMENEZ FERNANDEZ JOSE',
      regimenFiscal: '612',
      lugarExpedicion: '39000',
    },
    receptor: {
      rfc: 'EKU9003173C9',
      nombre: 'ESCUELA KEMPER URGATE',
      domicilioFiscal: '42501',
      regimenFiscal: '601',
      usoCfdi: 'G03',
    },
    conceptos: [
      {
        claveProdServ: '01010101',
        cantidad: 2,
        claveUnidad: 'H87',
        descripcion: 'ARTICULO A',
        valorUnitario: 100,
      },
    ],
    ...cambios,
  };
}

/** Lee un atributo del XML. El ancla evita que "Total" case con "SubTotal". */
const attr = (xml: string, nombre: string) =>
  xml.match(new RegExp('[ <]' + nombre + '="([^"]*)"'))?.[1];

describe('construirComprobante — totales', () => {
  it('suma importes, IVA y total', () => {
    const xml = serializarXml(construirComprobante(datos()));

    expect(attr(xml, 'SubTotal')).toBe('200.00');
    expect(attr(xml, 'TotalImpuestosTrasladados')).toBe('32.00');
    expect(attr(xml, 'Total')).toBe('232.00');
  });

  it('el Importe se calcula con el ValorUnitario YA redondeado (bug #2)', () => {
    // 862.068966 se escribe como 862.068966 y 7 x eso = 6034.48. Lo que no
    // puede pasar es que el XML diga un unitario y el importe salga de otro.
    const xml = serializarXml(
      construirComprobante(
        datos({
          conceptos: [
            {
              claveProdServ: '01010101',
              cantidad: 7,
              claveUnidad: 'H87',
              descripcion: 'ARTICULO',
              valorUnitario: 862.0689664,
            },
          ],
        }),
      ),
    );

    const unitario = Number(attr(xml, 'ValorUnitario'));
    const cantidad = Number(attr(xml, 'Cantidad'));
    const importe = Number(attr(xml, 'Importe'));
    expect(attr(xml, 'ValorUnitario')).toBe('862.068966');
    expect(importe).toBe(Number((cantidad * unitario).toFixed(2)));
  });

  it('descuenta antes de calcular el IVA', () => {
    const xml = serializarXml(
      construirComprobante(
        datos({
          conceptos: [
            {
              claveProdServ: '01010101',
              cantidad: 1,
              claveUnidad: 'H87',
              descripcion: 'ARTICULO',
              valorUnitario: 100,
              descuento: 20,
            },
          ],
        }),
      ),
    );

    expect(attr(xml, 'SubTotal')).toBe('100.00');
    expect(attr(xml, 'Descuento')).toBe('20.00');
    expect(attr(xml, 'Base')).toBe('80.00');
    expect(attr(xml, 'TotalImpuestosTrasladados')).toBe('12.80');
    expect(attr(xml, 'Total')).toBe('92.80');
  });

  it('un concepto no objeto de impuesto no genera traslados', () => {
    const xml = serializarXml(
      construirComprobante(
        datos({
          conceptos: [
            {
              claveProdServ: '01010101',
              cantidad: 1,
              claveUnidad: 'H87',
              descripcion: 'ARTICULO',
              valorUnitario: 100,
              objetoImp: '01',
            },
          ],
        }),
      ),
    );

    expect(xml).not.toContain('cfdi:Traslado');
    expect(xml).not.toContain('TotalImpuestosTrasladados');
    expect(attr(xml, 'Total')).toBe('100.00');
  });

  it('agrupa los traslados globales por tasa', () => {
    const xml = serializarXml(
      construirComprobante(
        datos({
          conceptos: [
            {
              claveProdServ: '01010101',
              cantidad: 1,
              claveUnidad: 'H87',
              descripcion: 'IVA 16',
              valorUnitario: 100,
            },
            {
              claveProdServ: '01010101',
              cantidad: 1,
              claveUnidad: 'H87',
              descripcion: 'OTRO IVA 16',
              valorUnitario: 50,
            },
          ],
        }),
      ),
    );

    const globales = xml.slice(xml.lastIndexOf('<cfdi:Impuestos'));
    expect(globales.match(/<cfdi:Traslado /g)).toHaveLength(1);
    expect(globales).toContain('Base="150.00"');
    expect(globales).toContain('Importe="24.00"');
  });

  it('genera una cadena original valida', () => {
    const comprobante = construirComprobante(datos());
    const conCertificado = {
      ...comprobante,
      attrs: new Map([
        ...comprobante.attrs,
        ['NoCertificado', '30001000000500003364'],
      ]),
    };

    expect(cadenaOriginal(conCertificado)).toContain(
      '|JIFJ4704238T5|JIMENEZ FERNANDEZ JOSE|612|EKU9003173C9|',
    );
  });
});

describe('construirComprobante — lo que rechaza antes de gastar un timbre', () => {
  it('PUE con forma de pago 99', () => {
    expect(() =>
      construirComprobante(datos({ metodoPago: 'PUE', formaPago: '99' })),
    ).toThrow(/99 es solo para PPD/);
  });

  it('PPD con cualquier forma distinta de 99', () => {
    expect(() =>
      construirComprobante(datos({ metodoPago: 'PPD', formaPago: '03' })),
    ).toThrow(/debe llevar forma de pago 99/);
  });

  it('acepta PPD con forma 99', () => {
    const xml = serializarXml(
      construirComprobante(datos({ metodoPago: 'PPD', formaPago: '99' })),
    );
    expect(attr(xml, 'MetodoPago')).toBe('PPD');
    expect(attr(xml, 'FormaPago')).toBe('99');
  });

  it('un UsoCfdi con basura de pantalla', () => {
    // En FAC_SVR_SHAP hay renglones con 'SELECCIONAR' en campos fiscales.
    const receptor = { ...datos().receptor, usoCfdi: 'SELECCIONAR' };
    expect(() => construirComprobante(datos({ receptor }))).toThrow(
      /Falta el UsoCFDI/,
    );
  });

  it('publico en general sin InformacionGlobal', () => {
    const receptor = {
      rfc: 'XAXX010101000',
      nombre: 'PUBLICO EN GENERAL',
      domicilioFiscal: '39000',
      regimenFiscal: '616',
      usoCfdi: 'S01',
    };
    expect(() => construirComprobante(datos({ receptor }))).toThrow(
      /exige el nodo InformacionGlobal/,
    );
  });

  it('publico en general con UsoCfdi distinto de S01', () => {
    const receptor = {
      rfc: 'XAXX010101000',
      nombre: 'PUBLICO EN GENERAL',
      domicilioFiscal: '39000',
      regimenFiscal: '616',
      usoCfdi: 'G03',
    };
    expect(() =>
      construirComprobante(
        datos({
          receptor,
          informacionGlobal: {
            periodicidad: '01',
            meses: '09',
            anio: '2026',
          },
        }),
      ),
    ).toThrow(/debe ser S01/);
  });

  it('InformacionGlobal en una factura con RFC propio', () => {
    expect(() =>
      construirComprobante(
        datos({
          informacionGlobal: {
            periodicidad: '01',
            meses: '09',
            anio: '2026',
          },
        }),
      ),
    ).toThrow(/solo va en facturas a PUBLICO EN GENERAL/);
  });

  it('un descuento mayor que el importe', () => {
    expect(() =>
      construirComprobante(
        datos({
          conceptos: [
            {
              claveProdServ: '01010101',
              cantidad: 1,
              claveUnidad: 'H87',
              descripcion: 'ARTICULO',
              valorUnitario: 100,
              descuento: 150,
            },
          ],
        }),
      ),
    ).toThrow(/descuento/i);
  });

  it('cantidad en cero', () => {
    expect(() =>
      construirComprobante(
        datos({
          conceptos: [
            {
              claveProdServ: '01010101',
              cantidad: 0,
              claveUnidad: 'H87',
              descripcion: 'ARTICULO',
              valorUnitario: 100,
            },
          ],
        }),
      ),
    ).toThrow(/mayor que cero/);
  });

  it('un comprobante sin conceptos', () => {
    expect(() => construirComprobante(datos({ conceptos: [] }))).toThrow(
      ComprobanteInvalidoError,
    );
  });

  it('una fecha en formato equivocado', () => {
    expect(() =>
      construirComprobante(datos({ fecha: '2026-09-22T10:15:00.000Z' })),
    ).toThrow(/Fecha/);
  });
});
