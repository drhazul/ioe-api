import { cadenaOriginal } from './cadena-original';
import { serializarXml } from './cfdi-node';
import {
  construirReciboPago,
  DatosReciboPago,
  ReciboPagoInvalidoError,
} from './recibo-pago';

function datos(cambios: Partial<DatosReciboPago> = {}): DatosReciboPago {
  return {
    serie: 'PGXI',
    folio: '00001',
    fecha: '2026-10-01T12:00:00',
    emisor: {
      rfc: 'XIQB891116QE4',
      nombre: 'BERENICE XIMO QUEZADA',
      regimenFiscal: '612',
      lugarExpedicion: '40968',
    },
    receptor: {
      rfc: 'XAXX010101000',
      nombre: 'PUBLICO EN GENERAL',
      domicilioFiscal: '40968',
      regimenFiscal: '616',
    },
    factura: {
      uuid: 'A63A5EAA-273F-5BA7-8801-781893358789',
      serie: 'XIQB',
      folio: '00003',
      moneda: 'MXN',
    },
    fechaPago: '2026-10-01T10:00:00',
    formaDePago: '03',
    monto: 348,
    parcialidad: 1,
    saldoAnterior: 1160,
    ...cambios,
  };
}

const attrs = (xml: string, elemento: string): Record<string, string> => {
  const m = new RegExp(`<${elemento}\\s([^>]*?)/?>`).exec(xml);
  const salida: Record<string, string> = {};
  if (!m) return salida;
  for (const par of m[1].matchAll(/([\w:]+)="([^"]*)"/g)) {
    salida[par[1]] = par[2];
  }
  return salida;
};

describe('construirReciboPago', () => {
  it('el comprobante va en ceros: el dinero vive en el complemento', () => {
    const xml = serializarXml(construirReciboPago(datos()));
    const c = attrs(xml, 'cfdi:Comprobante');

    expect(c.TipoDeComprobante).toBe('P');
    expect(c.SubTotal).toBe('0');
    expect(c.Total).toBe('0');
    expect(c.Moneda).toBe('XXX');
    // El SAT prohibe estos dos en un REP.
    expect(c.FormaPago).toBeUndefined();
    expect(c.MetodoPago).toBeUndefined();
  });

  it('el receptor siempre usa CP01 y el concepto es el fijo del SAT', () => {
    const xml = serializarXml(construirReciboPago(datos()));

    expect(attrs(xml, 'cfdi:Receptor').UsoCFDI).toBe('CP01');
    const concepto = attrs(xml, 'cfdi:Concepto');
    expect(concepto.ClaveProdServ).toBe('84111506');
    expect(concepto.ClaveUnidad).toBe('ACT');
    expect(concepto.ValorUnitario).toBe('0');
    expect(concepto.ObjetoImp).toBe('01');
  });

  it('separa el IVA del monto y deja cuadrado el saldo', () => {
    const xml = serializarXml(construirReciboPago(datos()));
    const dr = attrs(xml, 'pago20:DoctoRelacionado');

    expect(dr.ImpSaldoAnt).toBe('1160.00');
    expect(dr.ImpPagado).toBe('348.00');
    expect(dr.ImpSaldoInsoluto).toBe('812.00');
    expect(dr.NumParcialidad).toBe('1');

    // 348 con IVA al 16% = 300 de base + 48 de impuesto.
    const traslado = attrs(xml, 'pago20:TrasladoDR');
    expect(Number(traslado.BaseDR)).toBeCloseTo(300, 4);
    expect(Number(traslado.ImporteDR)).toBeCloseTo(48, 4);

    const totales = attrs(xml, 'pago20:Totales');
    expect(totales.MontoTotalPagos).toBe('348.00');
    expect(totales.TotalTrasladosBaseIVA16).toBe('300.00');
    expect(totales.TotalTrasladosImpuestoIVA16).toBe('48.00');
  });

  it('la cadena original incluye el complemento de pagos', () => {
    const comprobante = construirReciboPago(datos());
    // El sellador los pone antes de armar la cadena; aqui se simula. El
    // mapa es de solo lectura por diseno, de ahi el casteo.
    const attrsEscribibles = comprobante.attrs as Map<string, string>;
    attrsEscribibles.set('NoCertificado', '30001000000500003364');
    attrsEscribibles.set('Certificado', 'MIIF...');

    const cadena = cadenaOriginal(comprobante);

    expect(cadena.startsWith('||4.0|PGXI|00001|')).toBe(true);
    // El UUID de la factura pagada tiene que ir en la cadena.
    expect(cadena).toContain('A63A5EAA-273F-5BA7-8801-781893358789');
    expect(cadena.endsWith('||')).toBe(true);
  });

  it('no deja pagar mas de lo que se debe', () => {
    expect(() =>
      construirReciboPago(datos({ monto: 1200, saldoAnterior: 1160 })),
    ).toThrow(ReciboPagoInvalidoError);
  });

  it('rechaza la forma de pago 99, que solo vale en la factura a credito', () => {
    expect(() => construirReciboPago(datos({ formaDePago: '99' }))).toThrow(
      /99/,
    );
  });

  it('rechaza montos y parcialidades imposibles', () => {
    expect(() => construirReciboPago(datos({ monto: 0 }))).toThrow(
      ReciboPagoInvalidoError,
    );
    expect(() => construirReciboPago(datos({ parcialidad: 0 }))).toThrow(
      ReciboPagoInvalidoError,
    );
    expect(() => construirReciboPago(datos({ saldoAnterior: 0 }))).toThrow(
      ReciboPagoInvalidoError,
    );
  });

  it('un segundo abono continua la parcialidad y baja el saldo', () => {
    const xml = serializarXml(
      construirReciboPago(
        datos({ parcialidad: 2, monto: 500, saldoAnterior: 812 }),
      ),
    );
    const dr = attrs(xml, 'pago20:DoctoRelacionado');

    expect(dr.NumParcialidad).toBe('2');
    expect(dr.ImpSaldoAnt).toBe('812.00');
    expect(dr.ImpSaldoInsoluto).toBe('312.00');
  });
});
