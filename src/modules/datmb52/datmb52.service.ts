import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchDatMb52Dto } from './dto/search-datmb52.dto';

@Injectable()
export class Datmb52Service {
  constructor(private readonly dataSource: DataSource) {}

  private async appendDescripcion(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    const needsDes = rows.some(
      (row) =>
        row &&
        !Object.prototype.hasOwnProperty.call(row, 'DES') &&
        !Object.prototype.hasOwnProperty.call(row, 'des'),
    );
    if (!needsDes) return rows;

    const pairSet = new Map<string, { suc: string; art: string }>();
    for (const row of rows) {
      const suc = String(row?.SUC ?? row?.suc ?? '').trim();
      const art = String(row?.ART ?? row?.art ?? '').trim();
      if (!suc || !art) continue;
      const key = `${suc}||${art}`;
      if (!pairSet.has(key)) pairSet.set(key, { suc, art });
    }
    if (pairSet.size === 0) return rows;

    const sucs = Array.from(
      new Set(Array.from(pairSet.values()).map((p) => p.suc)),
    );
    const arts = Array.from(
      new Set(Array.from(pairSet.values()).map((p) => p.art)),
    );
    const desRows = await this.dataSource.query(
      `
      SELECT SUC, ART, MAX(DES) AS DES
      FROM dbo.DAT_ART
      WHERE SUC IN (SELECT LTRIM(RTRIM(value)) FROM string_split(@0, ','))
        AND ART IN (SELECT LTRIM(RTRIM(value)) FROM string_split(@1, ','))
      GROUP BY SUC, ART
      `,
      [sucs.join(','), arts.join(',')],
    );

    const desMap = new Map<string, string>();
    for (const row of desRows ?? []) {
      const suc = String(row?.SUC ?? '').trim();
      const art = String(row?.ART ?? '').trim();
      if (!suc || !art) continue;
      const des = String(row?.DES ?? '').trim();
      if (des) desMap.set(`${suc}||${art}`, des);
    }

    return rows.map((row) => {
      const hasDes =
        Object.prototype.hasOwnProperty.call(row, 'DES') ||
        Object.prototype.hasOwnProperty.call(row, 'des');
      if (hasDes) return row;
      const suc = String(row?.SUC ?? row?.suc ?? '').trim();
      const art = String(row?.ART ?? row?.art ?? '').trim();
      const key = `${suc}||${art}`;
      const des = desMap.get(key);
      if (!des) return row;
      return { ...row, DES: des };
    });
  }

  async resumen(dto: SearchDatMb52Dto) {
    const normalizeList = (list?: string[]) =>
      (list ?? [])
        .map((v) => String(v ?? '').trim())
        .filter((v) => v.length > 0);

    const sucs = normalizeList(dto.sucs);
    const almacenes = normalizeList(dto.almacenes);
    const arts = normalizeList(dto.arts);

    const sucsCsv = sucs.length ? sucs.join(',') : null;
    const almacenesCsv = almacenes.length ? almacenes.join(',') : null;
    const artsCsv = arts.length ? arts.join(',') : null;

    let hasSp = false;
    try {
      const spRows = await this.dataSource.query(
        `
        SELECT 1
        FROM sys.objects
        WHERE object_id = OBJECT_ID('dbo.sp_dat_mb52_resumen')
          AND type IN ('P', 'PC')
        `,
      );
      hasSp = Array.isArray(spRows) && spRows.length > 0;
    } catch (_) {
      hasSp = false;
    }

    if (hasSp) {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_dat_mb52_resumen
          @sucs=@0,
          @almacenes=@1,
          @arts=@2;
        `,
        [sucsCsv, almacenesCsv, artsCsv],
      );
      return this.appendDescripcion(rows);
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        M.SUC,
        M.ART,
        MAX(A.DES) AS DES,
        M.ALMACEN,
        SUM(ISNULL(M.CTDA, 0)) AS STOCK_TOTAL_CTDA,
        SUM(ISNULL(M.CTOT, 0)) AS COSTO_TOTAL_CTOT
      FROM dbo.DAT_MB51 M
      LEFT JOIN (
        SELECT SUC, ART, MAX(DES) AS DES
        FROM dbo.DAT_ART
        GROUP BY SUC, ART
      ) A ON A.SUC = M.SUC AND A.ART = M.ART
      WHERE (
          @0 IS NULL OR EXISTS (
            SELECT 1
            FROM string_split(@0, ',') s
            WHERE LTRIM(RTRIM(s.value)) = M.SUC
          )
        )
        AND (
          @1 IS NULL OR EXISTS (
            SELECT 1
            FROM string_split(@1, ',') s
            WHERE LTRIM(RTRIM(s.value)) = M.ALMACEN
          )
        )
        AND (
          @2 IS NULL OR EXISTS (
            SELECT 1
            FROM string_split(@2, ',') s
            WHERE LTRIM(RTRIM(s.value)) = M.ART
          )
        )
      GROUP BY M.SUC, M.ART, M.ALMACEN
      ORDER BY M.SUC ASC, M.ART ASC, M.ALMACEN ASC;
      `,
      [sucsCsv, almacenesCsv, artsCsv],
    );
    return this.appendDescripcion(rows);
  }
}
