import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  Content,
  Margins,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

/** pdfmake pide los margenes como tupla de cuatro; esto evita el casteo. */
const m = (a: number, b: number, c: number, d: number): Margins => [a, b, c, d];

/**
 * pdfmake 0.3 no trae tipos para su entrada de servidor, y el build que si
 * los trae es el del navegador: ahi `getBuffer` nunca llama de vuelta bajo
 * Node. Por eso se usa `js/Printer`, que devuelve un stream de pdfkit.
 */
interface DocumentoPdfKit extends NodeJS.ReadableStream {
  end(): void;
}
interface PrinterLike {
  createPdfKitDocument(doc: TDocumentDefinitions): Promise<DocumentoPdfKit>;
}
type ConstructorPrinter = new (
  fuentes: unknown,
  virtualfs: unknown,
  urlResolver: unknown,
) => PrinterLike;

/* eslint-disable @typescript-eslint/no-require-imports */
const Printer = (
  require('pdfmake/js/Printer') as { default: ConstructorPrinter }
).default;
const virtualfs = (require('pdfmake/js/virtual-fs') as { default: unknown })
  .default;
const URLResolver = (
  require('pdfmake/js/URLResolver') as {
    default: new (fs: unknown) => unknown;
  }
).default;
/* eslint-enable @typescript-eslint/no-require-imports */
import * as QRCode from 'qrcode';
import {
  cadenaOriginalTimbre,
  CfdiImpreso,
  leerCfdiTimbrado,
  urlVerificacionSat,
} from './cfdi-lector';
import { FORMAS_PAGO, REGIMENES, USOS_CFDI } from './catalogos-sat';

/**
 * Representacion impresa del CFDI, generada aqui a partir del XML timbrado.
 *
 * Se hace de nuestro lado porque el servicio `obtener_pdf` de Quadrum responde
 * "Permission Denied" con la cuenta actual. De todos modos conviene: el PDF no
 * tiene valor fiscal (el documento es el XML), asi que no hay razon para
 * depender del PAC para dibujarlo.
 *
 * Lo que el SAT exige que aparezca esta en el Anexo 20: datos de emisor y
 * receptor, folio fiscal, fechas de emision y certificacion, los dos numeros
 * de certificado, los sellos, la cadena original del timbre, el codigo QR de
 * verificacion y la leyenda de representacion impresa.
 */
@Injectable()
export class RepresentacionImpresaService {
  /** Los TTF viven en el repo; en produccion se copian a dist/assets. */
  private readonly printer: PrinterLike = new Printer(
    {
      Roboto: {
        normal: this.fuente('Roboto-Regular.ttf'),
        bold: this.fuente('Roboto-Medium.ttf'),
        italics: this.fuente('Roboto-Italic.ttf'),
        bolditalics: this.fuente('Roboto-MediumItalic.ttf'),
      },
    },
    virtualfs,
    new URLResolver(virtualfs),
  );

  async generar(xmlTimbrado: string): Promise<Buffer> {
    const cfdi = leerCfdiTimbrado(xmlTimbrado);
    const qr = await QRCode.toDataURL(urlVerificacionSat(cfdi), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 300,
    });

    const doc = await this.printer.createPdfKitDocument(
      this.armarDocumento(cfdi, qr),
    );

    return new Promise<Buffer>((resolve, reject) => {
      const trozos: Buffer[] = [];
      doc.on('data', (trozo: Buffer) => trozos.push(trozo));
      doc.on('end', () => resolve(Buffer.concat(trozos)));
      doc.on('error', reject);
      doc.end();
    });
  }

  /** En desarrollo los TTF estan en src; compilado, en dist. */
  private fuente(archivo: string): string {
    const enSrc = join(process.cwd(), 'src', 'assets', 'fonts', archivo);
    if (existsSync(enSrc)) return enSrc;
    return join(process.cwd(), 'dist', 'assets', 'fonts', archivo);
  }
  // ---------------------------------------------------------------------

  private armarDocumento(cfdi: CfdiImpreso, qr: string): TDocumentDefinitions {
    const gris = '#f2f2f2';
    const borde = '#cccccc';

    return {
      pageSize: 'LETTER',
      pageMargins: [28, 28, 28, 36],
      defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 },
      styles: {
        titulo: { fontSize: 13, bold: true },
        etiqueta: { fontSize: 7, color: '#666666' },
        encabezadoTabla: { bold: true, fontSize: 8, color: '#ffffff' },
        sello: { fontSize: 5.5, color: '#444444' },
      },
      footer: (pagina: number, total: number) => ({
        margin: m(28, 0, 28, 0),
        columns: [
          {
            text:
              'Este documento es una representacion impresa de un CFDI. ' +
              'El documento con valor fiscal es el archivo XML.',
            fontSize: 6,
            color: '#666666',
          },
          {
            text: `Pagina ${pagina} de ${total}`,
            fontSize: 6,
            color: '#666666',
            alignment: 'right',
            width: 60,
          },
        ],
      }),
      content: [
        this.bloqueEncabezado(cfdi, gris, borde),
        { text: ' ', fontSize: 4 },
        this.bloqueReceptor(cfdi, gris, borde),
        { text: ' ', fontSize: 4 },
        // El REP no lleva conceptos de verdad (uno fijo en ceros): en su
        // lugar se imprime el pago, que es lo que el documento ampara.
        ...(cfdi.pago
          ? [this.bloquePago(cfdi, gris, borde)]
          : [
              this.tablaConceptos(cfdi, borde),
              { text: ' ', fontSize: 4 } as Content,
              this.bloqueTotales(cfdi, gris, borde),
            ]),
        { text: ' ', fontSize: 6 },
        this.bloqueTimbre(cfdi, qr, borde),
      ],
    };
  }

  private bloqueEncabezado(
    cfdi: CfdiImpreso,
    gris: string,
    borde: string,
  ): Content {
    return {
      table: {
        widths: ['*', 190],
        body: [
          [
            {
              stack: [
                { text: cfdi.emisor.nombre, style: 'titulo' },
                { text: `RFC: ${cfdi.emisor.rfc}`, margin: m(0, 3, 0, 0) },
                {
                  text: `Regimen fiscal: ${this.regimen(cfdi.emisor.regimenFiscal)}`,
                },
                { text: `Lugar de expedicion: ${cfdi.lugarExpedicion}` },
              ],
              margin: m(6, 6, 6, 6),
            },
            {
              stack: [
                {
                  text: this.tipoComprobante(cfdi.tipoDeComprobante),
                  bold: true,
                  alignment: 'right',
                },
                {
                  text: `Serie y folio: ${cfdi.serie}-${cfdi.folio}`,
                  alignment: 'right',
                  margin: m(0, 3, 0, 0),
                },
                {
                  text: `Fecha de emision: ${this.fecha(cfdi.fecha)}`,
                  alignment: 'right',
                },
                {
                  text: `Fecha de certificacion: ${this.fecha(cfdi.timbre.fechaTimbrado)}`,
                  alignment: 'right',
                },
                {
                  text: 'Folio fiscal (UUID)',
                  style: 'etiqueta',
                  alignment: 'right',
                  margin: m(0, 3, 0, 0),
                },
                { text: cfdi.timbre.uuid, bold: true, alignment: 'right' },
              ],
              fillColor: gris,
              margin: m(6, 6, 6, 6),
            },
          ],
        ],
      },
      layout: {
        hLineColor: () => borde,
        vLineColor: () => borde,
      },
    };
  }

  private bloqueReceptor(
    cfdi: CfdiImpreso,
    gris: string,
    borde: string,
  ): Content {
    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: 'RECEPTOR',
              style: 'encabezadoTabla',
              fillColor: '#1f4e78',
              margin: m(6, 3, 6, 3),
            },
          ],
          [
            {
              columns: [
                {
                  stack: [
                    { text: 'Nombre o razon social', style: 'etiqueta' },
                    { text: cfdi.receptor.nombre, bold: true },
                    { text: 'RFC', style: 'etiqueta', margin: m(0, 3, 0, 0) },
                    { text: cfdi.receptor.rfc },
                  ],
                },
                {
                  stack: [
                    { text: 'Domicilio fiscal (C.P.)', style: 'etiqueta' },
                    { text: cfdi.receptor.domicilioFiscal },
                    {
                      text: 'Regimen fiscal',
                      style: 'etiqueta',
                      margin: m(0, 3, 0, 0),
                    },
                    { text: this.regimen(cfdi.receptor.regimenFiscal) },
                  ],
                },
                {
                  stack: [
                    { text: 'Uso del CFDI', style: 'etiqueta' },
                    { text: this.uso(cfdi.receptor.usoCfdi) },
                    {
                      text: 'Metodo y forma de pago',
                      style: 'etiqueta',
                      margin: m(0, 3, 0, 0),
                    },
                    {
                      text: `${cfdi.metodoPago} · ${this.formaPago(cfdi.formaPago)}`,
                    },
                  ],
                },
              ],
              columnGap: 10,
              margin: m(6, 5, 6, 5),
              fillColor: gris,
            },
          ],
        ],
      },
      layout: { hLineColor: () => borde, vLineColor: () => borde },
    };
  }

  private tablaConceptos(cfdi: CfdiImpreso, borde: string): Content {
    const encabezado: TableCell[] = [
      'Clave SAT',
      'No. ident.',
      'Cant.',
      'Unidad',
      'Descripcion',
      'Valor unit.',
      'Importe',
    ].map((t) => ({
      text: t,
      style: 'encabezadoTabla',
      fillColor: '#1f4e78',
      margin: m(3, 3, 3, 3),
    }));

    const filas: TableCell[][] = cfdi.conceptos.map((c) => [
      { text: c.claveProdServ, margin: m(3, 2, 3, 2) },
      { text: c.noIdentificacion, margin: m(3, 2, 3, 2) },
      { text: c.cantidad, alignment: 'right', margin: m(3, 2, 3, 2) },
      { text: c.claveUnidad, margin: m(3, 2, 3, 2) },
      { text: c.descripcion, margin: m(3, 2, 3, 2) },
      {
        text: this.moneda(c.valorUnitario, cfdi.moneda),
        alignment: 'right',
        margin: m(3, 2, 3, 2),
      },
      {
        text: this.moneda(c.importe, cfdi.moneda),
        alignment: 'right',
        margin: m(3, 2, 3, 2),
      },
    ]);

    return {
      table: {
        headerRows: 1,
        widths: [50, 45, 28, 32, '*', 55, 55],
        body: [encabezado, ...filas],
      },
      layout: {
        hLineColor: () => borde,
        vLineColor: () => borde,
        fillColor: (fila: number) =>
          fila > 0 && fila % 2 === 0 ? '#fafafa' : null,
      },
    };
  }

  /**
   * El pago que ampara el REP y la factura a la que se aplica.
   *
   * El SAT exige que la representacion impresa muestre fecha, forma e importe
   * del pago, mas el documento relacionado con su parcialidad y sus saldos.
   * Sin esto el PDF solo mostraria los ceros del comprobante.
   */
  private bloquePago(cfdi: CfdiImpreso, gris: string, borde: string): Content {
    const pago = cfdi.pago!;
    const moneda = pago.moneda || 'MXN';

    const encabezados = [
      'Factura pagada (UUID)',
      'Serie-folio',
      'Parc.',
      'Saldo anterior',
      'Pagado',
      'Saldo insoluto',
    ].map(
      (texto): TableCell => ({
        text: texto,
        style: 'encabezadoTabla',
        fillColor: '#1f4e78',
        margin: m(3, 3, 3, 3),
      }),
    );

    const renglon: TableCell[] = [
      { text: pago.uuidFactura, margin: m(3, 2, 3, 2) },
      {
        text: `${pago.serieFactura}-${pago.folioFactura}`,
        margin: m(3, 2, 3, 2),
      },
      {
        text: String(pago.parcialidad),
        alignment: 'center',
        margin: m(3, 2, 3, 2),
      },
      {
        text: this.moneda(pago.saldoAnterior, moneda),
        alignment: 'right',
        margin: m(3, 2, 3, 2),
      },
      {
        text: this.moneda(pago.monto, moneda),
        alignment: 'right',
        margin: m(3, 2, 3, 2),
      },
      {
        text: this.moneda(pago.saldoInsoluto, moneda),
        alignment: 'right',
        bold: true,
        margin: m(3, 2, 3, 2),
      },
    ];

    return {
      stack: [
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  text: 'PAGO RECIBIDO',
                  style: 'encabezadoTabla',
                  fillColor: '#1f4e78',
                  margin: m(6, 3, 6, 3),
                },
              ],
              [
                {
                  columns: [
                    {
                      stack: [
                        { text: 'Fecha del pago', style: 'etiqueta' },
                        { text: this.fecha(pago.fechaPago) },
                      ],
                    },
                    {
                      stack: [
                        { text: 'Forma de pago', style: 'etiqueta' },
                        { text: this.formaPago(pago.formaDePago) },
                      ],
                    },
                    {
                      stack: [
                        { text: 'Monto pagado', style: 'etiqueta' },
                        {
                          text: this.moneda(pago.monto, moneda),
                          bold: true,
                          fontSize: 12,
                        },
                      ],
                    },
                  ],
                  columnGap: 10,
                  margin: m(6, 5, 6, 5),
                  fillColor: gris,
                },
              ],
            ],
          },
          layout: { hLineColor: () => borde, vLineColor: () => borde },
        },
        { text: ' ', fontSize: 4 },
        {
          table: {
            headerRows: 1,
            widths: [150, 58, 32, 62, 62, 62],
            body: [encabezados, renglon],
          },
          layout: { hLineColor: () => borde, vLineColor: () => borde },
        },
        {
          text:
            'El comprobante va en ceros y moneda XXX porque asi lo define el ' +
            'SAT para los complementos de pago: el importe real es el de arriba.',
          style: 'etiqueta',
          margin: m(2, 4, 0, 0),
        },
      ],
    };
  }

  private bloqueTotales(
    cfdi: CfdiImpreso,
    gris: string,
    borde: string,
  ): Content {
    const renglones: Array<[string, string]> = [
      ['Subtotal', this.moneda(cfdi.subTotal, cfdi.moneda)],
    ];
    if (cfdi.descuento) {
      renglones.push(['Descuento', this.moneda(cfdi.descuento, cfdi.moneda)]);
    }
    if (cfdi.totalImpuestosTrasladados) {
      renglones.push([
        'Impuestos trasladados',
        this.moneda(cfdi.totalImpuestosTrasladados, cfdi.moneda),
      ]);
    }
    if (cfdi.totalImpuestosRetenidos) {
      renglones.push([
        'Impuestos retenidos',
        this.moneda(cfdi.totalImpuestosRetenidos, cfdi.moneda),
      ]);
    }

    return {
      columns: [
        {
          width: '*',
          stack: [{ text: 'Moneda', style: 'etiqueta' }, { text: cfdi.moneda }],
          margin: m(2, 4, 0, 0),
        },
        {
          width: 220,
          table: {
            widths: ['*', 85],
            body: [
              ...renglones.map(([etiqueta, valor]): TableCell[] => [
                { text: etiqueta, margin: m(5, 2, 5, 2) },
                { text: valor, alignment: 'right', margin: m(5, 2, 5, 2) },
              ]),
              [
                {
                  text: 'TOTAL',
                  bold: true,
                  fillColor: gris,
                  margin: m(5, 3, 5, 3),
                },
                {
                  text: this.moneda(cfdi.total, cfdi.moneda),
                  bold: true,
                  alignment: 'right',
                  fillColor: gris,
                  margin: m(5, 3, 5, 3),
                },
              ],
            ],
          },
          layout: { hLineColor: () => borde, vLineColor: () => borde },
        },
      ],
    };
  }

  private bloqueTimbre(cfdi: CfdiImpreso, qr: string, borde: string): Content {
    return {
      table: {
        widths: [95, '*'],
        body: [
          [
            { image: qr, width: 88, margin: m(3, 3, 3, 3) },
            {
              stack: [
                { text: 'No. de certificado del emisor', style: 'etiqueta' },
                { text: cfdi.noCertificado },
                {
                  text: 'No. de certificado del SAT',
                  style: 'etiqueta',
                  margin: m(0, 3, 0, 0),
                },
                { text: cfdi.timbre.noCertificadoSat },
                {
                  text: 'RFC del proveedor de certificacion',
                  style: 'etiqueta',
                  margin: m(0, 3, 0, 0),
                },
                { text: cfdi.timbre.rfcProvCertif },
                {
                  text: 'Sello digital del emisor',
                  style: 'etiqueta',
                  margin: m(0, 4, 0, 0),
                },
                { text: cfdi.sello, style: 'sello' },
                {
                  text: 'Sello digital del SAT',
                  style: 'etiqueta',
                  margin: m(0, 3, 0, 0),
                },
                { text: cfdi.timbre.selloSat, style: 'sello' },
                {
                  text: 'Cadena original del complemento de certificacion digital del SAT',
                  style: 'etiqueta',
                  margin: m(0, 3, 0, 0),
                },
                { text: cadenaOriginalTimbre(cfdi), style: 'sello' },
              ],
              margin: m(5, 4, 5, 4),
            },
          ],
        ],
      },
      layout: { hLineColor: () => borde, vLineColor: () => borde },
    };
  }

  // --- formato -----------------------------------------------------------

  private moneda(valor: string, moneda: string): string {
    const n = Number(valor);
    if (!Number.isFinite(n)) return valor;
    const texto = n.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
    return moneda === 'MXN' ? `$${texto}` : `${texto} ${moneda}`;
  }

  /** `2026-10-01T00:25:35` se lee mejor como `01/10/2026 00:25:35`. */
  private fecha(valor: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})$/.exec(valor ?? '');
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : (valor ?? '');
  }

  private regimen(clave: string): string {
    return clave ? `${clave} · ${REGIMENES[clave] ?? ''}`.trim() : '';
  }

  private uso(clave: string): string {
    return clave ? `${clave} · ${USOS_CFDI[clave] ?? ''}`.trim() : '';
  }

  private formaPago(clave: string): string {
    return clave ? `${clave} · ${FORMAS_PAGO[clave] ?? ''}`.trim() : '';
  }

  private tipoComprobante(clave: string): string {
    const tipos: Record<string, string> = {
      I: 'FACTURA (INGRESO)',
      E: 'NOTA DE CREDITO (EGRESO)',
      T: 'TRASLADO',
      N: 'NOMINA',
      P: 'COMPLEMENTO DE PAGO',
    };
    return tipos[clave] ?? clave;
  }
}
