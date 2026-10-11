/**
 * Cadena original de CFDI 4.0 — la entrada del sello.
 *
 * Equivale a aplicar `cadenaoriginal_4_0.xslt` del SAT al comprobante, pero
 * implementado en TypeScript. El XSLT declara `version="2.0"` y trae 32
 * `xsl:include` a `sat.gob.mx`, todos complementos que este negocio no usa;
 * el contenido real son 75 atributos emitidos en orden fijo, sin logica.
 *
 * La tabla `ORDEN` de abajo NO se transcribio a mano: se genera con
 * `scripts/extract-cadena-spec.mjs`, que la deriva del XSLT oficial. Si el SAT
 * publica una version nueva, se vuelve a correr y se compara.
 *
 *   node scripts/extract-cadena-spec.mjs <ruta>/cadenaoriginal_4_0.xslt
 *
 * Reglas del formato (las de `cadenaoriginal_4_0.xslt` + `utilerias.xslt`):
 *   - El template raiz emite `|`, luego el comprobante, luego `||`.
 *   - Cada atributo emitido aporta `|valor`: el separador va ANTES del valor.
 *     Por eso la cadena arranca con `||` y termina con `||`. Con un solo `|`
 *     inicial el PAC rechaza con CFDI40102 ("el resultado de la digestion debe
 *     ser igual al resultado de la desencripcion del sello") — verificado
 *     contra Quadrum devws el 2026-09-14.
 *   - `R` (Requerido) emite siempre; `o` (Opcional) solo si el atributo existe.
 *   - Unica transformacion de texto: `normalize-space`.
 *   - SIN escapado de entidades XML. El `<xsl:output method="text"/>` del SAT
 *     lo dice; el bug #1 del modulo C# fue justamente ignorarlo.
 */
import { CfdiNode, descendientes, hijo, porRuta } from './cfdi-node';

export type Paso =
  /** Emite un atributo del nodo actual. */
  | { readonly tipo: 'attr'; readonly modo: 'R' | 'o'; readonly attr: string }
  /** `apply-templates`: baja al nodo y aplica SU entrada de `ORDEN`. */
  | { readonly tipo: 'nodo'; readonly nombre: string }
  /**
   * `for-each`: recorre todos los nodos que cumplen la ruta. Si trae `pasos`
   * los aplica en linea; si no, usa la entrada de `ORDEN` del ultimo segmento.
   */
  | {
      readonly tipo: 'lista';
      readonly ruta: readonly string[];
      readonly descendiente?: boolean;
      readonly pasos?: readonly Paso[];
    };

const R = (attr: string): Paso => ({ tipo: 'attr', modo: 'R', attr });
const o = (attr: string): Paso => ({ tipo: 'attr', modo: 'o', attr });
const nodoPaso = (nombre: string): Paso => ({ tipo: 'nodo', nombre });

/**
 * Orden de emision por tipo de nodo. Derivado de `cadenaoriginal_4_0.xslt`.
 *
 * Detalles de orden que son faciles de equivocar a mano y por eso se derivan:
 *   - En `cfdi:Impuestos` global, las Retenciones van ANTES de
 *     `TotalImpuestosRetenidos`, y los Traslados antes de
 *     `TotalImpuestosTrasladados`.
 *   - `cfdi:Parte` se recorre por el eje descendiente y va DESPUES de
 *     `cfdi:ComplementoConcepto`.
 */
const ORDEN: Readonly<Record<string, readonly Paso[]>> = {
  'cfdi:Comprobante': [
    R('Version'),
    o('Serie'),
    o('Folio'),
    R('Fecha'),
    o('FormaPago'),
    R('NoCertificado'),
    o('CondicionesDePago'),
    R('SubTotal'),
    o('Descuento'),
    R('Moneda'),
    o('TipoCambio'),
    R('Total'),
    R('TipoDeComprobante'),
    R('Exportacion'),
    o('MetodoPago'),
    R('LugarExpedicion'),
    o('Confirmacion'),
    nodoPaso('cfdi:InformacionGlobal'),
    { tipo: 'lista', ruta: ['cfdi:CfdiRelacionados'] },
    nodoPaso('cfdi:Emisor'),
    nodoPaso('cfdi:Receptor'),
    nodoPaso('cfdi:Conceptos'),
    nodoPaso('cfdi:Impuestos'),
    nodoPaso('cfdi:Complemento'),
  ],

  'cfdi:InformacionGlobal': [R('Periodicidad'), R('Meses'), R('Año')],

  'cfdi:CfdiRelacionados': [
    R('TipoRelacion'),
    { tipo: 'lista', ruta: ['cfdi:CfdiRelacionado'], pasos: [R('UUID')] },
  ],

  'cfdi:Emisor': [
    R('Rfc'),
    R('Nombre'),
    R('RegimenFiscal'),
    o('FacAtrAdquirente'),
  ],

  'cfdi:Receptor': [
    R('Rfc'),
    R('Nombre'),
    R('DomicilioFiscalReceptor'),
    o('ResidenciaFiscal'),
    o('NumRegIdTrib'),
    R('RegimenFiscalReceptor'),
    R('UsoCFDI'),
  ],

  'cfdi:Conceptos': [{ tipo: 'lista', ruta: ['cfdi:Concepto'] }],

  'cfdi:Concepto': [
    R('ClaveProdServ'),
    o('NoIdentificacion'),
    R('Cantidad'),
    R('ClaveUnidad'),
    o('Unidad'),
    R('Descripcion'),
    R('ValorUnitario'),
    R('Importe'),
    o('Descuento'),
    R('ObjetoImp'),
    {
      tipo: 'lista',
      ruta: ['cfdi:Impuestos', 'cfdi:Traslados', 'cfdi:Traslado'],
      pasos: [
        R('Base'),
        R('Impuesto'),
        R('TipoFactor'),
        o('TasaOCuota'),
        o('Importe'),
      ],
    },
    {
      tipo: 'lista',
      ruta: ['cfdi:Impuestos', 'cfdi:Retenciones', 'cfdi:Retencion'],
      pasos: [
        R('Base'),
        R('Impuesto'),
        R('TipoFactor'),
        R('TasaOCuota'),
        R('Importe'),
      ],
    },
    { tipo: 'lista', ruta: ['cfdi:ACuentaTerceros'] },
    { tipo: 'lista', ruta: ['cfdi:InformacionAduanera'] },
    nodoPaso('cfdi:CuentaPredial'),
    nodoPaso('cfdi:ComplementoConcepto'),
    { tipo: 'lista', ruta: ['cfdi:Parte'], descendiente: true },
  ],

  'cfdi:ACuentaTerceros': [
    R('RfcACuentaTerceros'),
    R('NombreACuentaTerceros'),
    R('RegimenFiscalACuentaTerceros'),
    R('DomicilioFiscalACuentaTerceros'),
  ],

  'cfdi:InformacionAduanera': [R('NumeroPedimento')],

  'cfdi:CuentaPredial': [R('Numero')],

  'cfdi:ComplementoConcepto': [],

  'cfdi:Parte': [
    R('ClaveProdServ'),
    o('NoIdentificacion'),
    R('Cantidad'),
    o('Unidad'),
    R('Descripcion'),
    o('ValorUnitario'),
    o('Importe'),
  ],

  'cfdi:Impuestos': [
    {
      tipo: 'lista',
      ruta: ['cfdi:Retenciones', 'cfdi:Retencion'],
      pasos: [R('Impuesto'), R('Importe')],
    },
    o('TotalImpuestosRetenidos'),
    {
      tipo: 'lista',
      ruta: ['cfdi:Traslados', 'cfdi:Traslado'],
      pasos: [
        R('Base'),
        R('Impuesto'),
        R('TipoFactor'),
        o('TasaOCuota'),
        o('Importe'),
      ],
    },
    o('TotalImpuestosTrasladados'),
  ],

  // El SAT hace `apply-templates select="./*"`, que delega en el XSLT del
  // complemento correspondiente. Se maneja aparte en `emitirNodo`.
  'cfdi:Complemento': [],
};

/**
 * `normalize-space()` de XPath.
 *
 * Ojo con el conjunto de caracteres: XPath colapsa EXACTAMENTE cuatro
 * (#x20 espacio, #x9 tab, #xD retorno, #xA salto). El `\s` de JavaScript es mas
 * amplio —incluye el espacio duro U+00A0, los espacios tipograficos U+2000.. y
 * el BOM U+FEFF— asi que usarlo colapsaria caracteres que el SAT conserva y la
 * cadena saldria distinta a la suya. Se listan a mano a proposito.
 */
export function normalizarEspacios(valor: string): string {
  return valor.replace(/[ \t\r\n]+/g, ' ').trim();
}

/**
 * Complemento de pagos 2.0 (`pago20:Pagos`), derivado de `Pagos20.xslt` del SAT
 * (http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xslt).
 *
 * Va en una tabla aparte de `ORDEN` porque solo se usa dentro de
 * `cfdi:Complemento`, y asi el conteo de 75 atributos del CFDI base se queda
 * como el del XSLT principal. Ojo con dos ordenes faciles de equivocar:
 *   - En `pago20:Totales` las retenciones van antes que los traslados y
 *     `MontoTotalPagos` va al FINAL.
 *   - En `pago20:DoctoRelacionado` las RetencionesDR van antes que los
 *     TrasladosDR, igual que en el CFDI base.
 */
const ORDEN_PAGOS20: Readonly<Record<string, readonly Paso[]>> = {
  'pago20:Pagos': [
    R('Version'),
    { tipo: 'lista', ruta: ['pago20:Totales'] },
    { tipo: 'lista', ruta: ['pago20:Pago'] },
  ],

  'pago20:Totales': [
    o('TotalRetencionesIVA'),
    o('TotalRetencionesISR'),
    o('TotalRetencionesIEPS'),
    o('TotalTrasladosBaseIVA16'),
    o('TotalTrasladosImpuestoIVA16'),
    o('TotalTrasladosBaseIVA8'),
    o('TotalTrasladosImpuestoIVA8'),
    o('TotalTrasladosBaseIVA0'),
    o('TotalTrasladosImpuestoIVA0'),
    o('TotalTrasladosBaseIVAExento'),
    R('MontoTotalPagos'),
  ],

  'pago20:Pago': [
    R('FechaPago'),
    R('FormaDePagoP'),
    R('MonedaP'),
    o('TipoCambioP'),
    R('Monto'),
    o('NumOperacion'),
    o('RfcEmisorCtaOrd'),
    o('NomBancoOrdExt'),
    o('CtaOrdenante'),
    o('RfcEmisorCtaBen'),
    o('CtaBeneficiario'),
    o('TipoCadPago'),
    o('CertPago'),
    o('CadPago'),
    o('SelloPago'),
    { tipo: 'lista', ruta: ['pago20:DoctoRelacionado'] },
    { tipo: 'lista', ruta: ['pago20:ImpuestosP'] },
  ],

  'pago20:DoctoRelacionado': [
    R('IdDocumento'),
    o('Serie'),
    o('Folio'),
    R('MonedaDR'),
    o('EquivalenciaDR'),
    R('NumParcialidad'),
    R('ImpSaldoAnt'),
    R('ImpPagado'),
    R('ImpSaldoInsoluto'),
    R('ObjetoImpDR'),
    {
      tipo: 'lista',
      ruta: [
        'pago20:ImpuestosDR',
        'pago20:RetencionesDR',
        'pago20:RetencionDR',
      ],
      pasos: [
        R('BaseDR'),
        R('ImpuestoDR'),
        R('TipoFactorDR'),
        R('TasaOCuotaDR'),
        R('ImporteDR'),
      ],
    },
    {
      tipo: 'lista',
      ruta: ['pago20:ImpuestosDR', 'pago20:TrasladosDR', 'pago20:TrasladoDR'],
      pasos: [
        R('BaseDR'),
        R('ImpuestoDR'),
        R('TipoFactorDR'),
        o('TasaOCuotaDR'),
        o('ImporteDR'),
      ],
    },
  ],

  'pago20:ImpuestosP': [
    { tipo: 'lista', ruta: ['pago20:RetencionesP'] },
    { tipo: 'lista', ruta: ['pago20:TrasladosP'] },
  ],
  'pago20:RetencionesP': [{ tipo: 'lista', ruta: ['pago20:RetencionP'] }],
  'pago20:TrasladosP': [{ tipo: 'lista', ruta: ['pago20:TrasladoP'] }],
  'pago20:RetencionP': [R('ImpuestoP'), R('ImporteP')],
  'pago20:TrasladoP': [
    R('BaseP'),
    R('ImpuestoP'),
    R('TipoFactorP'),
    o('TasaOCuotaP'),
    o('ImporteP'),
  ],
};

/**
 * Complementos con soporte de cadena original: nodo raiz del complemento ->
 * su tabla de orden. Cualquier otro complemento truena a proposito, porque
 * omitirlo en la cadena da un sello que el PAC rechaza sin decir por que.
 */
const COMPLEMENTOS: Readonly<
  Record<string, Readonly<Record<string, readonly Paso[]>>>
> = {
  'pago20:Pagos': ORDEN_PAGOS20,
};

export class ComplementoNoSoportadoError extends Error {
  constructor(readonly nombreNodo: string) {
    super(
      `El comprobante trae el complemento '${nombreNodo}', para el que no hay ` +
        `tabla de cadena original. Emitirlo produciria un sello invalido. ` +
        `Registra su tabla de orden en COMPLEMENTOS antes de timbrar.`,
    );
    this.name = 'ComplementoNoSoportadoError';
  }
}

/**
 * Genera la cadena original de un comprobante.
 *
 * @param comprobante Nodo raiz `cfdi:Comprobante`, con `NoCertificado` y
 *   `Certificado` YA puestos y `Sello` AUSENTE. Ese orden no es negociable:
 *   el certificado forma parte de la cadena, el sello nunca.
 */
export function cadenaOriginal(comprobante: CfdiNode): string {
  if (comprobante.name !== 'cfdi:Comprobante') {
    throw new Error(
      `Se esperaba cfdi:Comprobante como raiz, llego '${comprobante.name}'`,
    );
  }
  if (comprobante.attrs.has('Sello')) {
    throw new Error(
      'El comprobante ya trae Sello. El sello NUNCA forma parte de la cadena ' +
        'original: generala antes de sellar.',
    );
  }
  if (!comprobante.attrs.has('NoCertificado')) {
    throw new Error(
      'Falta NoCertificado. Debe estar puesto ANTES de generar la cadena original.',
    );
  }

  const partes: string[] = [];
  emitirNodo(comprobante, partes);
  // Template raiz del SAT: `|<xsl:apply-templates .../>||`.
  return '|' + partes.join('') + '||';
}

function emitirNodo(
  n: CfdiNode,
  salida: string[],
  tabla: Readonly<Record<string, readonly Paso[]>> = ORDEN,
): void {
  if (n.name === 'cfdi:Complemento') {
    // El SAT hace `for-each select="./*"` + `apply-templates`: cada complemento
    // se emite con la tabla de su propio XSLT, en el orden en que aparece.
    for (const c of n.children) {
      const tablaComplemento = COMPLEMENTOS[c.name];
      if (!tablaComplemento) throw new ComplementoNoSoportadoError(c.name);
      emitirNodo(c, salida, tablaComplemento);
    }
    return;
  }

  const pasos = tabla[n.name];
  if (!pasos) {
    throw new Error(`No hay tabla de cadena original para el nodo '${n.name}'`);
  }
  for (const paso of pasos) emitirPaso(n, paso, salida, tabla);
}

function emitirPaso(
  n: CfdiNode,
  paso: Paso,
  salida: string[],
  tabla: Readonly<Record<string, readonly Paso[]>>,
): void {
  switch (paso.tipo) {
    case 'attr': {
      const valor = n.attrs.get(paso.attr);
      if (valor === undefined) {
        if (paso.modo === 'R') {
          throw new Error(
            `Falta el atributo requerido '${paso.attr}' en '${n.name}'`,
          );
        }
        return; // Opcional ausente: no emite nada, ni siquiera el separador.
      }
      // `Requerido`/`Opcional` de utilerias.xslt: separador ANTES del valor.
      salida.push('|' + normalizarEspacios(valor));
      return;
    }

    case 'nodo': {
      const objetivo = hijo(n, paso.nombre);
      if (objetivo) emitirNodo(objetivo, salida, tabla);
      return;
    }

    case 'lista': {
      const objetivos = paso.descendiente
        ? descendientes(n, paso.ruta[paso.ruta.length - 1])
        : porRuta(n, paso.ruta);
      for (const objetivo of objetivos) {
        if (paso.pasos) {
          for (const sub of paso.pasos)
            emitirPaso(objetivo, sub, salida, tabla);
        } else {
          emitirNodo(objetivo, salida, tabla);
        }
      }
      return;
    }
  }
}

/** Expuesto para pruebas y para diffear contra una version nueva del XSLT. */
export const ORDEN_CADENA_ORIGINAL = ORDEN;

/** Tabla del complemento de pagos 2.0, expuesta para pruebas. */
export const ORDEN_CADENA_PAGOS20 = ORDEN_PAGOS20;
