import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cargarCsd } from './cfdi-sellador';
import { CsdService } from './csd.service';
import { CsdStore } from './csd.store';
import { AcuseRecepcionCfdi, PacError, QuadrumClient } from './quadrum.client';
import { decodificarXmlEmbebido } from './soap-xml';
import { generarCsdDePrueba } from './testing/csd-de-prueba';
import { TimbradoService } from './timbrado.service';

const carpetas: string[] = [];

afterEach(() => {
  for (const c of carpetas.splice(0))
    rmSync(c, { recursive: true, force: true });
});

function armar(opciones: { produccion?: boolean; timbrar?: jest.Mock } = {}) {
  const generado = generarCsdDePrueba();
  const csd = cargarCsd(generado);
  const csdStore = {
    obtener: () => csd,
    certificadoDer: () => generado.cer,
  } as unknown as CsdStore;

  const timbrar = opciones.timbrar ?? jest.fn();
  const quadrum = {
    esProduccion: () => Boolean(opciones.produccion),
    timbrar,
  } as unknown as QuadrumClient;

  const dir = mkdtempSync(join(tmpdir(), 'cfdi-evidencia-'));
  carpetas.push(dir);
  const config = {
    get: (k: string) => (k === 'CFDI_EVIDENCIA_DIR' ? dir : undefined),
  } as unknown as ConfigService;

  // CSD del emisor de la venta: OTRO certificado, para poder comprobar que el
  // sellado usa el de la razon social y no el del .env.
  const emisorGenerado = generarCsdDePrueba({
    noCertificado: '30001000000500009999',
  });
  const obtenerPorRfc = jest.fn().mockResolvedValue({
    csd: cargarCsd(emisorGenerado),
    cer: emisorGenerado.cer,
    regimenFiscal: '612',
    codigoPostal: '39000',
  });
  const csdService = { obtenerPorRfc } as unknown as CsdService;

  return {
    service: new TimbradoService(quadrum, csdStore, config, csdService),
    timbrar,
    obtenerPorRfc,
    dir,
  };
}

function acuse(parcial: Partial<AcuseRecepcionCfdi>): AcuseRecepcionCfdi {
  return { incidencias: [], exitoso: false, ...parcial };
}

describe('TimbradoService', () => {
  it('sella, verifica y envia al PAC el XML sin BOM, guardando evidencia', async () => {
    const timbrar = jest.fn().mockResolvedValue(
      acuse({
        uuid: 'A1B2C3D4-1111-2222-3333-444455556666',
        xml: '<cfdi:Comprobante><tfd:TimbreFiscalDigital/></cfdi:Comprobante>',
        exitoso: true,
      }),
    );
    const { service } = armar({ timbrar });

    const r = await service.timbrarPrueba();

    expect(r.exitoso).toBe(true);
    expect(r.uuid).toBe('A1B2C3D4-1111-2222-3333-444455556666');
    expect(timbrar).toHaveBeenCalledTimes(1);

    const [enviado] = timbrar.mock.calls[0] as [Buffer];
    expect(enviado[0]).toBe('<'.charCodeAt(0));
    expect(enviado.toString('utf8')).toContain('Sello="');

    for (const archivo of [
      'enviado.xml',
      'cadena.txt',
      'acuse.json',
      'timbrado.xml',
    ]) {
      expect(existsSync(join(r.evidencia, archivo))).toBe(true);
    }
  });

  it('el comprobante de prueba firma el "&" literal y lo escapa solo en el XML', () => {
    const { service } = armar();
    const r = service.sellarPrueba();

    expect(r.cadena).toContain('GRUPO A & B');
    expect(r.cadena).not.toContain('&amp;');
    expect(r.xml).toContain('GRUPO A &amp; B');
    expect(r.xml).toContain('InformacionGlobal');
    // Fecha en hora local, sin zona ni milisegundos.
    expect(r.xml).toMatch(/Fecha="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"/);
  });

  it('se niega a timbrar contra produccion', async () => {
    const { service, timbrar } = armar({ produccion: true });

    await expect(service.timbrarPrueba()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(timbrar).not.toHaveBeenCalled();
  });

  it('no reintenta cuando el resultado es incierto', async () => {
    const timbrar = jest
      .fn()
      .mockRejectedValue(new PacError('Se agoto el tiempo de espera', true));
    const { service, dir } = armar({ timbrar });

    await expect(service.timbrarPrueba()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(timbrar).toHaveBeenCalledTimes(1);

    const [carpeta] = readdirSync(dir);
    const error = JSON.parse(
      readFileSync(join(dir, carpeta, 'error.json'), 'utf8'),
    ) as { resultadoIncierto: boolean };
    expect(error.resultadoIncierto).toBe(true);
  });

  it('reporta incidencias sin marcar exito ni guardar timbrado.xml', async () => {
    const timbrar = jest.fn().mockResolvedValue(
      acuse({
        incidencias: [{ codigoError: 'CFDI40101', mensajeIncidencia: 'Fecha' }],
      }),
    );
    const { service } = armar({ timbrar });

    const r = await service.timbrarPrueba();

    expect(r.exitoso).toBe(false);
    expect(r.incidencias).toHaveLength(1);
    expect(existsSync(join(r.evidencia, 'timbrado.xml'))).toBe(false);
  });
});

describe('nota de credito de prueba', () => {
  const FACTURA = '6B89107A-B0D4-5857-8B29-AF3BCC4EDD29';

  it('es un egreso relacionado a la factura con TipoRelacion 01', () => {
    const { service } = armar();
    const r = service.sellarComprobante(service.notaCreditoDePrueba(FACTURA));

    expect(r.xml).toContain('TipoDeComprobante="E"');
    expect(r.xml).toContain('<cfdi:CfdiRelacionados TipoRelacion="01">');
    expect(r.xml).toContain(`<cfdi:CfdiRelacionado UUID="${FACTURA}"/>`);
    // InformacionGlobal solo existe en ingresos: en un egreso Quadrum rechaza
    // con CFDI40130. CfdiRelacionados va antes del Emisor.
    expect(r.xml).not.toContain('InformacionGlobal');
    expect(r.xml.indexOf('CfdiRelacionados')).toBeLessThan(
      r.xml.indexOf('cfdi:Emisor'),
    );
    expect(r.cadena).toContain(`|01|${FACTURA}|XIQB891116QE4|`);
  });

  it('por omision devuelve 2 piezas: 1724.14 + IVA 275.86 = 2000.00', () => {
    const { service } = armar();
    const { xml } = service.sellarComprobante(
      service.notaCreditoDePrueba(FACTURA),
    );

    expect(xml).toContain('Cantidad="2"');
    expect(xml).toContain('SubTotal="1724.14"');
    expect(xml).toContain('TotalImpuestosTrasladados="275.86"');
    expect(xml).toContain('Total="2000.00"');
    expect(xml).toContain(
      'Descripcion="DEVOLUCION ARTICULO DE PRUEBA GRUPO A &amp; B"',
    );
  });

  it('no deja devolver mas piezas de las facturadas', () => {
    const { service } = armar();
    expect(() => service.notaCreditoDePrueba(FACTURA, 8)).toThrow(
      /entre 1 y 7/,
    );
    expect(() => service.notaCreditoDePrueba(FACTURA, 0)).toThrow(
      /entre 1 y 7/,
    );
  });

  it('se timbra por el mismo camino que la factura', async () => {
    const timbrar = jest
      .fn()
      .mockResolvedValue(
        acuse({ uuid: 'C3D4E5F6-3333-4444-5555-666677778888', exitoso: true }),
      );
    const { service } = armar({ timbrar });

    const r = await service.timbrarNotaCreditoPrueba(FACTURA);

    expect(r.exitoso).toBe(true);
    const [enviado] = timbrar.mock.calls[0] as [Buffer];
    expect(enviado.toString('utf8')).toContain('TipoDeComprobante="E"');
  });
});

describe('complemento de pagos (REP) de prueba', () => {
  const FACTURA = 'AAAAAAAA-1111-2222-3333-444455556666';
  const pago = {
    uuidFactura: FACTURA,
    serieFactura: 'PPD',
    folioFactura: '42',
  };

  it('la factura a credito es PPD, forma de pago 99 y va a un RFC propio', () => {
    const { service } = armar();
    const { xml } = service.sellarComprobante(service.facturaPpdDePrueba());

    expect(xml).toContain('MetodoPago="PPD"');
    expect(xml).toContain('FormaPago="99"');
    expect(xml).toContain('Rfc="EKU9003173C9"');
    expect(xml).toContain('UsoCFDI="G03"');
    // Una venta a credito no es factura global.
    expect(xml).not.toContain('InformacionGlobal');
  });

  it('el REP es tipo P, en ceros, sin forma ni metodo de pago', () => {
    const { service } = armar();
    const { xml } = service.sellarComprobante(service.reciboPagoDePrueba(pago));

    expect(xml).toContain('TipoDeComprobante="P"');
    expect(xml).toContain('SubTotal="0"');
    expect(xml).toContain('Total="0"');
    expect(xml).toContain('Moneda="XXX"');
    expect(xml).toContain('UsoCFDI="CP01"');
    expect(xml).toContain('ClaveProdServ="84111506"');
    expect(xml).not.toContain('MetodoPago=');
    expect(xml).not.toContain('FormaPago=');
  });

  it('declara el namespace y el XSD de pago20, y el complemento va al final', () => {
    const { service } = armar();
    const { xml } = service.sellarComprobante(service.reciboPagoDePrueba(pago));

    expect(xml).toContain('xmlns:pago20="http://www.sat.gob.mx/Pagos20"');
    expect(xml).toContain(
      'http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd',
    );
    expect(xml.indexOf('<cfdi:Complemento>')).toBeGreaterThan(
      xml.indexOf('</cfdi:Conceptos>'),
    );
  });

  it('una factura sin complemento NO declara pago20', () => {
    const { service } = armar();
    const { xml } = service.sellarComprobante(service.facturaPpdDePrueba());
    expect(xml).not.toContain('pago20');
  });

  it('reparte el IVA del abono: base + IVA = pagado, y calcula el saldo', () => {
    const { service } = armar();
    const { xml } = service.sellarComprobante(service.reciboPagoDePrueba(pago));

    expect(xml).toContain('NumParcialidad="1"');
    expect(xml).toContain('ImpSaldoAnt="7000.01"');
    expect(xml).toContain('ImpPagado="3000.00"');
    expect(xml).toContain('ImpSaldoInsoluto="4000.01"');
    expect(xml).toContain('BaseDR="2586.206897"');
    expect(xml).toContain('ImporteDR="413.793103"');
    expect(xml).toContain('TotalTrasladosBaseIVA16="2586.21"');
    expect(xml).toContain('TotalTrasladosImpuestoIVA16="413.79"');
    expect(xml).toContain('MontoTotalPagos="3000.00"');
  });

  it('la cadena incluye el complemento en el orden de Pagos20.xslt', () => {
    const { service } = armar();
    const r = service.sellarComprobante(service.reciboPagoDePrueba(pago));

    expect(r.cadena).toContain(
      '|84111506|1|ACT|Pago|0|0|01|2.0|2586.21|413.79|3000.00|',
    );
    expect(r.cadena).toContain(
      `|MXN|1|3000.00|${FACTURA}|PPD|42|MXN|1|1|7000.01|3000.00|4000.01|02` +
        '|2586.206897|002|Tasa|0.160000|413.793103' +
        '|2586.206897|002|Tasa|0.160000|413.793103||',
    );
  });

  it('liquidar la factura deja el saldo insoluto en cero', () => {
    const { service } = armar();
    const { xml } = service.sellarComprobante(
      service.reciboPagoDePrueba({ ...pago, monto: '7000.01' }),
    );
    expect(xml).toContain('ImpSaldoInsoluto="0.00"');
  });

  it('no deja pagar mas que el saldo, ni montos en cero', () => {
    const { service } = armar();
    expect(() =>
      service.reciboPagoDePrueba({ ...pago, monto: '7000.02' }),
    ).toThrow(/excede el saldo/);
    expect(() => service.reciboPagoDePrueba({ ...pago, monto: '0' })).toThrow(
      /mayor que cero/,
    );
  });
});

describe('venta real (toComprobante)', () => {
  const venta = {
    rfcEmisor: 'XIQB891116QE4',
    serie: 'XIQB',
    folio: '100',
    fecha: '2026-09-22T10:15:00',
    formaPago: '01',
    metodoPago: 'PUE' as const,
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
  };

  it('sella con el certificado de la razon social, no con el del .env', async () => {
    const timbrar = jest
      .fn()
      .mockResolvedValue(
        acuse({ uuid: 'F1F1F1F1-1111-2222-3333-444455556666', exitoso: true }),
      );
    const { service, obtenerPorRfc } = armar({ timbrar });

    const r = await service.timbrarVenta(venta);

    expect(r.exitoso).toBe(true);
    expect(obtenerPorRfc).toHaveBeenCalledWith('XIQB891116QE4');
    const [enviado] = timbrar.mock.calls[0] as [Buffer];
    expect(enviado.toString('utf8')).toContain(
      'NoCertificado="30001000000500009999"',
    );
  });

  it('el regimen y el lugar de expedicion salen de FACT_CSD, no de la venta', async () => {
    const { service } = armar();
    const { comprobante, credenciales } =
      await service.comprobanteDeVenta(venta);
    const { xml } = service.sellarComprobante(comprobante, credenciales);

    expect(xml).toContain('RegimenFiscal="612"');
    expect(xml).toContain('LugarExpedicion="39000"');
    expect(xml).toContain('Nombre="BERENICE XIMO QUEZADA"');
    expect(xml).toContain('SubTotal="200.00"');
    expect(xml).toContain('Total="232.00"');
  });

  it('rechaza la venta invalida antes de llamar al PAC', async () => {
    const { service, timbrar } = armar();

    await expect(
      service.timbrarVenta({ ...venta, formaPago: '99' }),
    ).rejects.toThrow(/99 es solo para PPD/);
    expect(timbrar).not.toHaveBeenCalled();
  });
});

describe('decodificarXmlEmbebido', () => {
  it('deja el XML tal cual si ya viene como texto', () => {
    expect(decodificarXmlEmbebido('<a/>')).toBe('<a/>');
  });

  it('decodifica el XML si viene en base64', () => {
    const b64 = Buffer.from('<cfdi:Comprobante/>', 'utf8').toString('base64');
    expect(decodificarXmlEmbebido(b64)).toBe('<cfdi:Comprobante/>');
  });
});
