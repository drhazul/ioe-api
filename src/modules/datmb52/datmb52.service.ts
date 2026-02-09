import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchDatMb52Dto } from './dto/search-datmb52.dto';

@Injectable()
export class Datmb52Service {
  constructor(private readonly dataSource: DataSource) {}

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
      return this.dataSource.query(
        `
        EXEC dbo.sp_dat_mb52_resumen
          @sucs=@0,
          @almacenes=@1,
          @arts=@2;
        `,
        [sucsCsv, almacenesCsv, artsCsv],
      );
    }

    return this.dataSource.query(
      `
      SELECT
        SUC,
        ART,
        ALMACEN,
        SUM(ISNULL(CTDA, 0)) AS STOCK_TOTAL_CTDA,
        SUM(ISNULL(CTOT, 0)) AS COSTO_TOTAL_CTOT
      FROM dbo.DAT_MB51
      WHERE (
          @0 IS NULL OR EXISTS (
            SELECT 1
            FROM string_split(@0, ',') s
            WHERE LTRIM(RTRIM(s.value)) = SUC
          )
        )
        AND (
          @1 IS NULL OR EXISTS (
            SELECT 1
            FROM string_split(@1, ',') s
            WHERE LTRIM(RTRIM(s.value)) = ALMACEN
          )
        )
        AND (
          @2 IS NULL OR EXISTS (
            SELECT 1
            FROM string_split(@2, ',') s
            WHERE LTRIM(RTRIM(s.value)) = ART
          )
        )
      GROUP BY SUC, ART, ALMACEN
      ORDER BY SUC ASC, ART ASC, ALMACEN ASC;
      `,
      [sucsCsv, almacenesCsv, artsCsv],
    );
  }
}
