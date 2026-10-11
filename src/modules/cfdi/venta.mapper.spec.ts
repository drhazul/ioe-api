import {
  FilasVenta,
  mapearVenta,
  normalizarNombreSat,
  normalizarUsoCfdi,
  VentaInvalidaError,
} from './venta.mapper';

const CONTEXTO = { serie: 'JIFJ', folio: '1234', fecha: '2026-09-23T10:15:00' };

function filas(cambios: Partial<FilasVenta> = {}): FilasVenta {
  return {
    header: {
      IDFOL: 'F-001',
      SUC: '01',
      CLIEN: 500,
      RfcEmisor: 'JIFJ4704238T5',
      RfcReceptor: 'EKU9003173C9',
      RazonSocialReceptor: 'Escuela Kemper Urgate, S.A. de C.V.',
      UsoCfdi: 'G03',
      MetodoDePago: 'PUE',
      FormaPago: 3,
      FormaPagoSAT: '03',
    },
    detalle: [
      {
        IDD: 1,
        ClaveProdServ: '01010101',
        NoIdentificacion: 'ART-001',
        Descripcion: 'ARMAZON',
        Cantidad: 2,
        ValorUnitario: 100,
        PVTAT: 200,
        Unidad: 'H87',
        ObjetoImp: '02',
        IvaTasa: 0.16,
        Descuento: 0,
      },
    ],
    cliente: {
      CLIEN: 500,
      RFCRECEPTOR: 'EKU9003173C9',
      CODIGOPOSTALRECEPTOR: '42501',
      REGIMENRECEPTOR: '601',
    },
    sucursal: { SUC: '01', RFC: 'JIFJ4704238T5' },
    ...cambios,
  };
}

describe('mapearVenta', () => {
  it('arma los datos de una venta normal', () => {
    const datos = mapearVenta(filas(), CONTEXTO);

    expect(datos.rfcEmisor).toBe('JIFJ4704238T5');
    expect(datos.serie).toBe('JIFJ');
    expect(datos.folio).toBe('1234');
    expect(datos.metodoPago).toBe('PUE');
    expect(datos.formaPago).toBe('03');
    expect(datos.receptor).toEqual({
      rfc: 'EKU9003173C9',
      // Sin el regimen de capital: asi lo pide el CFDI 4.0.
      nombre: 'ESCUELA KEMPER URGATE',
      domicilioFiscal: '42501',
      regimenFiscal: '601',
      usoCfdi: 'G03',
    });
    expect(datos.conceptos).toHaveLength(1);
    expect(datos.conceptos[0]).toMatchObject({
      claveProdServ: '01010101',
      noIdentificacion: 'ART-001',
      cantidad: 2,
      claveUnidad: 'H87',
      valorUnitario: 100,
      objetoImp: '02',
    });
    expect(datos.informacionGlobal).toBeUndefined();
  });

  it('devuelve el descuento al unitario, porque PVTAT ya lo trae aplicado', () => {
    // PVTAT = 180 con 20 de descuento sobre 2 piezas: el unitario del CFDI es
    // (180 + 20) / 2 = 100, y el descuento va en su propio atributo.
    const datos = mapearVenta(
      filas({
        detalle: [
          {
            Descripcion: 'ARMAZON',
            Cantidad: 2,
            PVTAT: 180,
            Descuento: 20,
            Unidad: 'H87',
          },
        ],
      }),
      CONTEXTO,
    );

    expect(datos.conceptos[0].valorUnitario).toBe(100);
    expect(datos.conceptos[0].descuento).toBe(20);
  });

  it('toma el RFC emisor de la sucursal si el folio no lo trae', () => {
    const header = { ...filas().header, RfcEmisor: '' };
    expect(mapearVenta(filas({ header }), CONTEXTO).rfcEmisor).toBe(
      'JIFJ4704238T5',
    );
  });

  it('usa FormaPago cuando FormaPagoSAT viene vacia', () => {
    const header = { ...filas().header, FormaPagoSAT: '', FormaPago: 3 };
    expect(mapearVenta(filas({ header }), CONTEXTO).formaPago).toBe('03');
  });

  it('publico en general: nombre, regimen 616 e InformacionGlobal', () => {
    const header = {
      ...filas().header,
      RfcReceptor: 'XAXX010101000',
      RazonSocialReceptor: 'publico en general',
      UsoCfdi: 'S01',
    };
    const datos = mapearVenta(filas({ header }), CONTEXTO);

    expect(datos.receptor.nombre).toBe('PUBLICO EN GENERAL');
    expect(datos.receptor.regimenFiscal).toBe('616');
    expect(datos.informacionGlobal).toEqual({
      periodicidad: '01',
      meses: '09',
      anio: '2026',
    });
  });
});

describe('mapearVenta — lo que detiene antes de timbrar', () => {
  const casos: [string, Partial<FilasVenta>, RegExp][] = [
    [
      'UsoCfdi con basura de pantalla',
      { header: { ...filas().header, UsoCfdi: 'SELECCIONAR' } },
      /UsoCfdi valido/,
    ],
    [
      'folio sin RFC emisor ni sucursal',
      { header: { ...filas().header, RfcEmisor: '' }, sucursal: null },
      /RFC emisor/,
    ],
    ['folio sin conceptos', { detalle: [] }, /no tiene conceptos/],
    [
      'cliente sin codigo postal',
      { cliente: { RFCRECEPTOR: 'EKU9003173C9', REGIMENRECEPTOR: '601' } },
      /codigo postal/,
    ],
    [
      'cliente sin regimen fiscal',
      {
        cliente: { RFCRECEPTOR: 'EKU9003173C9', CODIGOPOSTALRECEPTOR: '42501' },
      },
      /regimen fiscal/,
    ],
    [
      'metodo de pago invalido',
      { header: { ...filas().header, MetodoDePago: 'CONTADO' } },
      /solo PUE o PPD/,
    ],
    [
      'concepto con cantidad cero',
      { detalle: [{ Descripcion: 'X', Cantidad: 0, PVTAT: 10 }] },
      /cantidad/i,
    ],
  ];

  it.each(casos)('rechaza %s', (_titulo, cambios, esperado) => {
    expect(() => mapearVenta(filas(cambios), CONTEXTO)).toThrow(esperado);
  });

  it('el error dice de que folio se trata', () => {
    const header = { ...filas().header, UsoCfdi: '' };
    expect(() => mapearVenta(filas({ header }), CONTEXTO)).toThrow(
      VentaInvalidaError,
    );
    expect(() => mapearVenta(filas({ header }), CONTEXTO)).toThrow(/F-001/);
  });
});

describe('normalizarNombreSat', () => {
  it.each([
    ['Grupo A & B, S.A. de C.V.', 'GRUPO A & B'],
    ['OPTICAS DEL SUR SA DE CV', 'OPTICAS DEL SUR'],
    ['SERVICIOS INTEGRALES S. DE R.L. DE C.V.', 'SERVICIOS INTEGRALES'],
    ['  juan   perez  ', 'JUAN PEREZ'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(normalizarNombreSat(entrada)).toBe(esperado);
  });
});

describe('normalizarUsoCfdi', () => {
  it.each([
    ['G03', 'G03'],
    ['g03 - Gastos en general', 'G03'],
    ['SELECCIONAR', ''],
    ['-', ''],
    ['', ''],
  ])('%s -> %s', (entrada, esperado) => {
    expect(normalizarUsoCfdi(entrada)).toBe(esperado);
  });
});
