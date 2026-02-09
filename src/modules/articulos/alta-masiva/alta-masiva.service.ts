import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';

type StagingRow = {
  BatchId: string;
  RowNum: number;
  SUC: string | null;
  TIPO: string | null;
  ART: string | null;
  UPC: string | null;
  CLAVESAT: string | null;
  UNIMEDSAT: string | null;
  DES: string | null;
  STOCK: string | null;
  STOCK_MIN: string | null;
  ESTATUS: string | null;
  DIA_REABASTO: string | null;
  PVTA: string | null;
  CTOP: string | null;
  PROV_1: string | null;
  CTO_PROV1: string | null;
  PROV_2: string | null;
  CTO_PROV2: string | null;
  PROV_3: string | null;
  CTO_PROV3: string | null;
  UN_COMP: string | null;
  FACT_COMP: string | null;
  UN_VTA: string | null;
  FACT_VTA: string | null;
  BASE: string | null;
  SPH: string | null;
  CYL: string | null;
  ADIC: string | null;
  DEPA: string | null;
  SUBD: string | null;
  CLAS: string | null;
  SCLA: string | null;
  SCLA2: string | null;
  UMUE: string | null;
  UTRA: string | null;
  UNIV: string | null;
  UFRE: string | null;
  BLOQ: string | null;
  MARCA: string | null;
  MODELO: string | null;
};

type AltaMasivaUploadResult = {
  batchId: string;
  totalRows: number;
};

type AltaMasivaValidationResult = {
  batchId: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: Array<{
    rowNum: number;
    suc: string | null;
    art: string | null;
    upc: string | null;
    errorMsg: string | null;
  }>;
};

type AltaMasivaCommitResult = {
  batchId: string;
  insertedRows: number;
  inserted: Array<{
    art: string;
    upc: string;
    suc: string | null;
    des: string | null;
    tipo: string | null;
  }>;
};

type AltaMasivaPreviewResult = {
  headers: string[];
  rows: string[][];
};

@Injectable()
export class AltaMasivaService {
  constructor(private readonly dataSource: DataSource) {}

  async upload(file: any): Promise<AltaMasivaUploadResult> {
    if (!file?.buffer) {
      throw new BadRequestException('Archivo Excel requerido');
    }

    const filename = String(file.originalname ?? '').trim();
    const lowerName = filename.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      throw new BadRequestException('Formato no soportado. Usa .xlsx o .xls');
    }

    const rows = this.parseExcelRows(file.buffer);
    if (!rows.length) {
      throw new BadRequestException('El archivo no contiene renglones con datos');
    }

    const batchId = randomUUID();
    const stagedRows = rows.map((row) => ({
      ...row,
      BatchId: batchId,
    }));

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.insertStagingRows(queryRunner, stagedRows);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    return { batchId, totalRows: rows.length };
  }

  async preview(file: any): Promise<AltaMasivaPreviewResult> {
    if (!file?.buffer) {
      throw new BadRequestException('Archivo Excel requerido');
    }

    const filename = String(file.originalname ?? '').trim();
    const lowerName = filename.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      throw new BadRequestException('Formato no soportado. Usa .xlsx o .xls');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: false, raw: false });
    } catch (_err) {
      throw new BadRequestException('No se pudo leer el archivo Excel');
    }

    const firstSheet = workbook.SheetNames?.[0];
    if (!firstSheet) {
      return { headers: [], rows: [] };
    }

    const worksheet = workbook.Sheets[firstSheet];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    }) as unknown as Array<Array<unknown>>;

    const cleaned = rawRows
      .map((row) => row.map((cell) => String(cell ?? '').trim()))
      .filter((row) => row.some((cell) => cell.length > 0));

    if (!cleaned.length) {
      return { headers: [], rows: [] };
    }

    const headerRow = cleaned[0];
    const headerHasData = headerRow.some((h) => h.length > 0);
    const maxLen = cleaned.reduce((prev, row) => (row.length > prev ? row.length : prev), 0);
    const headers = headerHasData
      ? headerRow.map((h, idx) => (h.length > 0 ? h : `COL${idx + 1}`))
      : Array.from({ length: maxLen }, (_, i) => `COL${i + 1}`);

    const dataRows = cleaned
      .slice(headerHasData ? 1 : 0, (headerHasData ? 1 : 0) + 8)
      .map((row) =>
        Array.from({ length: headers.length }, (_, idx) => String(row[idx] ?? '').trim()),
      );

    return { headers, rows: dataRows };
  }

  async validate(batchId: string): Promise<AltaMasivaValidationResult> {
    if (!batchId) throw new BadRequestException('BatchId requerido');

    await this.dataSource.query('EXEC dbo.sp_art_masiva_validate_batch @BatchId = @0', [batchId]);

    const summary = await this.dataSource.query(
      `
      SELECT
        COUNT(1) AS total,
        SUM(CASE WHEN Status = 'VALID' THEN 1 ELSE 0 END) AS validRows,
        SUM(CASE WHEN Status = 'ERROR' THEN 1 ELSE 0 END) AS errorRows
      FROM dbo.JA_NVO_ART_CON
      WHERE BatchId = @0
      `,
      [batchId],
    );
    const totals = summary?.[0] ?? {};

    const errors = await this.dataSource.query(
      `
      SELECT TOP (200)
        RowNum,
        SUC,
        ART,
        UPC,
        ErrorMsg
      FROM dbo.JA_NVO_ART_CON
      WHERE BatchId = @0
        AND Status = 'ERROR'
      ORDER BY RowNum ASC
      `,
      [batchId],
    );

    return {
      batchId,
      totalRows: Number(totals.total ?? 0),
      validRows: Number(totals.validRows ?? 0),
      errorRows: Number(totals.errorRows ?? 0),
      errors: (errors ?? []).map((row: any) => ({
        rowNum: Number(row.RowNum ?? 0),
        suc: this.toNullableString(row.SUC),
        art: this.toNullableString(row.ART),
        upc: this.toNullableString(row.UPC),
        errorMsg: this.toNullableString(row.ErrorMsg),
      })),
    };
  }

  async commit(batchId: string): Promise<AltaMasivaCommitResult> {
    if (!batchId) throw new BadRequestException('BatchId requerido');

    let rows: any[];
    try {
      rows = await this.dataSource.query('EXEC dbo.sp_art_masiva_commit_batch @BatchId = @0', [batchId]);
    } catch (err: any) {
      const message = err?.message ?? 'No se pudo completar el commit';
      throw new BadRequestException(message);
    }

    const inserted = (rows ?? []).map((row: any) => ({
      art: String(row.ART ?? ''),
      upc: String(row.UPC ?? ''),
      suc: this.toNullableString(row.SUC),
      des: this.toNullableString(row.DES),
      tipo: this.toNullableString(row.TIPO),
    }));

    return {
      batchId,
      insertedRows: inserted.length,
      inserted,
    };
  }

  private parseExcelRows(buffer: Buffer): StagingRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
    } catch (_err) {
      throw new BadRequestException('No se pudo leer el archivo Excel');
    }

    const firstSheet = workbook.SheetNames?.[0];
    if (!firstSheet) {
      throw new BadRequestException('El archivo Excel no contiene hojas');
    }

    const worksheet = workbook.Sheets[firstSheet];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      raw: false,
      blankrows: false,
    });
    if (!jsonRows.length) return [];

    const normalizeKey = (key: string) =>
      key.toUpperCase().replace(/[\s\-]+/g, '').replace(/[^A-Z0-9_]/g, '');

    const rows: StagingRow[] = [];
    jsonRows.forEach((raw, index) => {
      const rowMap = new Map<string, unknown>();
      for (const [key, value] of Object.entries(raw)) {
        rowMap.set(normalizeKey(key), value);
      }

      const pick = (...candidates: string[]) => {
        for (const key of candidates) {
          if (rowMap.has(key)) return rowMap.get(key);
        }
        return null;
      };

      const row: StagingRow = {
        BatchId: '',
        RowNum: index + 2,
        SUC: this.toNullableString(pick('SUC'), 5),
        TIPO: this.toNullableString(pick('TIPO'), 255),
        ART: this.toNullableString(pick('ART'), 10),
        UPC: this.toNullableString(pick('UPC'), 15),
        CLAVESAT: this.toNullableString(pick('CLAVESAT')),
        UNIMEDSAT: this.toNullableString(pick('UNIMEDSAT'), 255),
        DES: this.toNullableString(pick('DES'), 255),
        STOCK: this.toNullableString(pick('STOCK')),
        STOCK_MIN: this.toNullableString(pick('STOCK_MIN', 'STOCKMIN')),
        ESTATUS: this.toNullableString(pick('ESTATUS'), 255),
        DIA_REABASTO: this.toNullableString(pick('DIA_REABASTO', 'DIAREABASTO')),
        PVTA: this.toNullableString(pick('PVTA')),
        CTOP: this.toNullableString(pick('CTOP')),
        PROV_1: this.toNullableString(pick('PROV_1', 'PROV1')),
        CTO_PROV1: this.toNullableString(pick('CTO_PROV1', 'CTOPROV1')),
        PROV_2: this.toNullableString(pick('PROV_2', 'PROV2')),
        CTO_PROV2: this.toNullableString(pick('CTO_PROV2', 'CTOPROV2')),
        PROV_3: this.toNullableString(pick('PROV_3', 'PROV3')),
        CTO_PROV3: this.toNullableString(pick('CTO_PROV3', 'CTOPROV3')),
        UN_COMP: this.toNullableString(pick('UN_COMP', 'UNCOMP'), 255),
        FACT_COMP: this.toNullableString(pick('FACT_COMP', 'FACTCOMP')),
        UN_VTA: this.toNullableString(pick('UN_VTA', 'UNVTA'), 255),
        FACT_VTA: this.toNullableString(pick('FACT_VTA', 'FACTVTA')),
        BASE: this.toNullableString(pick('BASE'), 255),
        SPH: this.toNullableString(pick('SPH')),
        CYL: this.toNullableString(pick('CYL')),
        ADIC: this.toNullableString(pick('ADIC')),
        DEPA: this.toNullableString(pick('DEPA')),
        SUBD: this.toNullableString(pick('SUBD')),
        CLAS: this.toNullableString(pick('CLAS')),
        SCLA: this.toNullableString(pick('SCLA')),
        SCLA2: this.toNullableString(pick('SCLA2')),
        UMUE: this.toNullableString(pick('UMUE')),
        UTRA: this.toNullableString(pick('UTRA')),
        UNIV: this.toNullableString(pick('UNIV')),
        UFRE: this.toNullableString(pick('UFRE')),
        BLOQ: this.toNullableString(pick('BLOQ')),
        MARCA: this.toNullableString(pick('MARCA'), 255),
        MODELO: this.toNullableString(pick('MODELO')),
      };

      const hasAnyValue = Object.entries(row).some(
        ([key, value]) => key !== 'BatchId' && key !== 'RowNum' && value != null,
      );
      if (hasAnyValue) rows.push(row);
    });

    return rows;
  }

  private async insertStagingRows(queryRunner: any, rows: StagingRow[]) {
    const columns = [
      'BatchId',
      'RowNum',
      'SUC',
      'TIPO',
      'ART',
      'UPC',
      'CLAVESAT',
      'UNIMEDSAT',
      'DES',
      'STOCK',
      'STOCK_MIN',
      'ESTATUS',
      'DIA_REABASTO',
      'PVTA',
      'CTOP',
      'PROV_1',
      'CTO_PROV1',
      'PROV_2',
      'CTO_PROV2',
      'PROV_3',
      'CTO_PROV3',
      'UN_COMP',
      'FACT_COMP',
      'UN_VTA',
      'FACT_VTA',
      'BASE',
      'SPH',
      'CYL',
      'ADIC',
      'DEPA',
      'SUBD',
      'CLAS',
      'SCLA',
      'SCLA2',
      'UMUE',
      'UTRA',
      'UNIV',
      'UFRE',
      'BLOQ',
      'MARCA',
      'MODELO',
    ] as const;

    const columnsSql = columns.map((col) => `[${col}]`).join(', ');
    const valueWidth = columns.length;
    const batchSize = 40;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const params: unknown[] = [];
      const valuesSql = batch
        .map((row, rowIdx) => {
          const base = rowIdx * valueWidth;
          params.push(
            row.BatchId,
            row.RowNum,
            row.SUC,
            row.TIPO,
            row.ART,
            row.UPC,
            row.CLAVESAT,
            row.UNIMEDSAT,
            row.DES,
            row.STOCK,
            row.STOCK_MIN,
            row.ESTATUS,
            row.DIA_REABASTO,
            row.PVTA,
            row.CTOP,
            row.PROV_1,
            row.CTO_PROV1,
            row.PROV_2,
            row.CTO_PROV2,
            row.PROV_3,
            row.CTO_PROV3,
            row.UN_COMP,
            row.FACT_COMP,
            row.UN_VTA,
            row.FACT_VTA,
            row.BASE,
            row.SPH,
            row.CYL,
            row.ADIC,
            row.DEPA,
            row.SUBD,
            row.CLAS,
            row.SCLA,
            row.SCLA2,
            row.UMUE,
            row.UTRA,
            row.UNIV,
            row.UFRE,
            row.BLOQ,
            row.MARCA,
            row.MODELO,
          );
          const placeholders = columns.map((_, colIdx) => `@${base + colIdx}`);
          return `(${placeholders.join(', ')})`;
        })
        .join(', ');

      await queryRunner.query(
        `INSERT INTO dbo.JA_NVO_ART_CON (${columnsSql}) VALUES ${valuesSql}`,
        params,
      );
    }
  }

  private toNullableString(value: unknown, maxLen?: number): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    return maxLen && text.length > maxLen ? text.slice(0, maxLen) : text;
  }
}
