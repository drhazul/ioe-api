import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  FindManyOptions,
  Like,
  Not,
  QueryFailedError,
  QueryRunner,
  Repository,
} from 'typeorm';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { DatArtEntity } from './datart.entity';
import { CreateDatArtDto } from './dto/create-datart.dto';
import { UpdateDatArtDto } from './dto/update-datart.dto';
import type { JwtPayload } from '../auth/jwt.strategy';

type DatArtStageRow = {
  RENGLON: number;
  SUC: string | null;
  TIPO: string | null;
  ART: string | null;
  UPC: string | null;
  CLAVESAT: number | null;
  UNIMEDSAT: string | null;
  DES: string | null;
  STOCK: number | null;
  STOCK_MIN: number | null;
  ESTATUS: string | null;
  DIA_REABASTO: number | null;
  PVTA: number | null;
  CTOP: number | null;
  PROV_1: number | null;
  CTO_PROV1: number | null;
  PROV_2: number | null;
  CTO_PROV2: number | null;
  PROV_3: number | null;
  CTO_PROV3: number | null;
  UN_COMP: string | null;
  FACT_COMP: number | null;
  UN_VTA: string | null;
  FACT_VTA: number | null;
  BASE: string | null;
  SPH: number | null;
  CYL: number | null;
  ADIC: number | null;
  DEPA: number | null;
  SUBD: number | null;
  CLAS: number | null;
  SCLA: number | null;
  SCLA2: number | null;
  UMUE: number | null;
  UTRA: number | null;
  UNIV: number | null;
  UFRE: number | null;
  BLOQ: number | null;
  MARCA: string | null;
  MODELO: string | null;
};

type DatArtMassiveIssue = {
  renglon: number;
  suc: string | null;
  art: string | null;
  upc: string | null;
  mensaje: string | null;
};

type DatArtMassiveUploadResult = {
  loteId: string;
  totalCargados: number;
  procesados: number;
  invalidosUk: number;
  noExistenCatalogo: number;
  duplicados: number;
  invalidos: DatArtMassiveIssue[];
  noExistentes: DatArtMassiveIssue[];
};

@Injectable()
export class DatArtService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DatArtEntity)
    private readonly repo: Repository<DatArtEntity>,
  ) {}

  async findAll(query?: {
    suc?: string;
    sucExact?: string;
    art?: string;
    upc?: string;
    des?: string;
    tipo?: string;
    modelo?: string;
    depa?: string;
    subd?: string;
    clas?: string;
    scla?: string;
    scla2?: string;
    sph?: string;
    cyl?: string;
    adic?: string;
    page?: string;
    limit?: string;
    withTotal?: string;
    view?: string;
    loteId?: string;
    bloqNe?: string;
  }) {
    const buildLikePattern = (value: string | undefined, maxLen: number) => {
      const trimmed = value?.trim();
      if (!trimmed) return undefined;
      const normalized =
        trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
      if (normalized.length + 2 <= maxLen) return `%${normalized}%`;
      if (normalized.length + 1 <= maxLen) return `${normalized}%`;
      return normalized;
    };
    const buildLike = (value: string | undefined, maxLen: number) => {
      const pattern = buildLikePattern(value, maxLen);
      return pattern ? Like(pattern) : undefined;
    };
    const parseNumber = (value?: string) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const normalized = trimmed.replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : undefined;
    };
    const parseBoolean = (value?: string) => {
      if (!value) return false;
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    };
    const sucExact = parseBoolean(query?.sucExact);
    const sucNormalized = query?.suc?.trim().toUpperCase();
    const where: any = {};
    if (sucNormalized) {
      where.SUC = sucExact ? sucNormalized : buildLike(sucNormalized, 5);
    }
    if (query?.art) where.ART = buildLike(query.art, 10);
    if (query?.upc) where.UPC = buildLike(query.upc, 15);
    if (query?.des) where.DES = buildLike(query.des, 255);
    if (query?.tipo) where.TIPO = buildLike(query.tipo, 255);
    if (query?.modelo) where.MODELO = buildLike(query.modelo, 255);
    const depa = parseNumber(query?.depa);
    if (depa !== undefined) where.DEPA = depa;
    const subd = parseNumber(query?.subd);
    if (subd !== undefined) where.SUBD = subd;
    const clas = parseNumber(query?.clas);
    if (clas !== undefined) where.CLAS = clas;
    const scla = parseNumber(query?.scla);
    if (scla !== undefined) where.SCLA = scla;
    const scla2 = parseNumber(query?.scla2);
    if (scla2 !== undefined) where.SCLA2 = scla2;
    const sph = parseNumber(query?.sph);
    if (sph !== undefined) where.SPH = sph;
    const cyl = parseNumber(query?.cyl);
    if (cyl !== undefined) where.CYL = cyl;
    const adic = parseNumber(query?.adic);
    if (adic !== undefined) where.ADIC = adic;
    const bloqNe = parseNumber(query?.bloqNe);
    if (bloqNe !== undefined) where.BLOQ = Not(bloqNe);

    const parseIntParam = (value?: string) => {
      if (value == null) return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const num = Number(trimmed);
      if (!Number.isFinite(num)) return undefined;
      return Math.floor(num);
    };
    const rawLimit = parseIntParam(query?.limit);
    const rawPage = parseIntParam(query?.page);
    const withTotal =
      query?.withTotal?.toString().trim().toLowerCase() === '1' ||
      query?.withTotal?.toString().trim().toLowerCase() === 'true';
    const hasPaging =
      rawLimit !== undefined || rawPage !== undefined || withTotal;
    const limit = hasPaging
      ? Math.min(Math.max(rawLimit ?? 200, 1), 500)
      : undefined;
    const page = hasPaging ? Math.max(rawPage ?? 1, 1) : undefined;
    const skip = hasPaging ? (page! - 1) * limit! : undefined;

    const view = (query?.view ?? '').toString().trim().toLowerCase();
    const loteId = (query?.loteId ?? '').toString().trim();
    const select: (keyof DatArtEntity)[] | undefined =
      view === 'lite'
        ? [
            'SUC',
            'ART',
            'UPC',
            'DES',
            'TIPO',
            'STOCK',
            'STOCK_MIN',
            'PVTA',
            'CTOP',
            'ESTATUS',
          ]
        : undefined;

    if (loteId) {
      const qb = this.repo
        .createQueryBuilder('art')
        .where(
          `
            EXISTS (
              SELECT 1
              FROM dbo.DAT_ART_MASIVA_TMP tmp
              WHERE tmp.SUC = art.SUC
                AND tmp.ART = art.ART
                AND tmp.UPC = art.UPC
                AND tmp.LOTE_ID = :loteId
                AND tmp.ESTADO = :tmpEstado
            )
          `,
          {
            loteId,
            tmpEstado: 'PROCESADO',
          },
        )
        .orderBy('art.SUC', 'ASC')
        .addOrderBy('art.ART', 'ASC')
        .addOrderBy('art.UPC', 'ASC');

      if (sucNormalized && sucExact) {
        qb.andWhere('art.SUC = :sucExact', { sucExact: sucNormalized });
      } else {
        const sucPattern = buildLikePattern(query?.suc, 5);
        if (sucPattern) qb.andWhere('art.SUC LIKE :sucPattern', { sucPattern });
      }
      const artPattern = buildLikePattern(query?.art, 10);
      if (artPattern) qb.andWhere('art.ART LIKE :artPattern', { artPattern });
      const upcPattern = buildLikePattern(query?.upc, 15);
      if (upcPattern) qb.andWhere('art.UPC LIKE :upcPattern', { upcPattern });
      const desPattern = buildLikePattern(query?.des, 255);
      if (desPattern) qb.andWhere('art.DES LIKE :desPattern', { desPattern });
      const tipoPattern = buildLikePattern(query?.tipo, 255);
      if (tipoPattern)
        qb.andWhere('art.TIPO LIKE :tipoPattern', { tipoPattern });
      const modeloPattern = buildLikePattern(query?.modelo, 255);
      if (modeloPattern)
        qb.andWhere('art.MODELO LIKE :modeloPattern', { modeloPattern });

      if (depa !== undefined) qb.andWhere('art.DEPA = :depa', { depa });
      if (subd !== undefined) qb.andWhere('art.SUBD = :subd', { subd });
      if (clas !== undefined) qb.andWhere('art.CLAS = :clas', { clas });
      if (scla !== undefined) qb.andWhere('art.SCLA = :scla', { scla });
      if (scla2 !== undefined) qb.andWhere('art.SCLA2 = :scla2', { scla2 });
      if (sph !== undefined) qb.andWhere('art.SPH = :sph', { sph });
      if (cyl !== undefined) qb.andWhere('art.CYL = :cyl', { cyl });
      if (adic !== undefined) qb.andWhere('art.ADIC = :adic', { adic });
      if (bloqNe !== undefined) {
        qb.andWhere('art.BLOQ <> :bloqNe', { bloqNe });
      }

      if (select) {
        qb.select(select.map((column) => `art.${column}`));
      }
      if (limit !== undefined) qb.take(limit);
      if (skip !== undefined) qb.skip(skip);

      if (withTotal) {
        const [items, total] = await qb.getManyAndCount();
        return {
          items,
          total,
          page: page ?? 1,
          limit: limit ?? items.length,
        };
      }

      return qb.getMany();
    }

    const findOptions: FindManyOptions<DatArtEntity> = {
      where: Object.keys(where).length ? where : undefined,
      order: { SUC: 'ASC', ART: 'ASC', UPC: 'ASC' },
      take: limit,
      skip,
      select,
    };

    if (withTotal) {
      const [items, total] = await this.repo.findAndCount(findOptions);
      return {
        items,
        total,
        page: page ?? 1,
        limit: limit ?? items.length,
      };
    }

    return this.repo.find(findOptions);
  }

  async findOne(suc: string, art: string, upc: string) {
    const row = await this.repo.findOne({
      where: { SUC: suc, ART: art, UPC: upc },
    });
    if (!row)
      throw new NotFoundException(`DAT_ART ${suc}-${art}-${upc} no existe`);
    return row;
  }

  async massiveUpload(
    file: any,
    user: JwtPayload,
  ): Promise<DatArtMassiveUploadResult> {
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
      throw new BadRequestException(
        'El archivo no contiene renglones con datos',
      );
    }

    const loteId = randomUUID();
    const usuario = (user?.username ?? '').trim() || String(user?.sub ?? '');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.insertMassiveRows(queryRunner, loteId, usuario, rows);
      await queryRunner.query(
        'EXEC dbo.sp_datart_massive_apply @LOTE_ID = @0, @USUARIO = @1',
        [loteId, usuario],
      );
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const totalsRows = await this.dataSource.query(
      `
      SELECT
        SUM(CASE WHEN ESTADO = 'PROCESADO' THEN 1 ELSE 0 END) AS PROCESADOS,
        SUM(CASE WHEN ESTADO = 'INVALIDO_UK' THEN 1 ELSE 0 END) AS INVALIDOS_UK,
        SUM(CASE WHEN ESTADO = 'NO_EXISTE' THEN 1 ELSE 0 END) AS NO_EXISTE,
        SUM(CASE WHEN ESTADO = 'DUPLICADO' THEN 1 ELSE 0 END) AS DUPLICADOS
      FROM dbo.DAT_ART_MASIVA_TMP
      WHERE LOTE_ID = @0
      `,
      [loteId],
    );
    const totals = (totalsRows?.[0] ?? {}) as Record<string, unknown>;
    const procesados = this.safeInt(totals.PROCESADOS);
    const invalidosUk = this.safeInt(totals.INVALIDOS_UK);
    const noExiste = this.safeInt(totals.NO_EXISTE);
    const duplicados = this.safeInt(totals.DUPLICADOS);

    const invalidRows = await this.dataSource.query(
      `
      SELECT TOP (200)
        RENGLON, SUC, ART, UPC, ERROR_DETALLE
      FROM dbo.DAT_ART_MASIVA_TMP
      WHERE LOTE_ID = @0 AND ESTADO = 'INVALIDO_UK'
      ORDER BY RENGLON ASC, ID ASC
      `,
      [loteId],
    );
    const notFoundRows = await this.dataSource.query(
      `
      SELECT TOP (200)
        RENGLON, SUC, ART, UPC, ERROR_DETALLE
      FROM dbo.DAT_ART_MASIVA_TMP
      WHERE LOTE_ID = @0 AND ESTADO = 'NO_EXISTE'
      ORDER BY RENGLON ASC, ID ASC
      `,
      [loteId],
    );

    return {
      loteId,
      totalCargados: rows.length,
      procesados,
      invalidosUk,
      noExistenCatalogo: noExiste,
      duplicados,
      invalidos: this.mapIssues(invalidRows),
      noExistentes: this.mapIssues(notFoundRows),
    };
  }

  private mapIssues(rows: unknown[]): DatArtMassiveIssue[] {
    return (rows ?? []).map((row: any) => ({
      renglon: this.safeInt(row?.RENGLON),
      suc: this.toNullableString(row?.SUC, 5),
      art: this.toNullableString(row?.ART, 10),
      upc: this.toNullableString(row?.UPC, 15),
      mensaje: this.toNullableString(row?.ERROR_DETALLE, 500),
    }));
  }

  private async insertMassiveRows(
    queryRunner: QueryRunner,
    loteId: string,
    usuario: string,
    rows: DatArtStageRow[],
  ) {
    const columns = [
      'LOTE_ID',
      'RENGLON',
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
      'USUARIO_CARGA',
    ] as const;

    const columnsSql = columns.map((col) => `[${col}]`).join(', ');
    const valueWidth = columns.length;
    const batchSize = 30;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const params: unknown[] = [];
      const valuesSql = batch
        .map((row, rowIdx) => {
          const base = rowIdx * valueWidth;
          params.push(
            loteId,
            row.RENGLON,
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
            usuario,
          );
          const placeholders = columns.map((_, colIdx) => `@${base + colIdx}`);
          return `(${placeholders.join(', ')})`;
        })
        .join(', ');

      await queryRunner.query(
        `INSERT INTO dbo.DAT_ART_MASIVA_TMP (${columnsSql}) VALUES ${valuesSql}`,
        params,
      );
    }
  }

  private parseExcelRows(buffer: Buffer): DatArtStageRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: false,
        raw: true,
      });
    } catch (_err) {
      throw new BadRequestException('No se pudo leer el archivo Excel');
    }

    const firstSheet = workbook.SheetNames?.[0];
    if (!firstSheet) {
      throw new BadRequestException('El archivo Excel no contiene hojas');
    }

    const worksheet = workbook.Sheets[firstSheet];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      worksheet,
      {
        defval: null,
        raw: true,
        blankrows: false,
      },
    );
    if (!jsonRows.length) {
      return [];
    }

    const normalizeKey = (key: string) =>
      key
        .toUpperCase()
        .replace(/[\s\-]+/g, '')
        .replace(/[^A-Z0-9_]/g, '');
    const firstKeys = new Set(
      Object.keys(jsonRows[0]).map((k) => normalizeKey(k)),
    );
    if (
      !firstKeys.has('SUC') ||
      !firstKeys.has('ART') ||
      !firstKeys.has('UPC')
    ) {
      throw new BadRequestException(
        'El Excel debe incluir columnas SUC, ART y UPC',
      );
    }

    const rows: DatArtStageRow[] = [];
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

      const stageRow: DatArtStageRow = {
        RENGLON: index + 2,
        SUC: this.toNullableString(pick('SUC'), 5),
        TIPO: this.toNullableString(pick('TIPO'), 255),
        ART: this.toNullableString(pick('ART'), 10),
        UPC: this.toNullableString(pick('UPC'), 15),
        CLAVESAT: this.toNullableNumber(pick('CLAVESAT')),
        UNIMEDSAT: this.toNullableString(pick('UNIMEDSAT'), 255),
        DES: this.toNullableString(pick('DES'), 255),
        STOCK: this.toNullableNumber(pick('STOCK')),
        STOCK_MIN: this.toNullableNumber(pick('STOCK_MIN', 'STOCKMIN')),
        ESTATUS: this.toNullableString(pick('ESTATUS'), 255),
        DIA_REABASTO: this.toNullableNumber(
          pick('DIA_REABASTO', 'DIAREABASTO'),
        ),
        PVTA: this.toNullableNumber(pick('PVTA')),
        CTOP: this.toNullableNumber(pick('CTOP')),
        PROV_1: this.toNullableNumber(pick('PROV_1', 'PROV1')),
        CTO_PROV1: this.toNullableNumber(pick('CTO_PROV1', 'CTOPROV1')),
        PROV_2: this.toNullableNumber(pick('PROV_2', 'PROV2')),
        CTO_PROV2: this.toNullableNumber(pick('CTO_PROV2', 'CTOPROV2')),
        PROV_3: this.toNullableNumber(pick('PROV_3', 'PROV3')),
        CTO_PROV3: this.toNullableNumber(pick('CTO_PROV3', 'CTOPROV3')),
        UN_COMP: this.toNullableString(pick('UN_COMP', 'UNCOMP'), 255),
        FACT_COMP: this.toNullableNumber(pick('FACT_COMP', 'FACTCOMP')),
        UN_VTA: this.toNullableString(pick('UN_VTA', 'UNVTA'), 255),
        FACT_VTA: this.toNullableNumber(pick('FACT_VTA', 'FACTVTA')),
        BASE: this.toNullableString(pick('BASE'), 255),
        SPH: this.toNullableNumber(pick('SPH')),
        CYL: this.toNullableNumber(pick('CYL')),
        ADIC: this.toNullableNumber(pick('ADIC')),
        DEPA: this.toNullableNumber(pick('DEPA')),
        SUBD: this.toNullableNumber(pick('SUBD')),
        CLAS: this.toNullableNumber(pick('CLAS')),
        SCLA: this.toNullableNumber(pick('SCLA')),
        SCLA2: this.toNullableNumber(pick('SCLA2')),
        UMUE: this.toNullableNumber(pick('UMUE')),
        UTRA: this.toNullableNumber(pick('UTRA')),
        UNIV: this.toNullableNumber(pick('UNIV')),
        UFRE: this.toNullableNumber(pick('UFRE')),
        BLOQ: this.toNullableInt(pick('BLOQ')),
        MARCA: this.toNullableString(pick('MARCA'), 255),
        MODELO: this.toNullableString(pick('MODELO')),
      };

      const hasAnyValue = Object.entries(stageRow).some(
        ([key, value]) => key !== 'RENGLON' && value != null,
      );
      if (hasAnyValue) {
        rows.push(stageRow);
      }
    });

    return rows;
  }

  private toNullableString(value: unknown, maxLen?: number): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    return maxLen && text.length > maxLen ? text.slice(0, maxLen) : text;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const raw = String(value).trim();
    if (!raw) return null;

    let normalized = raw.replace(/\$/g, '').replace(/\s+/g, '');
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    if (hasComma && hasDot) {
      if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = normalized.replace(/,/g, '');
      }
    } else if (hasComma) {
      normalized = normalized.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNullableInt(value: unknown): number | null {
    const num = this.toNullableNumber(value);
    if (num == null) return null;
    return Math.trunc(num);
  }

  private safeInt(value: unknown): number {
    if (value == null) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }

  async create(dto: CreateDatArtDto) {
    const exists = await this.repo.exist({
      where: { SUC: dto.SUC, ART: dto.ART, UPC: dto.UPC },
    });
    if (exists) {
      throw new ConflictException(
        `DAT_ART ${dto.SUC}-${dto.ART}-${dto.UPC} ya existe`,
      );
    }

    const entity = this.repo.create({
      ...dto,
      TIPO: dto.TIPO ?? null,
      CLAVESAT: dto.CLAVESAT ?? null,
      UNIMEDSAT: dto.UNIMEDSAT ?? null,
      DES: dto.DES ?? null,
      STOCK: dto.STOCK ?? null,
      STOCK_MIN: dto.STOCK_MIN ?? null,
      ESTATUS: dto.ESTATUS ?? null,
      DIA_REABASTO: dto.DIA_REABASTO ?? null,
      PVTA: dto.PVTA ?? null,
      CTOP: dto.CTOP ?? null,
      PROV_1: dto.PROV_1 ?? null,
      CTO_PROV1: dto.CTO_PROV1 ?? null,
      PROV_2: dto.PROV_2 ?? null,
      CTO_PROV2: dto.CTO_PROV2 ?? null,
      PROV_3: dto.PROV_3 ?? null,
      CTO_PROV3: dto.CTO_PROV3 ?? null,
      UN_COMP: dto.UN_COMP ?? null,
      FACT_COMP: dto.FACT_COMP ?? null,
      UN_VTA: dto.UN_VTA ?? null,
      FACT_VTA: dto.FACT_VTA ?? null,
      BASE: dto.BASE ?? null,
      SPH: dto.SPH ?? null,
      CYL: dto.CYL ?? null,
      ADIC: dto.ADIC ?? null,
      DEPA: dto.DEPA ?? null,
      SUBD: dto.SUBD ?? null,
      CLAS: dto.CLAS ?? null,
      SCLA: dto.SCLA ?? null,
      SCLA2: dto.SCLA2 ?? null,
      UMUE: dto.UMUE ?? null,
      UTRA: dto.UTRA ?? null,
      UNIV: dto.UNIV ?? null,
      UFRE: dto.UFRE ?? null,
      BLOQ: dto.BLOQ ?? null,
      MARCA: dto.MARCA ?? null,
      MODELO: dto.MODELO ?? null,
      SELJA: dto.SELJA ?? null,
      SELOP: dto.SELOP ?? null,
      MODF: dto.MODF ?? null,
    });

    return this.repo.save(entity);
  }

  async update(suc: string, art: string, upc: string, dto: UpdateDatArtDto) {
    const row = await this.findOne(suc, art, upc);
    const { SUC, ART, UPC, ...rest } = dto as any;
    const updated = this.repo.merge(row, rest);
    return this.repo.save(updated);
  }

  async remove(suc: string, art: string, upc: string) {
    const row = await this.findOne(suc, art, upc);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar el articulo ${suc}-${art}-${upc} porque esta referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, SUC: suc, ART: art, UPC: upc };
  }
}
