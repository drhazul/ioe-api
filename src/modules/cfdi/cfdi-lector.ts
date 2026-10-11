import { decodificarEntidades } from './soap-xml';

/**
 * Lee un CFDI 4.0 ya timbrado para poder imprimirlo.
 *
 * No es un parser de XML de proposito general: entiende solo la estructura
 * que el SAT fija para el comprobante, y por eso puede trabajar a punta de
 * expresiones regulares sin cargar una libreria. Se usa unicamente sobre XML
 * que nosotros mismos generamos y que el PAC devolvio timbrado.
 */

export interface ConceptoImpreso {
  claveProdServ: string;
  noIdentificacion: string;
  cantidad: string;
  claveUnidad: string;
  descripcion: string;
  valorUnitario: string;
  importe: string;
  descuento: string;
}

export interface CfdiImpreso {
  version: string;
  serie: string;
  folio: string;
  fecha: string;
  formaPago: string;
  metodoPago: string;
  tipoDeComprobante: string;
  moneda: string;
  lugarExpedicion: string;
  noCertificado: string;
  sello: string;
  subTotal: string;
  descuento: string;
  total: string;
  totalImpuestosTrasladados: string;
  totalImpuestosRetenidos: string;

  emisor: { rfc: string; nombre: string; regimenFiscal: string };
  receptor: {
    rfc: string;
    nombre: string;
    domicilioFiscal: string;
    regimenFiscal: string;
    usoCfdi: string;
  };

  conceptos: ConceptoImpreso[];

  /** Solo en los CFDI tipo P: el abono que ampara el complemento. */
  pago?: {
    parcialidad: number;
    monto: string;
    fechaPago: string;
    formaDePago: string;
    saldoAnterior: string;
    saldoInsoluto: string;
    uuidFactura: string;
    serieFactura: string;
    folioFactura: string;
    moneda: string;
  };

  /** El timbre. Sin el, el XML no esta timbrado y no hay nada que imprimir. */
  timbre: {
    uuid: string;
    fechaTimbrado: string;
    rfcProvCertif: string;
    noCertificadoSat: string;
    selloCfd: string;
    selloSat: string;
    version: string;
  };
}

export class CfdiIlegibleError extends Error {}

export function leerCfdiTimbrado(xml: string): CfdiImpreso {
  const comprobante = atributosDe(xml, 'Comprobante');
  if (!comprobante) {
    throw new CfdiIlegibleError('El archivo no trae un nodo Comprobante.');
  }

  const tfd = atributosDe(xml, 'TimbreFiscalDigital');
  if (!tfd?.UUID) {
    throw new CfdiIlegibleError(
      'El XML no trae TimbreFiscalDigital: no esta timbrado.',
    );
  }

  const emisor = atributosDe(xml, 'Emisor') ?? {};
  const receptor = atributosDe(xml, 'Receptor') ?? {};
  const impuestos = atributosDeTotales(xml);

  return {
    version: comprobante.Version ?? '',
    serie: comprobante.Serie ?? '',
    folio: comprobante.Folio ?? '',
    fecha: comprobante.Fecha ?? '',
    formaPago: comprobante.FormaPago ?? '',
    metodoPago: comprobante.MetodoPago ?? '',
    tipoDeComprobante: comprobante.TipoDeComprobante ?? '',
    moneda: comprobante.Moneda ?? 'MXN',
    lugarExpedicion: comprobante.LugarExpedicion ?? '',
    noCertificado: comprobante.NoCertificado ?? '',
    sello: comprobante.Sello ?? '',
    subTotal: comprobante.SubTotal ?? '0.00',
    descuento: comprobante.Descuento ?? '',
    total: comprobante.Total ?? '0.00',
    totalImpuestosTrasladados: impuestos.trasladados,
    totalImpuestosRetenidos: impuestos.retenidos,

    emisor: {
      rfc: emisor.Rfc ?? '',
      nombre: emisor.Nombre ?? '',
      regimenFiscal: emisor.RegimenFiscal ?? '',
    },
    receptor: {
      rfc: receptor.Rfc ?? '',
      nombre: receptor.Nombre ?? '',
      domicilioFiscal: receptor.DomicilioFiscalReceptor ?? '',
      regimenFiscal: receptor.RegimenFiscalReceptor ?? '',
      usoCfdi: receptor.UsoCFDI ?? '',
    },

    conceptos: leerConceptos(xml),

    pago: leerPago(xml),

    timbre: {
      uuid: tfd.UUID,
      fechaTimbrado: tfd.FechaTimbrado ?? '',
      rfcProvCertif: tfd.RfcProvCertif ?? '',
      noCertificadoSat: tfd.NoCertificadoSAT ?? '',
      selloCfd: tfd.SelloCFD ?? '',
      selloSat: tfd.SelloSAT ?? '',
      version: tfd.Version ?? '1.1',
    },
  };
}

/**
 * Cadena original del complemento de certificacion.
 *
 * Es la que el SAT exige imprimir, y se arma solo con los seis campos del
 * timbre. Formato: `||v1|v2|...|vn||`, igual que la del comprobante.
 */
export function cadenaOriginalTimbre(cfdi: CfdiImpreso): string {
  const t = cfdi.timbre;
  const partes = [
    t.version,
    t.uuid,
    t.fechaTimbrado,
    t.rfcProvCertif,
    t.selloCfd,
    t.noCertificadoSat,
  ];
  return `||${partes.join('|')}||`;
}

/**
 * URL que va dentro del codigo QR, tal como la define el SAT.
 *
 * `fe` son los ultimos 8 caracteres del sello del emisor, no del SAT.
 */
export function urlVerificacionSat(cfdi: CfdiImpreso): string {
  const fe = cfdi.sello.slice(-8);
  const params = new URLSearchParams({
    id: cfdi.timbre.uuid,
    re: cfdi.emisor.rfc,
    rr: cfdi.receptor.rfc,
    tt: cfdi.total,
    fe,
  });
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?${params.toString()}`;
}

/**
 * El abono de un REP.
 *
 * Se toman los datos del documento relacionado, que es donde viven el
 * saldo y la parcialidad; `pago20:Pago` solo trae la fecha y la forma.
 */
function leerPago(xml: string): CfdiImpreso['pago'] {
  const dr = atributosDe(xml, 'DoctoRelacionado');
  const pago = atributosDe(xml, 'Pago');
  if (!dr || !pago) return undefined;

  return {
    parcialidad: Number(dr.NumParcialidad ?? '1') || 1,
    monto: dr.ImpPagado ?? pago.Monto ?? '0',
    fechaPago: pago.FechaPago ?? '',
    formaDePago: pago.FormaDePagoP ?? '',
    saldoAnterior: dr.ImpSaldoAnt ?? '0',
    saldoInsoluto: dr.ImpSaldoInsoluto ?? '0',
    uuidFactura: dr.IdDocumento ?? '',
    serieFactura: dr.Serie ?? '',
    folioFactura: dr.Folio ?? '',
    moneda: pago.MonedaP ?? dr.MonedaDR ?? 'MXN',
  };
}

// -----------------------------------------------------------------------

/** Atributos del primer elemento con ese nombre local, sea cual sea su prefijo. */
function atributosDe(
  xml: string,
  nombreLocal: string,
): Record<string, string> | null {
  const re = new RegExp(`<[A-Za-z0-9]+:${nombreLocal}\\s([^>]*?)/?>`, 's');
  const m = re.exec(xml);
  return m ? leerAtributos(m[1]) : null;
}

function leerAtributos(texto: string): Record<string, string> {
  const salida: Record<string, string> = {};
  const re = /([A-Za-zñÑáéíóúÁÉÍÓÚ_][\w.:-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    // El nombre puede venir con prefijo (xsi:schemaLocation); se queda el local.
    const nombre = m[1].includes(':') ? m[1].split(':').pop()! : m[1];
    salida[nombre] = decodificarEntidades(m[2]);
  }
  return salida;
}

function leerConceptos(xml: string): ConceptoImpreso[] {
  const salida: ConceptoImpreso[] = [];
  const re = /<[A-Za-z0-9]+:Concepto\s([^>]*?)\/?>/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const a = leerAtributos(m[1]);
    salida.push({
      claveProdServ: a.ClaveProdServ ?? '',
      noIdentificacion: a.NoIdentificacion ?? '',
      cantidad: a.Cantidad ?? '',
      claveUnidad: a.ClaveUnidad ?? '',
      descripcion: a.Descripcion ?? '',
      valorUnitario: a.ValorUnitario ?? '',
      importe: a.Importe ?? '',
      descuento: a.Descuento ?? '',
    });
  }
  return salida;
}

/**
 * Totales de impuestos del comprobante.
 *
 * Hay que tomarlos del nodo `Impuestos` que cuelga del Comprobante, no de los
 * que van dentro de cada concepto: los dos se llaman igual.
 */
function atributosDeTotales(xml: string): {
  trasladados: string;
  retenidos: string;
} {
  const re = /<[A-Za-z0-9]+:Impuestos\s([^>]*?)>/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const a = leerAtributos(m[1]);
    if (a.TotalImpuestosTrasladados || a.TotalImpuestosRetenidos) {
      return {
        trasladados: a.TotalImpuestosTrasladados ?? '',
        retenidos: a.TotalImpuestosRetenidos ?? '',
      };
    }
  }
  return { trasladados: '', retenidos: '' };
}
