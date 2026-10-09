import { CfdiNode, nodo } from './cfdi-node';

export interface ComprobantePruebaInput {
  rfcEmisor: string;
  nombreEmisor: string;
  /** Si se omite: 601 (persona moral, RFC de 12) o 612 (fisica, RFC de 13). */
  regimenFiscalEmisor?: string;
  lugarExpedicion: string;
  /** Ya en hora local del CP de expedicion — ver `fecha-expedicion.ts`. */
  fecha: string;
  serie?: string;
  folio?: string;
}

/** Receptor con RFC propio: el que reciben las ventas a credito. */
export interface ReceptorPrueba {
  rfc: string;
  nombre: string;
  /** Codigo postal del domicilio fiscal. */
  domicilioFiscal: string;
  regimenFiscal: string;
}

/**
 * Contribuyente de pruebas del SAT (persona moral). En el ambiente de pruebas
 * el PAC valida RFC, nombre, CP y regimen contra la lista de contribuyentes
 * del SAT: con el CP equivocado rechaza con CFDI40147.
 *
 * Datos tomados de la lista de contribuyentes de prueba publicada en
 * https://docs.fiscalapi.com/testing-data (verificado 2026-09-21). El nombre
 * va SIN "SA DE CV": en CFDI 4.0 no se escribe el regimen societario.
 * Si Quadrum los rechaza, se sobreescriben con `CFDI_PRUEBA_RECEPTOR_*` en el .env.
 */
export const RECEPTOR_PRUEBA_SAT: ReceptorPrueba = {
  rfc: 'EKU9003173C9',
  nombre: 'ESCUELA KEMPER URGATE',
  domicilioFiscal: '42501',
  regimenFiscal: '601',
};

export interface NotaCreditoPruebaInput extends ComprobantePruebaInput {
  /** UUID de la factura que se acredita. */
  uuidRelacionado: string;
  /** Piezas devueltas, de las 7 que ampara la factura de prueba. */
  cantidadDevuelta?: number;
}

export interface FacturaPpdPruebaInput extends ComprobantePruebaInput {
  receptor: ReceptorPrueba;
}

export interface ReciboPagoPruebaInput extends ComprobantePruebaInput {
  /** El mismo receptor de la factura PPD que se paga. */
  receptor: ReceptorPrueba;
  uuidFactura: string;
  serieFactura?: string;
  folioFactura?: string;
  /** Lo que abona el cliente, IVA incluido. Por omision 3000.00. */
  monto?: string;
  /** Numero de pago sobre esa factura: 1, 2, 3... Por omision 1. */
  parcialidad?: number;
  /** Saldo de la factura antes de este pago. Por omision, el total de la factura de prueba. */
  saldoAnterior?: string;
  /** c_FormaPago del abono. Por omision 03 (transferencia). */
  formaDePagoP?: string;
}

/** Piezas que ampara la factura de prueba. */
export const CANTIDAD_FACTURA_PRUEBA = 7;
const VALOR_UNITARIO = '862.07';
const DESCRIPCION = 'ARTICULO DE PRUEBA GRUPO A & B';

function totales(cantidad: string) {
  const importe = (Number(cantidad) * Number(VALOR_UNITARIO)).toFixed(2);
  const iva = (Number(importe) * 0.16).toFixed(2);
  const total = (Number(importe) + Number(iva)).toFixed(2);
  return { importe, iva, total };
}

/** Total de la factura de prueba: 7 x 862.07 + IVA = 7000.01. */
export const TOTAL_FACTURA_PRUEBA = totales(
  String(CANTIDAD_FACTURA_PRUEBA),
).total;

/**
 * Factura de prueba con los casos de borde que rompieron al modulo C#:
 *
 *  - Bug #1: descripcion con `&`. El XML lleva `&amp;`, la cadena lleva `&`.
 *  - Bug #2: `Cantidad = 7` con unitario de dos decimales; el `Importe` se
 *    calcula con los valores EXACTOS que se escriben en el XML (6034.49).
 *
 * Va a PUBLICO EN GENERAL para no depender del nombre y CP de un receptor en
 * la LCO del SAT. Con RFC generico y ese nombre el SAT exige
 * `InformacionGlobal`, y que `DomicilioFiscalReceptor` sea el mismo
 * `LugarExpedicion`.
 */
export function comprobantePrueba(input: ComprobantePruebaInput): CfdiNode {
  return armar(input, {
    tipo: 'I',
    serie: input.serie ?? 'PRUEBA',
    cantidad: String(CANTIDAD_FACTURA_PRUEBA),
    descripcion: DESCRIPCION,
  });
}

/**
 * Factura de prueba a CREDITO: la unica a la que despues se le puede emitir
 * un complemento de pago.
 *
 *  - `MetodoPago="PPD"` (pago en parcialidades o diferido) y `FormaPago="99"`
 *    (por definir): al emitirse aun no se sabe como va a pagar el cliente.
 *    PUE con 99 es invalido; PPD con cualquier forma distinta de 99 tambien.
 *  - Receptor con RFC propio: una venta a credito no va a publico en general,
 *    y por lo mismo no lleva `InformacionGlobal`.
 */
export function facturaPpdPrueba(input: FacturaPpdPruebaInput): CfdiNode {
  return armar(input, {
    tipo: 'I',
    serie: input.serie ?? 'PPD',
    cantidad: String(CANTIDAD_FACTURA_PRUEBA),
    descripcion: DESCRIPCION,
    metodoPago: 'PPD',
    formaPago: '99',
    receptor: input.receptor,
    usoCfdi: 'G03',
  });
}

/**
 * Nota de credito de prueba: CFDI de EGRESO por la devolucion parcial de
 * piezas de la factura de prueba.
 *
 * Lo que la distingue de una factura:
 *  - `TipoDeComprobante="E"`.
 *  - `CfdiRelacionados` con `TipoRelacion="01"` (nota de credito de los
 *    documentos relacionados) y el UUID de la factura original.
 *
 * El receptor sigue siendo PUBLICO EN GENERAL porque asi fue la factura. Con
 * RFC generico el SAT obliga `UsoCFDI="S01"`; el `G02` (devoluciones) solo
 * aplica cuando el receptor tiene RFC propio. `InformacionGlobal`, en cambio,
 * SOLO existe en ingresos: en un egreso Quadrum rechaza con CFDI40130
 * ("El valor TipoDeComprobante es distinto de I"), verificado 2026-09-18.
 */
export function notaCreditoPrueba(input: NotaCreditoPruebaInput): CfdiNode {
  const cantidad = input.cantidadDevuelta ?? 2;
  if (
    !Number.isInteger(cantidad) ||
    cantidad < 1 ||
    cantidad > CANTIDAD_FACTURA_PRUEBA
  ) {
    throw new Error(
      `cantidadDevuelta debe ser un entero entre 1 y ${CANTIDAD_FACTURA_PRUEBA}; ` +
        `no se puede devolver mas de lo facturado.`,
    );
  }
  return armar(input, {
    tipo: 'E',
    serie: input.serie ?? 'NC',
    cantidad: String(cantidad),
    descripcion: `DEVOLUCION ${DESCRIPCION}`,
    relacionados: {
      tipoRelacion: '01',
      uuids: [input.uuidRelacionado.trim().toUpperCase()],
    },
  });
}

/**
 * Recibo electronico de pago (REP) de prueba: CFDI tipo `P` con el
 * complemento de pagos 2.0, por un abono a la factura PPD de prueba.
 *
 * Reglas del tipo `P` que no se parecen a una factura:
 *  - `SubTotal="0"`, `Total="0"`, `Moneda="XXX"`, sin `FormaPago` ni
 *    `MetodoPago`: el dinero va en el complemento, no en el comprobante.
 *  - Un solo concepto fijo: `84111506` / `ACT` / "Pago", importe 0, ObjetoImp 01.
 *  - `UsoCFDI="CP01"` (pagos).
 *
 * El IVA del pago se reparte en la misma proporcion que el de la factura. Como
 * la factura de prueba solo lleva IVA 16%: BaseDR = pagado / 1.16 e
 * ImporteDR = pagado - BaseDR, a 6 decimales (los que admite el complemento),
 * para que base + IVA sumen exactamente lo pagado.
 */
export function reciboPagoPrueba(input: ReciboPagoPruebaInput): CfdiNode {
  const monto = Number(input.monto ?? '3000.00');
  const saldoAnterior = Number(input.saldoAnterior ?? TOTAL_FACTURA_PRUEBA);
  const parcialidad = input.parcialidad ?? 1;

  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error('El monto del pago debe ser mayor que cero.');
  }
  if (Math.round(monto * 100) > Math.round(saldoAnterior * 100)) {
    throw new Error(
      `El pago (${monto.toFixed(2)}) excede el saldo de la factura ` +
        `(${saldoAnterior.toFixed(2)}).`,
    );
  }
  if (!Number.isInteger(parcialidad) || parcialidad < 1) {
    throw new Error('La parcialidad debe ser un entero desde 1.');
  }

  const montoTxt = monto.toFixed(2);
  const baseDR = (monto / 1.16).toFixed(6);
  const importeDR = (monto - Number(baseDR)).toFixed(6);
  const saldoInsoluto = (saldoAnterior - monto).toFixed(2);

  const pagos = nodo({
    name: 'pago20:Pagos',
    attrs: { Version: '2.0' },
    children: [
      nodo({
        name: 'pago20:Totales',
        attrs: {
          TotalTrasladosBaseIVA16: Number(baseDR).toFixed(2),
          TotalTrasladosImpuestoIVA16: Number(importeDR).toFixed(2),
          MontoTotalPagos: montoTxt,
        },
      }),
      nodo({
        name: 'pago20:Pago',
        attrs: {
          FechaPago: input.fecha,
          FormaDePagoP: input.formaDePagoP ?? '03',
          MonedaP: 'MXN',
          TipoCambioP: '1',
          Monto: montoTxt,
        },
        children: [
          nodo({
            name: 'pago20:DoctoRelacionado',
            attrs: {
              IdDocumento: input.uuidFactura.trim().toUpperCase(),
              Serie: input.serieFactura,
              Folio: input.folioFactura,
              MonedaDR: 'MXN',
              EquivalenciaDR: '1',
              NumParcialidad: String(parcialidad),
              ImpSaldoAnt: saldoAnterior.toFixed(2),
              ImpPagado: montoTxt,
              ImpSaldoInsoluto: saldoInsoluto,
              ObjetoImpDR: '02',
            },
            children: [
              nodo({
                name: 'pago20:ImpuestosDR',
                children: [
                  nodo({
                    name: 'pago20:TrasladosDR',
                    children: [
                      nodo({
                        name: 'pago20:TrasladoDR',
                        attrs: {
                          BaseDR: baseDR,
                          ImpuestoDR: '002',
                          TipoFactorDR: 'Tasa',
                          TasaOCuotaDR: '0.160000',
                          ImporteDR: importeDR,
                        },
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          nodo({
            name: 'pago20:ImpuestosP',
            children: [
              nodo({
                name: 'pago20:TrasladosP',
                children: [
                  nodo({
                    name: 'pago20:TrasladoP',
                    attrs: {
                      BaseP: baseDR,
                      ImpuestoP: '002',
                      TipoFactorP: 'Tasa',
                      TasaOCuotaP: '0.160000',
                      ImporteP: importeDR,
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return nodo({
    name: 'cfdi:Comprobante',
    attrs: {
      Version: '4.0',
      Serie: input.serie ?? 'REP',
      Folio: input.folio ?? '1',
      Fecha: input.fecha,
      SubTotal: '0',
      Moneda: 'XXX',
      Total: '0',
      TipoDeComprobante: 'P',
      Exportacion: '01',
      LugarExpedicion: input.lugarExpedicion,
    },
    children: [
      emisorNodo(input),
      receptorNodo(input.receptor, 'CP01', input.lugarExpedicion),
      nodo({
        name: 'cfdi:Conceptos',
        children: [
          nodo({
            name: 'cfdi:Concepto',
            attrs: {
              ClaveProdServ: '84111506',
              Cantidad: '1',
              ClaveUnidad: 'ACT',
              Descripcion: 'Pago',
              ValorUnitario: '0',
              Importe: '0',
              ObjetoImp: '01',
            },
          }),
        ],
      }),
      nodo({ name: 'cfdi:Complemento', children: [pagos] }),
    ],
  });
}

// ---------------------------------------------------------------------------

interface OpcionesComprobante {
  tipo: 'I' | 'E';
  serie: string;
  cantidad: string;
  descripcion: string;
  relacionados?: { tipoRelacion: string; uuids: string[] };
  metodoPago?: 'PUE' | 'PPD';
  formaPago?: string;
  /** Sin receptor: PUBLICO EN GENERAL. */
  receptor?: ReceptorPrueba;
  usoCfdi?: string;
}

function emisorNodo(input: ComprobantePruebaInput): CfdiNode {
  return nodo({
    name: 'cfdi:Emisor',
    attrs: {
      Rfc: input.rfcEmisor,
      Nombre: input.nombreEmisor,
      RegimenFiscal:
        input.regimenFiscalEmisor ??
        (input.rfcEmisor.length === 12 ? '601' : '612'),
    },
  });
}

/**
 * Receptor del comprobante. Sin receptor propio va a PUBLICO EN GENERAL, que
 * exige `UsoCFDI="S01"`, regimen 616 y el CP del lugar de expedicion.
 */
function receptorNodo(
  receptor: ReceptorPrueba | undefined,
  usoCfdi: string,
  lugarExpedicion: string,
): CfdiNode {
  return nodo({
    name: 'cfdi:Receptor',
    attrs: receptor
      ? {
          Rfc: receptor.rfc,
          Nombre: receptor.nombre,
          DomicilioFiscalReceptor: receptor.domicilioFiscal,
          RegimenFiscalReceptor: receptor.regimenFiscal,
          UsoCFDI: usoCfdi,
        }
      : {
          Rfc: 'XAXX010101000',
          Nombre: 'PUBLICO EN GENERAL',
          DomicilioFiscalReceptor: lugarExpedicion,
          RegimenFiscalReceptor: '616',
          UsoCFDI: 'S01',
        },
  });
}

function armar(
  input: ComprobantePruebaInput,
  opciones: OpcionesComprobante,
): CfdiNode {
  const { importe, iva, total } = totales(opciones.cantidad);

  const traslado = nodo({
    name: 'cfdi:Traslado',
    attrs: {
      Base: importe,
      Impuesto: '002',
      TipoFactor: 'Tasa',
      TasaOCuota: '0.160000',
      Importe: iva,
    },
  });

  // InformacionGlobal solo en ingresos a PUBLICO EN GENERAL (factura global).
  // En un egreso Quadrum rechaza con CFDI40130.
  const informacionGlobal =
    opciones.tipo === 'I' && !opciones.receptor
      ? [
          nodo({
            name: 'cfdi:InformacionGlobal',
            attrs: {
              Periodicidad: '01',
              Meses: input.fecha.slice(5, 7),
              Año: input.fecha.slice(0, 4),
            },
          }),
        ]
      : [];

  // Orden de los hijos = orden del XSD: InformacionGlobal, CfdiRelacionados,
  // Emisor, Receptor, Conceptos, Impuestos.
  const relacionados = opciones.relacionados
    ? [
        nodo({
          name: 'cfdi:CfdiRelacionados',
          attrs: { TipoRelacion: opciones.relacionados.tipoRelacion },
          children: opciones.relacionados.uuids.map((uuid) =>
            nodo({ name: 'cfdi:CfdiRelacionado', attrs: { UUID: uuid } }),
          ),
        }),
      ]
    : [];

  return nodo({
    name: 'cfdi:Comprobante',
    attrs: {
      Version: '4.0',
      Serie: opciones.serie,
      Folio: input.folio ?? '1',
      Fecha: input.fecha,
      FormaPago: opciones.formaPago ?? '01',
      SubTotal: importe,
      Moneda: 'MXN',
      Total: total,
      TipoDeComprobante: opciones.tipo,
      Exportacion: '01',
      MetodoPago: opciones.metodoPago ?? 'PUE',
      LugarExpedicion: input.lugarExpedicion,
    },
    children: [
      ...informacionGlobal,
      ...relacionados,
      emisorNodo(input),
      receptorNodo(
        opciones.receptor,
        opciones.usoCfdi ?? 'S01',
        input.lugarExpedicion,
      ),
      nodo({
        name: 'cfdi:Conceptos',
        children: [
          nodo({
            name: 'cfdi:Concepto',
            attrs: {
              ClaveProdServ: '01010101',
              Cantidad: opciones.cantidad,
              ClaveUnidad: 'H87',
              Descripcion: opciones.descripcion,
              ValorUnitario: VALOR_UNITARIO,
              Importe: importe,
              ObjetoImp: '02',
            },
            children: [
              nodo({
                name: 'cfdi:Impuestos',
                children: [
                  nodo({ name: 'cfdi:Traslados', children: [traslado] }),
                ],
              }),
            ],
          }),
        ],
      }),
      nodo({
        name: 'cfdi:Impuestos',
        attrs: { TotalImpuestosTrasladados: iva },
        children: [nodo({ name: 'cfdi:Traslados', children: [traslado] })],
      }),
    ],
  });
}
