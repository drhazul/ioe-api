import { CfdiNode, nodo } from './cfdi-node';

/**
 * Recibo electronico de pago (REP): CFDI tipo `P` con el complemento de
 * pagos 2.0.
 *
 * Es el comprobante mas distinto de todos, y conviene tenerlo claro:
 *  - `SubTotal="0"`, `Total="0"` y `Moneda="XXX"`. El dinero NO va en el
 *    comprobante, va en el complemento.
 *  - Sin `FormaPago` ni `MetodoPago` en el comprobante: la forma de pago real
 *    vive en `pago20:Pago`.
 *  - Un unico concepto fijo que el SAT define: clave 84111506, unidad ACT,
 *    valor 0, `ObjetoImp="01"` (no objeto de impuesto).
 *  - El `UsoCFDI` del receptor es siempre `CP01`.
 *
 * Los impuestos se desglosan dos veces: por documento relacionado (`...DR`) y
 * en total del pago (`...P`). Con un solo documento ambos coinciden.
 */

export interface EmisorPago {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
  lugarExpedicion: string;
}

export interface ReceptorPago {
  rfc: string;
  nombre: string;
  domicilioFiscal: string;
  regimenFiscal: string;
}

export interface DatosReciboPago {
  serie: string;
  folio: string;
  /** Fecha de emision del REP, en hora local del lugar de expedicion. */
  fecha: string;
  emisor: EmisorPago;
  receptor: ReceptorPago;

  /** La factura que se esta pagando. */
  factura: {
    uuid: string;
    serie: string;
    folio: string;
    moneda: string;
  };

  /** Fecha en que el cliente pago, `yyyy-MM-ddTHH:mm:ss`. */
  fechaPago: string;
  /** Clave del catalogo c_FormaPago: 01 efectivo, 03 transferencia... */
  formaDePago: string;
  /** Lo que abono, con dos decimales. */
  monto: number;
  /** Numero de abono: 1 el primero, 2 el segundo... */
  parcialidad: number;
  /** Lo que se debia ANTES de este pago. */
  saldoAnterior: number;
  /** Tasa de IVA de la factura, en decimal. Por omision 0.16. */
  tasaIva?: number;
}

export class ReciboPagoInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReciboPagoInvalidoError';
  }
}

const dec2 = (valor: number) => valor.toFixed(2);
const dec6 = (valor: number) => valor.toFixed(6);
/** Comparar centavos evita que 0.1 + 0.2 arruine una validacion. */
const centavos = (valor: number) => Math.round(valor * 100);

export function construirReciboPago(datos: DatosReciboPago): CfdiNode {
  const tasa = datos.tasaIva ?? 0.16;

  if (!Number.isFinite(datos.monto) || datos.monto <= 0) {
    throw new ReciboPagoInvalidoError(
      'El monto del pago debe ser mayor que cero.',
    );
  }
  if (!Number.isFinite(datos.saldoAnterior) || datos.saldoAnterior <= 0) {
    throw new ReciboPagoInvalidoError(
      'El saldo anterior debe ser mayor que cero: esa factura ya no debe nada.',
    );
  }
  if (centavos(datos.monto) > centavos(datos.saldoAnterior)) {
    throw new ReciboPagoInvalidoError(
      `El pago (${dec2(datos.monto)}) excede el saldo de la factura ` +
        `(${dec2(datos.saldoAnterior)}).`,
    );
  }
  if (!Number.isInteger(datos.parcialidad) || datos.parcialidad < 1) {
    throw new ReciboPagoInvalidoError(
      'La parcialidad debe ser un entero desde 1.',
    );
  }
  if (!/^[0-9]{2}$/.test(datos.formaDePago) || datos.formaDePago === '99') {
    throw new ReciboPagoInvalidoError(
      `Forma de pago '${datos.formaDePago}' invalida en un REP: ` +
        `el 99 ("por definir") solo vale en la factura a credito, no al cobrarla.`,
    );
  }
  if (!datos.factura.uuid?.trim()) {
    throw new ReciboPagoInvalidoError(
      'Falta el UUID de la factura que se paga.',
    );
  }

  // El monto llega CON IVA: hay que separarlo para el desglose.
  const base = datos.monto / (1 + tasa);
  const impuesto = datos.monto - base;
  const saldoInsoluto = datos.saldoAnterior - datos.monto;

  const pagos = nodo({
    name: 'pago20:Pagos',
    attrs: { Version: '2.0' },
    children: [
      nodo({
        name: 'pago20:Totales',
        attrs: {
          TotalTrasladosBaseIVA16: dec2(base),
          TotalTrasladosImpuestoIVA16: dec2(impuesto),
          MontoTotalPagos: dec2(datos.monto),
        },
      }),
      nodo({
        name: 'pago20:Pago',
        attrs: {
          FechaPago: datos.fechaPago,
          FormaDePagoP: datos.formaDePago,
          MonedaP: datos.factura.moneda || 'MXN',
          TipoCambioP: '1',
          Monto: dec2(datos.monto),
        },
        children: [
          nodo({
            name: 'pago20:DoctoRelacionado',
            attrs: {
              IdDocumento: datos.factura.uuid.trim().toUpperCase(),
              Serie: datos.factura.serie,
              Folio: datos.factura.folio,
              MonedaDR: datos.factura.moneda || 'MXN',
              EquivalenciaDR: '1',
              NumParcialidad: String(datos.parcialidad),
              ImpSaldoAnt: dec2(datos.saldoAnterior),
              ImpPagado: dec2(datos.monto),
              ImpSaldoInsoluto: dec2(saldoInsoluto),
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
                          BaseDR: dec6(base),
                          ImpuestoDR: '002',
                          TipoFactorDR: 'Tasa',
                          TasaOCuotaDR: dec6(tasa),
                          ImporteDR: dec6(impuesto),
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
                      BaseP: dec6(base),
                      ImpuestoP: '002',
                      TipoFactorP: 'Tasa',
                      TasaOCuotaP: dec6(tasa),
                      ImporteP: dec6(impuesto),
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
      Serie: datos.serie,
      Folio: datos.folio,
      Fecha: datos.fecha,
      SubTotal: '0',
      Moneda: 'XXX',
      Total: '0',
      TipoDeComprobante: 'P',
      Exportacion: '01',
      LugarExpedicion: datos.emisor.lugarExpedicion,
    },
    children: [
      nodo({
        name: 'cfdi:Emisor',
        attrs: {
          Rfc: datos.emisor.rfc,
          Nombre: datos.emisor.nombre,
          RegimenFiscal: datos.emisor.regimenFiscal,
        },
      }),
      nodo({
        name: 'cfdi:Receptor',
        attrs: {
          Rfc: datos.receptor.rfc,
          Nombre: datos.receptor.nombre,
          DomicilioFiscalReceptor: datos.receptor.domicilioFiscal,
          RegimenFiscalReceptor: datos.receptor.regimenFiscal,
          UsoCFDI: 'CP01',
        },
      }),
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
