import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

type TrustedExcelUploadOptions = {
  maxBytes?: number;
  allowLegacyXls?: boolean;
  maxSheets?: number;
  maxRowsPerSheet?: number;
  maxColsPerSheet?: number;
};

type TrustedExcelUploadResult = {
  buffer: Buffer;
  extension: '.xlsx' | '.xls';
};

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP
const XLS_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_SHEETS = 10;
const DEFAULT_MAX_ROWS_PER_SHEET = 100000;
const DEFAULT_MAX_COLS_PER_SHEET = 250;

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
]);

function isAllowedMagic(buffer: Buffer, extension: '.xlsx' | '.xls') {
  if (extension === '.xlsx') return buffer.subarray(0, 4).equals(XLSX_MAGIC);
  return buffer.subarray(0, 8).equals(XLS_MAGIC);
}

function pickExtension(filename: string, allowLegacyXls: boolean) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx')) return '.xlsx' as const;
  if (allowLegacyXls && lower.endsWith('.xls')) return '.xls' as const;
  return null;
}

function getPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function assertTrustedExcelUpload(
  file: any,
  options: TrustedExcelUploadOptions = {},
): TrustedExcelUploadResult {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('Archivo Excel requerido');
  }

  const allowLegacyXls = options.allowLegacyXls ?? true;
  const filename = String(file.originalname ?? '').trim();
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    throw new BadRequestException('Nombre de archivo inválido');
  }

  const extension = pickExtension(filename, allowLegacyXls);
  if (!extension) {
    throw new BadRequestException(
      allowLegacyXls
        ? 'Formato no soportado. Usa .xlsx o .xls'
        : 'Formato no soportado. Usa .xlsx',
    );
  }

  const mimeType = String(file.mimetype ?? '').trim().toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new BadRequestException('Tipo MIME de Excel no permitido');
  }

  const maxBytes =
    options.maxBytes ??
    getPositiveIntEnv('EXCEL_UPLOAD_MAX_BYTES', DEFAULT_MAX_BYTES);
  if (file.buffer.length <= 0 || file.buffer.length > maxBytes) {
    throw new BadRequestException(
      `Tamaño de archivo no permitido. Máximo ${maxBytes} bytes`,
    );
  }

  if (!isAllowedMagic(file.buffer, extension)) {
    throw new BadRequestException('Firma binaria de archivo inválida');
  }

  return { buffer: file.buffer as Buffer, extension };
}

export function assertTrustedWorkbookBounds(
  workbook: XLSX.WorkBook,
  options: TrustedExcelUploadOptions = {},
) {
  const maxSheets =
    options.maxSheets ??
    getPositiveIntEnv('EXCEL_UPLOAD_MAX_SHEETS', DEFAULT_MAX_SHEETS);
  const maxRows =
    options.maxRowsPerSheet ??
    getPositiveIntEnv(
      'EXCEL_UPLOAD_MAX_ROWS_PER_SHEET',
      DEFAULT_MAX_ROWS_PER_SHEET,
    );
  const maxCols =
    options.maxColsPerSheet ??
    getPositiveIntEnv(
      'EXCEL_UPLOAD_MAX_COLS_PER_SHEET',
      DEFAULT_MAX_COLS_PER_SHEET,
    );

  const sheets = workbook.SheetNames ?? [];
  if (!sheets.length) {
    throw new BadRequestException('El archivo Excel no contiene hojas');
  }
  if (sheets.length > maxSheets) {
    throw new BadRequestException(
      `Excel excede hojas permitidas (${maxSheets})`,
    );
  }

  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet?.['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const rows = range.e.r - range.s.r + 1;
    const cols = range.e.c - range.s.c + 1;
    if (rows > maxRows) {
      throw new BadRequestException(
        `Excel excede renglones permitidos (${maxRows})`,
      );
    }
    if (cols > maxCols) {
      throw new BadRequestException(
        `Excel excede columnas permitidas (${maxCols})`,
      );
    }
  }
}
