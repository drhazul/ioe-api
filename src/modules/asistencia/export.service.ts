import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { AsistenciaReporteResult } from './asistencia.service';

type RobotoFontPaths = {
  normal: string;
  bold: string;
  italics: string;
  bolditalics: string;
};

export type NominaColumnKey =
  | 'fecha'
  | 'pin'
  | 'nombre'
  | 'sucursal'
  | 'entrada'
  | 'salida'
  | 'estatus'
  | 'minutos_trabajados'
  | 'minutos_extra'
  | 'retardo_minutos'
  | 'salida_temprana_minutos';

type NominaColumnDefinition = {
  key: NominaColumnKey;
  header: string;
  width: number;
  resolver: (row: AsistenciaReporteResult['rows'][number]) => string | number;
};

@Injectable()
export class ExportService {
  private readonly corporateBlue = '#1A237E';
  private pdfmakeInstance: any;
  private pdfReady = false;
  private fontsReady = false;
  private resolvedFonts: RobotoFontPaths | null = null;
  private readonly nominaColumnsCatalog: Record<
    NominaColumnKey,
    NominaColumnDefinition
  > = {
    fecha: {
      key: 'fecha',
      header: 'Fecha',
      width: 14,
      resolver: (row) => row.fecha,
    },
    pin: {
      key: 'pin',
      header: 'PIN',
      width: 14,
      resolver: (row) => row.pin,
    },
    nombre: {
      key: 'nombre',
      header: 'Nombre',
      width: 34,
      resolver: (row) => row.nombre,
    },
    sucursal: {
      key: 'sucursal',
      header: 'Sucursal',
      width: 16,
      resolver: (row) => row.suc ?? '',
    },
    entrada: {
      key: 'entrada',
      header: 'Entrada',
      width: 14,
      resolver: (row) => row.entrada ?? '-',
    },
    salida: {
      key: 'salida',
      header: 'Salida',
      width: 14,
      resolver: (row) => row.salida ?? '-',
    },
    estatus: {
      key: 'estatus',
      header: 'Estatus',
      width: 18,
      resolver: (row) => row.estatus,
    },
    minutos_trabajados: {
      key: 'minutos_trabajados',
      header: 'Min Trabajados',
      width: 16,
      resolver: (row) => row.minutos_trabajados ?? 0,
    },
    minutos_extra: {
      key: 'minutos_extra',
      header: 'Min Extra',
      width: 14,
      resolver: (row) => row.minutos_extra ?? 0,
    },
    retardo_minutos: {
      key: 'retardo_minutos',
      header: 'Retardo Min',
      width: 14,
      resolver: (row) => row.retardo_minutos ?? 0,
    },
    salida_temprana_minutos: {
      key: 'salida_temprana_minutos',
      header: 'Salida Temp Min',
      width: 18,
      resolver: (row) => row.salida_temprana_minutos ?? 0,
    },
  };

  constructor() {
    const maybeDefault = (pdfMake as any)?.default;
    this.pdfmakeInstance =
      maybeDefault && typeof maybeDefault === 'object'
        ? maybeDefault
        : (pdfMake as any);
    this.initializePdfMake();
  }

  async exportAsistenciaExcel(data: AsistenciaReporteResult): Promise<Buffer> {
    await this.yieldEventLoop();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IOE API';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Asistencia');

    sheet.columns = [
      { header: 'Nombre', key: 'nombre', width: 34 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Entrada', key: 'entrada', width: 14 },
      { header: 'Salida', key: 'salida', width: 14 },
      { header: 'Estatus', key: 'estatus', width: 12 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };

    for (const row of data.rows) {
      sheet.addRow({
        nombre: row.nombre,
        fecha: row.fecha,
        entrada: row.entrada ?? '-',
        salida: row.salida ?? '-',
        estatus: row.estatus,
      });
    }

    const summaryRow = sheet.addRow({
      nombre: `Total registros: ${data.total}`,
      fecha: `${data.desde} a ${data.hasta}`,
      entrada: '',
      salida: '',
      estatus: '',
    });
    summaryRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportAsistenciaPdf(data: AsistenciaReporteResult): Promise<Buffer> {
    await this.yieldEventLoop();
    if (
      !this.pdfReady ||
      typeof this.pdfmakeInstance?.createPdf !== 'function'
    ) {
      throw new Error('pdfmake no está inicializado correctamente');
    }

    const tableBody = [
      [
        { text: 'Nombre', style: 'tableHeader' },
        { text: 'Fecha', style: 'tableHeader' },
        { text: 'Entrada', style: 'tableHeader' },
        { text: 'Salida', style: 'tableHeader' },
        { text: 'Estatus', style: 'tableHeader' },
      ],
      ...data.rows.map((row) => [
        row.nombre,
        row.fecha,
        row.entrada ?? '-',
        row.salida ?? '-',
        row.estatus,
      ]),
    ];

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      defaultStyle: { font: 'Roboto', fontSize: 9 },
      content: [
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  text: 'SISTEMA DE GESTIÓN IOE',
                  color: '#FFFFFF',
                  bold: true,
                  fontSize: 13,
                  alignment: 'left',
                  margin: [10, 8, 10, 8],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
            fillColor: () => this.corporateBlue,
          },
          margin: [0, 0, 0, 10],
        },
        { text: 'Reporte de Asistencia', style: 'header' },
        {
          text: `Periodo: ${data.desde} a ${data.hasta} | Total: ${data.total}`,
          margin: [0, 0, 0, 10],
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 60, 60, 60, 60],
            body: tableBody,
          },
          layout: {
            hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
            vLineWidth: () => 0,
            hLineColor: () => '#CFD8DC',
            fillColor: (rowIndex: number) =>
              rowIndex === 0 ? this.corporateBlue : null,
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        },
      ],
      styles: {
        header: {
          fontSize: 14,
          bold: true,
          margin: [0, 0, 0, 8],
        },
        tableHeader: {
          color: '#FFFFFF',
          bold: true,
        },
      },
    };

    return await new Promise<Buffer>((resolve, reject) => {
      try {
        const pdfDoc = this.pdfmakeInstance.createPdf(docDefinition);
        pdfDoc.getBuffer((buffer: Uint8Array) => {
          resolve(Buffer.from(buffer));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async exportNominaCsv(
    data: AsistenciaReporteResult,
    columns: NominaColumnKey[],
  ): Promise<Buffer> {
    await this.yieldEventLoop();
    const selected = this.resolveNominaColumns(columns);
    const headers = selected.map((item) => item.header);
    const lines = [headers.map((h) => this.escapeCsv(h)).join(',')];

    for (const row of data.rows) {
      const values = selected.map((item) => this.escapeCsv(item.resolver(row)));
      lines.push(values.join(','));
    }

    return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
  }

  async exportNominaExcel(
    data: AsistenciaReporteResult,
    columns: NominaColumnKey[],
  ): Promise<Buffer> {
    await this.yieldEventLoop();
    const selected = this.resolveNominaColumns(columns);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IOE API';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Nomina');
    sheet.columns = selected.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width,
    }));

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };

    for (const row of data.rows) {
      const finalRecord: Record<string, string | number> = {};
      for (const column of selected) {
        finalRecord[column.key] = column.resolver(row);
      }
      sheet.addRow(finalRecord);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  parseNominaColumns(columnsRaw?: string | null): NominaColumnKey[] {
    const raw = String(columnsRaw ?? '').trim();
    if (!raw.length) return this.defaultNominaColumns();

    const values = raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    const out: NominaColumnKey[] = [];
    for (const value of values) {
      if (
        !Object.prototype.hasOwnProperty.call(this.nominaColumnsCatalog, value)
      ) {
        continue;
      }
      const casted = value as NominaColumnKey;
      if (!out.includes(casted)) out.push(casted);
    }

    return out.length ? out : this.defaultNominaColumns();
  }

  healthCheck() {
    try {
      const excelLoaded = typeof ExcelJS.Workbook === 'function';
      const pdfLoaded =
        this.pdfReady && typeof this.pdfmakeInstance?.createPdf === 'function';

      return {
        ok: excelLoaded && pdfLoaded && this.fontsReady,
        exceljs: excelLoaded,
        pdfmake: pdfLoaded,
        fontsReady: this.fontsReady,
      };
    } catch (error) {
      return {
        ok: false,
        exceljs: false,
        pdfmake: false,
        fontsReady: false,
        error: String(error),
      };
    }
  }

  private initializePdfMake() {
    try {
      this.resolvedFonts = this.resolveRobotoFonts();
      this.fontsReady = this.validateFontFiles(this.resolvedFonts);

      this.pdfmakeInstance.fonts = {
        Roboto: {
          normal: 'Roboto-Regular.ttf',
          bold: 'Roboto-Medium.ttf',
          italics: 'Roboto-Italic.ttf',
          bolditalics: 'Roboto-MediumItalic.ttf',
        },
      };
    } catch (error) {
      this.resolvedFonts = null;
      this.fontsReady = false;
      console.error(
        'ERROR CRÍTICO: No se encontraron los archivos TTF en src/assets/fonts',
      );
      console.error(error);
    }

    const fontsAny = pdfFonts as any;
    const vfs = fontsAny?.pdfMake?.vfs ?? fontsAny?.vfs ?? fontsAny ?? null;
    if (vfs && typeof vfs === 'object') {
      this.pdfmakeInstance.vfs = vfs;
    }

    this.pdfReady =
      this.fontsReady && typeof this.pdfmakeInstance?.createPdf === 'function';
  }

  private defaultNominaColumns(): NominaColumnKey[] {
    return [
      'fecha',
      'pin',
      'nombre',
      'sucursal',
      'entrada',
      'salida',
      'estatus',
    ];
  }

  private resolveNominaColumns(columns: NominaColumnKey[]) {
    const requested = columns.length ? columns : this.defaultNominaColumns();
    return requested
      .map((key) => this.nominaColumnsCatalog[key])
      .filter((value): value is NominaColumnDefinition => value != null);
  }

  private escapeCsv(value: string | number) {
    const raw = String(value ?? '');
    const escaped = raw.replaceAll('"', '""');
    return `"${escaped}"`;
  }

  private resolveRobotoFonts(): RobotoFontPaths {
    const srcRoot = path.join(process.cwd(), 'src', 'assets', 'fonts');
    const distRoot = path.join(process.cwd(), 'dist', 'assets', 'fonts');

    const srcFonts = this.buildRobotoPaths(srcRoot);
    if (this.validateFontFiles(srcFonts)) {
      return srcFonts;
    }

    const distFonts = this.buildRobotoPaths(distRoot);
    if (this.validateFontFiles(distFonts)) {
      return distFonts;
    }

    throw new Error('Roboto TTF files not found in src/assets/fonts or dist');
  }

  private buildRobotoPaths(baseDir: string): RobotoFontPaths {
    return {
      normal: path.join(baseDir, 'Roboto-Regular.ttf'),
      bold: path.join(baseDir, 'Roboto-Medium.ttf'),
      italics: path.join(baseDir, 'Roboto-Italic.ttf'),
      bolditalics: path.join(baseDir, 'Roboto-MediumItalic.ttf'),
    };
  }

  private validateFontFiles(fonts: RobotoFontPaths): boolean {
    return Object.values(fonts).every((fontPath) => existsSync(fontPath));
  }

  private async yieldEventLoop() {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
