import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Like, Repository } from 'typeorm';
import { Datmb51Entity } from './datmb51.entity';
import { CreateDatmb51Dto } from './dto/create-datmb51.dto';
import { UpdateDatmb51Dto } from './dto/update-datmb51.dto';
import { SearchDatMb51Dto } from './dto/search-datmb51.dto';

@Injectable()
export class Datmb51Service {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Datmb51Entity)
    private readonly repo: Repository<Datmb51Entity>,
  ) {}

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

    const sucs = Array.from(new Set(Array.from(pairSet.values()).map((p) => p.suc)));
    const arts = Array.from(new Set(Array.from(pairSet.values()).map((p) => p.art)));
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

  findAll(q?: { idpd?: string; user?: string; art?: string; almacen?: string; suc?: string }) {
    const where: any = {};
    if (q?.idpd) where.IDPD = Like(`%${q.idpd}%`);
    if (q?.user) where.USER = Like(`%${q.user}%`);
    if (q?.art) where.ART = Like(`%${q.art}%`);
    if (q?.almacen) where.ALMACEN = Like(`%${q.almacen}%`);
    if (q?.suc) where.SUC = Like(`%${q.suc}%`);

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { IDPD: 'ASC' },
    });
  }

  async findOne(idpd: string) {
    const row = await this.repo.findOne({ where: { IDPD: idpd } });
    if (!row) throw new NotFoundException(`DAT_MB51 ${idpd} no existe`);
    return row;
  }

  async create(dto: CreateDatmb51Dto) {
    const exists = await this.repo.exist({ where: { IDPD: dto.IDPD } });
    if (exists) throw new ConflictException(`IDPD ${dto.IDPD} ya existe`);

    const entity = this.repo.create({
      ...dto,
      USER: dto.USER ?? null,
      CLSM: dto.CLSM ?? null,
      DOCP: dto.DOCP ?? null,
      ART: dto.ART ?? null,
      CTDA: dto.CTDA ?? null,
      CTOT: dto.CTOT ?? null,
      FCND: dto.FCND ? new Date(dto.FCND) : null,
      FCNC: dto.FCNC ? new Date(dto.FCNC) : null,
      TXT: dto.TXT ?? null,
      ALMACEN: dto.ALMACEN ?? null,
      VTAESP: dto.VTAESP ?? null,
      SUC: dto.SUC ?? null,
    });

    return this.repo.save(entity);
  }

  async update(idpd: string, dto: UpdateDatmb51Dto) {
    const row = await this.findOne(idpd);

    const { IDPD, ...rest } = dto as any;
    const partial: Partial<Datmb51Entity> = {
      ...rest,
    };

    if (dto.FCND !== undefined) {
      partial.FCND = dto.FCND ? new Date(dto.FCND) : null;
    }

    if (dto.FCNC !== undefined) {
      partial.FCNC = dto.FCNC ? new Date(dto.FCNC) : null;
    }

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(idpd: string) {
    const row = await this.findOne(idpd);
    await this.repo.remove(row);
    return { deleted: true, IDPD: idpd };
  }

  async search(dto: SearchDatMb51Dto) {
    const fechaDocDesde = dto.fechaDocDesde ? new Date(dto.fechaDocDesde) : null;
    const fechaDocHasta = dto.fechaDocHasta ? new Date(dto.fechaDocHasta) : null;
    const fechaContDesde = dto.fechaContDesde ? new Date(dto.fechaContDesde) : null;
    const fechaContHasta = dto.fechaContHasta ? new Date(dto.fechaContHasta) : null;

    if (fechaDocHasta) fechaDocHasta.setHours(23, 59, 59, 999);
    if (fechaContHasta) fechaContHasta.setHours(23, 59, 59, 999);

    const wantsAll = dto.page == null && dto.limit == null;
    const rawPage = Number(dto.page ?? 1);
    const rawLimit = Number(dto.limit ?? 50);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50;
    const safeLimit = wantsAll ? null : limit;

    const normalizeStringList = (list?: string[]) => {
      const values = (list ?? [])
        .map(v => String(v ?? '').trim())
        .filter(v => v.length > 0);
      return values;
    };

    const normalizeNumList = (list?: number[]) => {
      const values = (list ?? []).filter(v => Number.isFinite(Number(v))).map(v => Number(v));
      return values;
    };

    const arts = normalizeStringList(dto.arts);
    const sucs = normalizeStringList(dto.sucs);
    const almacenes = normalizeStringList(dto.almacenes);
    const clsms = normalizeNumList(dto.clsms);

    const artsCsv = arts.length > 1 ? arts.join(',') : null;
    const sucsCsv = sucs.length > 1 ? sucs.join(',') : null;
    const almacenesCsv = almacenes.length > 1 ? almacenes.join(',') : null;
    const clsmsCsv = clsms.length > 1 ? clsms.join(',') : null;

    const artSingle = arts.length > 1 ? null : arts.length === 1 ? arts[0] : dto.art ?? null;
    const sucSingle = sucs.length > 1 ? null : sucs.length === 1 ? sucs[0] : dto.suc ?? null;
    const almacenSingle =
      almacenes.length > 1 ? null : almacenes.length === 1 ? almacenes[0] : dto.almacen ?? null;
    const clsmSingle = clsms.length > 1 ? null : clsms.length === 1 ? clsms[0] : dto.clsm ?? null;

    const paramsByName: Record<string, any> = {
      fecha_doc_desde: fechaDocDesde,
      fecha_doc_hasta: fechaDocHasta,
      fecha_cont_desde: fechaContDesde,
      fecha_cont_hasta: fechaContHasta,
      art: artSingle,
      docp: dto.docp ?? null,
      almacen: almacenSingle,
      suc: sucSingle,
      clsm: clsmSingle,
      vtaesp: dto.vtaesp ?? null,
      user: dto.user ?? null,
      txt: dto.txt ?? null,
      arts: artsCsv,
      almacenes: almacenesCsv,
      sucs: sucsCsv,
      clsms: clsmsCsv,
      page: wantsAll ? null : page,
      limit: safeLimit,
    };

    let paramCount = 0;
    let supportsTxt = false;
    let supportsPaging = false;
    let supportsLists = false;
    try {
      const paramRows = await this.dataSource.query(
        `
        SELECT name
        FROM sys.parameters
        WHERE object_id = OBJECT_ID('dbo.sp_dat_mb51_search')
        `,
      );
      const names = (paramRows ?? []).map((row: any) => String(row?.name ?? '').toLowerCase());
      paramCount = names.length;
      const nameSet = new Set(names);
      supportsTxt = nameSet.has('@txt');
      supportsPaging = nameSet.has('@page') && nameSet.has('@limit');
      supportsLists =
        nameSet.has('@arts') &&
        nameSet.has('@almacenes') &&
        nameSet.has('@sucs') &&
        nameSet.has('@clsms');
    } catch (_) {
      paramCount = 0;
      supportsTxt = false;
      supportsPaging = false;
      supportsLists = false;
    }
    const hasSp = paramCount > 0;
    const wantsListFilters = Boolean(artsCsv || almacenesCsv || sucsCsv || clsmsCsv);

    let rows: any[] = [];
    if (hasSp && (!wantsListFilters || supportsLists)) {
      const order = [
        'fecha_doc_desde',
        'fecha_doc_hasta',
        'fecha_cont_desde',
        'fecha_cont_hasta',
        'art',
        'docp',
        'almacen',
        'suc',
        'clsm',
        'vtaesp',
        'user',
      ];
      if (supportsTxt) order.push('txt');
      if (supportsLists) order.push('arts', 'almacenes', 'sucs', 'clsms');
      if (supportsPaging) order.push('page', 'limit');

      const params = order.map(name => paramsByName[name]);
      const assignments = order.map((name, idx) => `@${name}=@${idx}`).join(',\n          ');
      rows = await this.dataSource.query(
        `
        EXEC dbo.sp_dat_mb51_search
          ${assignments};
        `,
        params,
      );
    } else {
      rows = await this.dataSource.query(
        `
        SELECT
          M.IDPD,
          M.[USER],
          M.CLSM,
          M.DOCP,
          M.ART,
          A.DES AS DES,
          M.CTDA,
          M.CTOT,
          M.FCND,
          M.FCNC,
          M.TXT,
          M.ALMACEN,
          M.VTAESP,
          M.SUC,
          COUNT(1) OVER() AS TOTAL_COUNT
        FROM dbo.DAT_MB51 M
        LEFT JOIN (
          SELECT SUC, ART, MAX(DES) AS DES
          FROM dbo.DAT_ART
          GROUP BY SUC, ART
        ) A ON A.SUC = M.SUC AND A.ART = M.ART
        WHERE (@0 IS NULL OR M.FCND >= @0)
          AND (@1 IS NULL OR M.FCND <= @1)
          AND (@2 IS NULL OR M.FCNC >= @2)
          AND (@3 IS NULL OR M.FCNC <= @3)
          AND (@4 IS NULL OR M.ART LIKE '%' + @4 + '%')
          AND (@5 IS NULL OR M.DOCP LIKE '%' + @5 + '%')
          AND (
            @6 IS NULL OR M.ALMACEN = @6
          )
          AND (
            @7 IS NULL OR M.SUC = @7
          )
          AND (
            @8 IS NULL OR M.CLSM = @8
          )
          AND (@9 IS NULL OR M.VTAESP = @9)
          AND (@10 IS NULL OR M.[USER] LIKE '%' + @10 + '%')
          AND (@11 IS NULL OR M.TXT LIKE '%' + @11 + '%')
          AND (
            @12 IS NULL OR EXISTS (
              SELECT 1 FROM string_split(@12, ',') s
              WHERE LTRIM(RTRIM(s.value)) = M.ART
            )
          )
          AND (
            @13 IS NULL OR EXISTS (
              SELECT 1 FROM string_split(@13, ',') s
              WHERE LTRIM(RTRIM(s.value)) = M.ALMACEN
            )
          )
          AND (
            @14 IS NULL OR EXISTS (
              SELECT 1 FROM string_split(@14, ',') s
              WHERE LTRIM(RTRIM(s.value)) = M.SUC
            )
          )
          AND (
            @15 IS NULL OR EXISTS (
              SELECT 1 FROM string_split(@15, ',') s
              WHERE TRY_CAST(LTRIM(RTRIM(s.value)) AS FLOAT) = M.CLSM
            )
          )
        ORDER BY M.FCND DESC
        OFFSET CASE WHEN @16 IS NULL OR @17 IS NULL OR @16 < 1 OR @17 < 1 THEN 0 ELSE (@16 - 1) * @17 END ROWS
        FETCH NEXT CASE WHEN @17 IS NULL OR @17 < 1 THEN 2147483647 ELSE @17 END ROWS ONLY
        `,
        [
          paramsByName.fecha_doc_desde,
          paramsByName.fecha_doc_hasta,
          paramsByName.fecha_cont_desde,
          paramsByName.fecha_cont_hasta,
          paramsByName.art,
          paramsByName.docp,
          paramsByName.almacen,
          paramsByName.suc,
          paramsByName.clsm,
          paramsByName.vtaesp,
          paramsByName.user,
          paramsByName.txt,
          paramsByName.arts,
          paramsByName.almacenes,
          paramsByName.sucs,
          paramsByName.clsms,
          paramsByName.page,
          paramsByName.limit,
        ],
      );
    }

    rows = await this.appendDescripcion(rows);
    const totalFromRow = rows?.[0]?.TOTAL_COUNT ?? rows?.[0]?.total_count ?? rows?.[0]?.Total_Count;
    let items = (rows ?? []).map(row => {
      if (row && Object.prototype.hasOwnProperty.call(row, 'TOTAL_COUNT')) {
        const { TOTAL_COUNT, ...rest } = row;
        return rest;
      }
      if (row && Object.prototype.hasOwnProperty.call(row, 'total_count')) {
        const { total_count, ...rest } = row;
        return rest;
      }
      if (row && Object.prototype.hasOwnProperty.call(row, 'Total_Count')) {
        const { Total_Count, ...rest } = row;
        return rest;
      }
      return row;
    });

    let total = Number.isFinite(Number(totalFromRow)) ? Number(totalFromRow) : rows.length;
    if (!wantsAll && hasSp && !supportsPaging) {
      total = items.length;
      const start = (page - 1) * limit;
      items = items.slice(start, start + limit);
    }

    const effectiveLimit = safeLimit ?? items.length;
    const effectivePage = wantsAll ? 1 : page;
    return { items, total, page: effectivePage, limit: effectiveLimit };
  }
}
