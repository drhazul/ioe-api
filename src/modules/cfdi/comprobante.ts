import { CfdiNode, nodo } from './cfdi-node';

/**
 * Arma el CFDI 4.0 de una venta real.
 *
 * Recibe datos YA normalizados (no filas de la base) a proposito: asi el
 * modulo `cfdi` no sabe de SQL y se puede probar sin base de datos. Quien lee
 * `FAC_SVR_SHAP`, el cliente fiscal y la sucursal es el modulo de facturacion.
 *
 * Las dos reglas que mas rechazos provocan y que aqui se hacen cumplir:
 *
 *  - **Los importes cuadran con lo escrito** (bug #2 del modulo C#): el
 *    `Importe` se calcula con el `ValorUnitario` YA redondeado a 6 decimales,
 *    que es el que va en el XML. El PAC rehace esa multiplicacion; si se usa
 *    el unitario sin redondear, sale un centavo de diferencia y rechaza.
 *  - **PUE nunca lleva forma de pago 99** y **PPD siempre la lleva**. El 99
 *    ("por definir") solo tiene sentido cuando al emitir aun no se sabe como
 *    va a pagar el cliente, que es justo el caso del credito.
 */

export interface EmisorComprobante {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
  /** CP del lugar de expedicion. */
  lugarExpedicion: string;
}

export interface ReceptorComprobante {
  rfc: string;
  nombre: string;
  /** CP del domicilio fiscal del receptor. */
  domicilioFiscal: string;
  regimenFiscal: string;
  usoCfdi: string;
}

export interface ConceptoComprobante {
  claveProdServ: string;
  noIdentificacion?: string;
  cantidad: number;
  claveUnidad: string;
  unidad?: string;
  descripcion: string;
  /** Precio unitario SIN IVA. */
  valorUnitario: number;
  descuento?: number;
  /** 01 no objeto de impuesto, 02 si lo es (por omision 02). */
  objetoImp?: string;
  /** Tasa de IVA en decimal. Por omision 0.16. */
  tasaIva?: number;
}

export interface InformacionGlobalComprobante {
  periodicidad: string;
  meses: string;
  anio: string;
}

export interface DatosComprobante {
  serie: string;
  folio: string;
  /** Ya en hora local del CP de expedicion — ver `fecha-expedicion.ts`. */
  fecha: string;
  formaPago?: string;
  metodoPago?: 'PUE' | 'PPD';
  moneda?: string;
  emisor: EmisorComprobante;
  receptor: ReceptorComprobante;
  conceptos: ConceptoComprobante[];
  /** Obligatoria cuando el receptor es publico en general. */
  informacionGlobal?: InformacionGlobalComprobante;
  relacionados?: { tipoRelacion: string; uuids: string[] };
  /**
   * `I` ingreso (factura) o `E` egreso (nota de credito). Por omision `I`,
   * para no cambiar el comportamiento de lo que ya emitia facturas.
   */
  tipoDeComprobante?: 'I' | 'E';
}

export class ComprobanteInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComprobanteInvalidoError';
  }
}

export const RFC_PUBLICO_EN_GENERAL = 'XAXX010101000';
const USO_CFDI_RE = /^[A-Z][0-9]{2}$/;
/** Textos de pantalla que se han colado al campo fiscal en FAC_SVR_SHAP. */
const PLACEHOLDERS = new Set(['', '-', 'NULL', 'SELECCIONAR', 'COLOCAR']);

const redondear = (valor: number, decimales: number) => {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
};
const dec2 = (valor: number) => redondear(valor, 2).toFixed(2);
const dec6 = (valor: number) => redondear(valor, 6).toFixed(6);

/** Cantidad sin ceros de relleno: 7, 1.5, 0.333333. */
function cantidadTxt(cantidad: number): string {
  const texto = redondear(cantidad, 6).toFixed(6).replace(/0+$/, '');
  return texto.endsWith('.') ? texto.slice(0, -1) : texto;
}

function exigir(valor: string | undefined | null, campo: string): string {
  const texto = String(valor ?? '').trim();
  if (!texto || PLACEHOLDERS.has(texto.toUpperCase())) {
    throw new ComprobanteInvalidoError(
      `Falta ${campo}${texto ? ` (llego '${texto}')` : ''}.`,
    );
  }
  return texto;
}

interface ConceptoCalculado {
  entrada: ConceptoComprobante;
  cantidad: string;
  valorUnitario: string;
  importe: string;
  descuento?: string;
  objetoImp: string;
  /** Base gravable: importe menos descuento. */
  base: number;
  tasa: number;
  iva: number;
}

function calcular(
  concepto: ConceptoComprobante,
  indice: number,
): ConceptoCalculado {
  const etiqueta = `el concepto ${indice + 1}`;
  const cantidad = Number(concepto.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new ComprobanteInvalidoError(
      `La cantidad de ${etiqueta} debe ser mayor que cero.`,
    );
  }
  const unitarioRaw = Number(concepto.valorUnitario);
  if (!Number.isFinite(unitarioRaw) || unitarioRaw < 0) {
    throw new ComprobanteInvalidoError(
      `El valor unitario de ${etiqueta} es invalido.`,
    );
  }

  // El unitario redondeado es el que va al XML, y con ESE se multiplica.
  const unitario = redondear(unitarioRaw, 6);
  const importe = redondear(cantidad * unitario, 2);
  const descuento = redondear(Number(concepto.descuento ?? 0), 2);
  if (descuento < 0 || descuento > importe) {
    throw new ComprobanteInvalidoError(
      `El descuento de ${etiqueta} (${dec2(descuento)}) no puede ser mayor que su importe (${dec2(importe)}).`,
    );
  }

  const objetoImp = String(concepto.objetoImp ?? '02').padStart(2, '0');
  const base = redondear(importe - descuento, 2);
  const tasaRaw = Number(concepto.tasaIva ?? 0.16);
  const tasa = Number.isFinite(tasaRaw) && tasaRaw > 0 ? tasaRaw : 0;
  const gravado = objetoImp === '02' && tasa > 0;

  return {
    entrada: concepto,
    cantidad: cantidadTxt(cantidad),
    valorUnitario: dec6(unitario),
    importe: dec2(importe),
    descuento: descuento > 0 ? dec2(descuento) : undefined,
    objetoImp,
    base,
    tasa: gravado ? tasa : 0,
    iva: gravado ? redondear(base * tasa, 2) : 0,
  };
}

function validarPago(datos: DatosComprobante): {
  metodoPago: 'PUE' | 'PPD';
  formaPago: string;
} {
  const metodoPago = (datos.metodoPago ?? 'PUE').toUpperCase() as 'PUE' | 'PPD';
  if (metodoPago !== 'PUE' && metodoPago !== 'PPD') {
    throw new ComprobanteInvalidoError(
      `MetodoPago '${datos.metodoPago}' invalido: solo PUE o PPD.`,
    );
  }
  const formaPago = exigir(datos.formaPago, 'la forma de pago')
    .split('.')[0]
    .padStart(2, '0');

  if (metodoPago === 'PPD' && formaPago !== '99') {
    throw new ComprobanteInvalidoError(
      `Una factura PPD (credito) debe llevar forma de pago 99, no ${formaPago}.`,
    );
  }
  if (metodoPago === 'PUE' && formaPago === '99') {
    throw new ComprobanteInvalidoError(
      'PUE con forma de pago 99 es invalido ante el SAT: el 99 es solo para PPD.',
    );
  }
  return { metodoPago, formaPago };
}

function validarReceptor(datos: DatosComprobante): void {
  const { receptor, emisor } = datos;
  const usoCfdi = exigir(receptor.usoCfdi, 'el UsoCFDI del receptor');
  if (!USO_CFDI_RE.test(usoCfdi)) {
    throw new ComprobanteInvalidoError(
      `UsoCFDI '${usoCfdi}' invalido: se espera una letra y dos digitos (G03, S01...).`,
    );
  }

  if (receptor.rfc.toUpperCase() !== RFC_PUBLICO_EN_GENERAL) {
    if (!datos.informacionGlobal) return;
    throw new ComprobanteInvalidoError(
      'InformacionGlobal solo va en facturas a PUBLICO EN GENERAL.',
    );
  }

  // Publico en general en un EGRESO: el SAT pide S01 y regimen 616 igual
  // que en el ingreso, pero NO lleva InformacionGlobal. Mandarla es
  // CFDI40130.
  if ((datos.tipoDeComprobante ?? 'I') === 'E') {
    if (datos.informacionGlobal) {
      throw new ComprobanteInvalidoError(
        'Una nota de credito no lleva InformacionGlobal: solo los ingresos.',
      );
    }
    if (usoCfdi !== 'S01') {
      throw new ComprobanteInvalidoError(
        `Con RFC generico el UsoCFDI debe ser S01, no ${usoCfdi}.`,
      );
    }
    if (receptor.regimenFiscal !== '616') {
      throw new ComprobanteInvalidoError(
        `Con RFC generico el regimen del receptor debe ser 616, no ${receptor.regimenFiscal}.`,
      );
    }
    if (receptor.domicilioFiscal !== emisor.lugarExpedicion) {
      throw new ComprobanteInvalidoError(
        `Con RFC generico el CP del receptor (${receptor.domicilioFiscal}) debe ser el del lugar de expedicion (${emisor.lugarExpedicion}).`,
      );
    }
    return;
  }

  // Publico en general: el SAT fija estos tres valores.
  if (usoCfdi !== 'S01') {
    throw new ComprobanteInvalidoError(
      `Con RFC generico el UsoCFDI debe ser S01, no ${usoCfdi}.`,
    );
  }
  if (receptor.regimenFiscal !== '616') {
    throw new ComprobanteInvalidoError(
      `Con RFC generico el regimen del receptor debe ser 616, no ${receptor.regimenFiscal}.`,
    );
  }
  if (receptor.domicilioFiscal !== emisor.lugarExpedicion) {
    throw new ComprobanteInvalidoError(
      `Con RFC generico el CP del receptor (${receptor.domicilioFiscal}) debe ser el del lugar de expedicion (${emisor.lugarExpedicion}).`,
    );
  }
  if (!datos.informacionGlobal) {
    throw new ComprobanteInvalidoError(
      'Una factura a PUBLICO EN GENERAL exige el nodo InformacionGlobal.',
    );
  }
}

export function construirComprobante(datos: DatosComprobante): CfdiNode {
  if (!datos.conceptos?.length) {
    throw new ComprobanteInvalidoError('El comprobante no trae conceptos.');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(datos.fecha ?? '')) {
    throw new ComprobanteInvalidoError(
      `Fecha '${datos.fecha}' invalida: se espera yyyy-MM-ddTHH:mm:ss en hora del lugar de expedicion.`,
    );
  }

  const { metodoPago, formaPago } = validarPago(datos);
  validarReceptor(datos);

  const calculados = datos.conceptos.map(calcular);

  const subTotal = redondear(
    calculados.reduce((acc, c) => acc + Number(c.importe), 0),
    2,
  );
  const descuentoTotal = redondear(
    calculados.reduce((acc, c) => acc + Number(c.descuento ?? 0), 0),
    2,
  );
  const impuestosTrasladados = redondear(
    calculados.reduce((acc, c) => acc + c.iva, 0),
    2,
  );
  const total = redondear(subTotal - descuentoTotal + impuestosTrasladados, 2);

  // Los traslados globales se agrupan por tasa, como pide el SAT.
  const porTasa = new Map<number, { base: number; importe: number }>();
  for (const c of calculados) {
    if (!c.tasa) continue;
    const acum = porTasa.get(c.tasa) ?? { base: 0, importe: 0 };
    acum.base += c.base;
    acum.importe += c.iva;
    porTasa.set(c.tasa, acum);
  }

  const conceptos = calculados.map((c) =>
    nodo({
      name: 'cfdi:Concepto',
      attrs: {
        ClaveProdServ: exigir(c.entrada.claveProdServ, 'la clave del producto'),
        NoIdentificacion: c.entrada.noIdentificacion?.trim() || undefined,
        Cantidad: c.cantidad,
        ClaveUnidad: exigir(c.entrada.claveUnidad, 'la clave de unidad'),
        Unidad: c.entrada.unidad?.trim() || undefined,
        Descripcion: exigir(c.entrada.descripcion, 'la descripcion'),
        ValorUnitario: c.valorUnitario,
        Importe: c.importe,
        Descuento: c.descuento,
        ObjetoImp: c.objetoImp,
      },
      children: c.tasa
        ? [
            nodo({
              name: 'cfdi:Impuestos',
              children: [
                nodo({
                  name: 'cfdi:Traslados',
                  children: [
                    nodo({
                      name: 'cfdi:Traslado',
                      attrs: {
                        Base: dec2(c.base),
                        Impuesto: '002',
                        TipoFactor: 'Tasa',
                        TasaOCuota: dec6(c.tasa),
                        Importe: dec2(c.iva),
                      },
                    }),
                  ],
                }),
              ],
            }),
          ]
        : [],
    }),
  );

  const impuestosGlobales = porTasa.size
    ? [
        nodo({
          name: 'cfdi:Impuestos',
          attrs: { TotalImpuestosTrasladados: dec2(impuestosTrasladados) },
          children: [
            nodo({
              name: 'cfdi:Traslados',
              children: [...porTasa.entries()].map(([tasa, acum]) =>
                nodo({
                  name: 'cfdi:Traslado',
                  attrs: {
                    Base: dec2(acum.base),
                    Impuesto: '002',
                    TipoFactor: 'Tasa',
                    TasaOCuota: dec6(tasa),
                    Importe: dec2(acum.importe),
                  },
                }),
              ),
            }),
          ],
        }),
      ]
    : [];

  const informacionGlobal = datos.informacionGlobal
    ? [
        nodo({
          name: 'cfdi:InformacionGlobal',
          attrs: {
            Periodicidad: datos.informacionGlobal.periodicidad,
            Meses: datos.informacionGlobal.meses,
            Año: datos.informacionGlobal.anio,
          },
        }),
      ]
    : [];

  const relacionados = datos.relacionados
    ? [
        nodo({
          name: 'cfdi:CfdiRelacionados',
          attrs: { TipoRelacion: datos.relacionados.tipoRelacion },
          children: datos.relacionados.uuids.map((uuid) =>
            nodo({
              name: 'cfdi:CfdiRelacionado',
              attrs: { UUID: uuid.trim().toUpperCase() },
            }),
          ),
        }),
      ]
    : [];

  return nodo({
    name: 'cfdi:Comprobante',
    attrs: {
      Version: '4.0',
      Serie: exigir(datos.serie, 'la serie'),
      Folio: exigir(datos.folio, 'el folio'),
      Fecha: datos.fecha,
      FormaPago: formaPago,
      SubTotal: dec2(subTotal),
      Descuento: descuentoTotal > 0 ? dec2(descuentoTotal) : undefined,
      Moneda: datos.moneda ?? 'MXN',
      Total: dec2(total),
      TipoDeComprobante: datos.tipoDeComprobante ?? 'I',
      Exportacion: '01',
      MetodoPago: metodoPago,
      LugarExpedicion: exigir(
        datos.emisor.lugarExpedicion,
        'el lugar de expedicion',
      ),
    },
    children: [
      ...informacionGlobal,
      ...relacionados,
      nodo({
        name: 'cfdi:Emisor',
        attrs: {
          Rfc: exigir(datos.emisor.rfc, 'el RFC del emisor').toUpperCase(),
          Nombre: exigir(datos.emisor.nombre, 'el nombre del emisor'),
          RegimenFiscal: exigir(
            datos.emisor.regimenFiscal,
            'el regimen fiscal del emisor',
          ),
        },
      }),
      nodo({
        name: 'cfdi:Receptor',
        attrs: {
          Rfc: exigir(datos.receptor.rfc, 'el RFC del receptor').toUpperCase(),
          Nombre: exigir(datos.receptor.nombre, 'el nombre del receptor'),
          DomicilioFiscalReceptor: exigir(
            datos.receptor.domicilioFiscal,
            'el CP del receptor',
          ),
          RegimenFiscalReceptor: exigir(
            datos.receptor.regimenFiscal,
            'el regimen fiscal del receptor',
          ),
          UsoCFDI: datos.receptor.usoCfdi.trim().toUpperCase(),
        },
      }),
      nodo({ name: 'cfdi:Conceptos', children: conceptos }),
      ...impuestosGlobales,
    ],
  });
}
