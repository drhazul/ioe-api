import { ConceptoComprobante } from './comprobante';
import { DatosVenta } from './timbrado.service';

/**
 * Traduce lo que hay en la base a los datos que necesita el CFDI.
 *
 * Es una funcion pura —recibe filas, devuelve datos— para poder probar contra
 * los casos feos que existen en FAC_SVR_SHAP sin tocar SQL Server: campos
 * fiscales con textos de pantalla ('SELECCIONAR'), razones sociales con
 * regimen de capital, `FormaPago` numerica y `FormaPagoSAT` vacia.
 *
 * Lo que NO decide aqui: el nombre, el regimen y el CP del EMISOR. Esos salen
 * del certificado y de FACT_CSD, que es la fuente confiable.
 */

export type Fila = Record<string, unknown>;

export interface FilasVenta {
  header: Fila;
  detalle: Fila[];
  cliente?: Fila | null;
  sucursal?: Fila | null;
}

export interface ContextoVenta {
  /** Serie y folio ya reservados por sp_fact_cfdi_serie_reserve. */
  serie: string;
  folio: string;
  /** Fecha en hora local del lugar de expedicion. */
  fecha: string;
}

export class VentaInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VentaInvalidaError';
  }
}

const PLACEHOLDERS = new Set([
  '',
  '-',
  'NULL',
  'SELECCIONAR',
  'COLOCAR',
  'NA',
  'N/A',
]);

/** Lee una columna por cualquiera de sus nombres, sin importar mayusculas. */
export function columna(fila: Fila | null | undefined, ...nombres: string[]) {
  if (!fila) return '';
  const claves = new Map(
    Object.keys(fila).map((k) => [k.toUpperCase(), k] as const),
  );
  for (const nombre of nombres) {
    const real = claves.get(nombre.toUpperCase());
    if (real === undefined) continue;
    const valor = fila[real];
    if (valor === null || valor === undefined) continue;
    const texto =
      typeof valor === 'string'
        ? valor.trim()
        : typeof valor === 'number' || typeof valor === 'boolean'
          ? String(valor)
          : valor instanceof Date
            ? valor.toISOString()
            : '';
    if (texto) return texto;
  }
  return '';
}

function exigir(valor: string, campo: string, idFol: string): string {
  if (!valor || PLACEHOLDERS.has(valor.toUpperCase())) {
    throw new VentaInvalidaError(
      `El folio ${idFol} no tiene ${campo}${valor ? ` (llego '${valor}')` : ''}.`,
    );
  }
  return valor;
}

const numero = (valor: string, porDefecto = 0) => {
  const n = Number(String(valor).replace(/,/g, ''));
  return Number.isFinite(n) ? n : porDefecto;
};

/** Deja el codigo del catalogo a dos digitos: '1' -> '01', '3.0' -> '03'. */
function clave2(valor: string): string {
  const limpio = valor.split('.')[0].trim();
  return limpio ? limpio.padStart(2, '0') : '';
}

/**
 * Nombre como lo quiere el CFDI 4.0: en mayusculas y SIN el regimen de
 * capital. "Grupo A & B, S.A. de C.V." va como "GRUPO A & B".
 */
export function normalizarNombreSat(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /[,.]?\s*(S\.?\s?A\.?\s?P\.?\s?I\.?|S\.?\s?A\.?|S\.?\s?DE\s?R\.?\s?L\.?|S\.?\s?C\.?|A\.?\s?C\.?)(\s?DE\s?C\.?\s?V\.?)?\s*$/,
      '',
    )
    .trim();
}

/** UsoCFDI limpio, o vacio si lo que hay es basura de pantalla. */
export function normalizarUsoCfdi(valor: string): string {
  const texto = valor.trim().toUpperCase();
  if (!texto || PLACEHOLDERS.has(texto)) return '';
  return texto.match(/\b([A-Z][0-9]{2})\b/)?.[1] ?? '';
}

function mapearConcepto(
  fila: Fila,
  indice: number,
  idFol: string,
): ConceptoComprobante {
  const etiqueta = `el concepto ${indice + 1} del folio ${idFol}`;
  const cantidad = numero(columna(fila, 'Cantidad'), 0);
  if (cantidad <= 0) {
    throw new VentaInvalidaError(`La cantidad de ${etiqueta} es ${cantidad}.`);
  }

  const descuento = numero(columna(fila, 'Descuento'), 0);
  const pvtat = numero(columna(fila, 'PVTAT'), NaN);
  const unitarioFila = numero(columna(fila, 'ValorUnitario'), NaN);

  // PVTAT es el importe del concepto YA con el descuento aplicado y sin IVA;
  // es la cifra con la que cuadra la venta. Para el CFDI hay que devolverle el
  // descuento, porque ahi el descuento va aparte del importe.
  const valorUnitario = Number.isFinite(pvtat)
    ? (pvtat + descuento) / cantidad
    : unitarioFila;
  if (!Number.isFinite(valorUnitario)) {
    throw new VentaInvalidaError(
      `No se pudo determinar el valor unitario de ${etiqueta}.`,
    );
  }

  const tasa = numero(columna(fila, 'IvaTasa'), 0.16);

  return {
    claveProdServ: columna(fila, 'ClaveProdServ').split('.')[0] || '01010101',
    noIdentificacion:
      columna(fila, 'NoIdentificacion', 'UPC').slice(0, 100) || undefined,
    cantidad,
    claveUnidad: columna(fila, 'ClaveUnidad', 'Unidad') || 'H87',
    descripcion: exigir(
      columna(fila, 'Descripcion'),
      `descripcion en ${etiqueta}`,
      idFol,
    ),
    valorUnitario,
    descuento: descuento > 0 ? descuento : undefined,
    objetoImp: clave2(columna(fila, 'ObjetoImp')) || '02',
    tasaIva: tasa,
  };
}

export function mapearVenta(
  filas: FilasVenta,
  contexto: ContextoVenta,
): DatosVenta {
  const { header, cliente, sucursal } = filas;
  const idFol = columna(header, 'IDFOL') || 'N/A';

  if (!filas.detalle?.length) {
    throw new VentaInvalidaError(`El folio ${idFol} no tiene conceptos.`);
  }

  // El RFC del emisor decide con que certificado se sella.
  const rfcEmisor = exigir(
    columna(header, 'RfcEmisor') || columna(sucursal, 'RFC'),
    'RFC emisor',
    idFol,
  ).toUpperCase();

  const rfcReceptor = exigir(
    columna(header, 'RfcReceptor') || columna(cliente, 'RFCRECEPTOR', 'RFC'),
    'RFC receptor',
    idFol,
  ).toUpperCase();

  const usoCfdi = normalizarUsoCfdi(columna(header, 'UsoCfdi', 'USOCFDI'));
  if (!usoCfdi) {
    throw new VentaInvalidaError(
      `El folio ${idFol} no tiene UsoCfdi valido en FAC_SVR_SHAP.`,
    );
  }

  const metodoPagoTexto = (
    columna(header, 'MetodoDePago', 'MetodoPago') || 'PUE'
  ).toUpperCase();
  if (metodoPagoTexto !== 'PUE' && metodoPagoTexto !== 'PPD') {
    throw new VentaInvalidaError(
      `El folio ${idFol} trae MetodoDePago '${metodoPagoTexto}'; solo PUE o PPD.`,
    );
  }

  const formaPago = clave2(
    columna(header, 'FormaPagoSAT') || columna(header, 'FormaPago'),
  );
  if (!formaPago) {
    throw new VentaInvalidaError(
      `El folio ${idFol} no tiene forma de pago del SAT.`,
    );
  }

  const esPublicoEnGeneral = rfcReceptor === 'XAXX010101000';

  return {
    rfcEmisor,
    serie: contexto.serie,
    folio: contexto.folio,
    fecha: contexto.fecha,
    formaPago,
    metodoPago: metodoPagoTexto,
    receptor: {
      rfc: rfcReceptor,
      nombre: esPublicoEnGeneral
        ? 'PUBLICO EN GENERAL'
        : exigir(
            normalizarNombreSat(
              columna(header, 'RazonSocialReceptor') ||
                columna(cliente, 'RazonSocialReceptor', 'RAZONSOCIALRECEPTOR'),
            ),
            'razon social del receptor',
            idFol,
          ),
      // Validar ANTES de rellenar: '' .padStart(5) da '00000', que pasaria
      // como CP valido y el PAC rechazaria sin decir por que.
      domicilioFiscal: exigir(
        columna(cliente, 'CODIGOPOSTALRECEPTOR', 'CODIGOPOSTAL', 'CP'),
        'codigo postal del receptor',
        idFol,
      ).padStart(5, '0'),
      regimenFiscal: esPublicoEnGeneral
        ? '616'
        : exigir(
            columna(
              cliente,
              'REGIMENRECEPTOR',
              'REGIMENFISCALRECEPTOR',
              'REGIMEN',
            ).split('.')[0],
            'regimen fiscal del receptor',
            idFol,
          ).padStart(3, '0'),
      usoCfdi,
    },
    conceptos: filas.detalle.map((fila, i) => mapearConcepto(fila, i, idFol)),
    // Con RFC generico el SAT exige la factura global.
    informacionGlobal: esPublicoEnGeneral
      ? {
          periodicidad: '01',
          meses: contexto.fecha.slice(5, 7),
          anio: contexto.fecha.slice(0, 4),
        }
      : undefined,
  };
}
