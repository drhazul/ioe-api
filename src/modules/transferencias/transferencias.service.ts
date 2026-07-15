import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AddTransferenciaEvidenceDto } from './dto/add-transferencia-evidence.dto';
import { AddTransferenciaDetailDto } from './dto/add-transferencia-detail.dto';
import { BulkAddTransferenciaDetailDto } from './dto/bulk-add-transferencia-detail.dto';
import { CreateTransferenciaDto } from './dto/create-transferencia.dto';
import { TransferenciaActionDto } from './dto/transferencia-action.dto';
import { TransferenciaArticulosQueryDto } from './dto/transferencia-articulos-query.dto';
import { TransferenciaQueryDto } from './dto/transferencia-query.dto';
import { UpdateTransferenciaDetailDto } from './dto/update-transferencia-detail.dto';
import { UpdateTransferenciaDto } from './dto/update-transferencia.dto';

type UserContext = {
  userId: number;
  username: string;
  suc: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  isAdmin: boolean;
};

@Injectable()
export class TransferenciasService {
  private static readonly MODULE_CODES = ['DAT_JAA_TRAN'];
  private static readonly INVENTORY_ROLE_CODES = new Set([
    'INVJEF',
    'ANALISTA_INV',
    'JEFE_INVENTARIOS',
    'ANALISTA_INVENTARIOS',
  ]);
  private static readonly STATUS_LIMITS_BY_ROLE = new Map<string, string[]>([
    ['INVJEF', ['PENDIENTE']],
    ['AUX', ['BORRADOR', 'LIBERADA', 'PREPARACION', 'TRANSITO', 'REVISANDO']],
    [
      'ENC_SUCURSAL',
      ['BORRADOR', 'LIBERADA', 'PREPARACION', 'TRANSITO', 'REVISANDO'],
    ],
  ]);
  private static readonly DAT_ART_SUC_ALIASES = new Map<string, string>([
    ['DF02', 'DF01'],
  ]);

  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: TransferenciaQueryDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const { page, limit, skip } = this.normalizePagination(
      query.page,
      query.limit,
    );
    const where: string[] = [];
    const params: unknown[] = [];

    if (!ctx.isAdmin) {
      const sucs = await this.resolveAuthorizedSucs(ctx);
      const placeholders = sucs.map((_, i) => `@${params.length + i}`);
      where.push(
        `(
          (
            UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) IN ('BORRADOR', 'TRANSITO', 'REVISANDO')
            AND UPPER(LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT)))) IN (${placeholders.join(', ')})
          )
          OR
          (
            UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) NOT IN ('BORRADOR', 'TRANSITO', 'REVISANDO')
            AND (
              UPPER(LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT)))) IN (${placeholders.join(', ')})
              OR UPPER(LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL)))) IN (${placeholders.join(', ')})
            )
          )
        )`,
      );
      params.push(...sucs);
    } else if (this.normalizeText(query.suc)) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT)))) = @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL)))) = @${params.length})`,
      );
      params.push(this.normalizeText(query.suc).toUpperCase());
    }

    const search = this.normalizeText(query.search);
    if (search) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(h.DOC, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(h.USR, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(h.TXT, '')))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }

    const doc = this.normalizeText(query.doc);
    if (doc) {
      where.push(`LTRIM(RTRIM(ISNULL(h.DOC, ''))) LIKE @${params.length}`);
      params.push(`%${doc}%`);
    }

    const usuario = this.normalizeText(query.usuario);
    if (usuario) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(h.USR, '')))) LIKE @${params.length}`,
      );
      params.push(`%${usuario.toUpperCase()}%`);
    }

    const statusLimit = this.resolveStatusLimit(ctx);
    const estatus = this.normalizeText(query.estatus).toUpperCase();
    if (statusLimit.length) {
      if (estatus) {
        if (!statusLimit.includes(estatus)) {
          where.push('1 = 0');
        } else {
          where.push(
            `UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) = @${params.length}`,
          );
          params.push(estatus);
        }
      } else {
        const placeholders = statusLimit.map((_, i) => `@${params.length + i}`);
        where.push(
          `UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) IN (${placeholders.join(', ')})`,
        );
        params.push(...statusLimit);
      }
    } else if (estatus) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) = @${params.length}`,
      );
      params.push(estatus);
    }

    const from = this.normalizeDate(query.from);
    if (from) {
      where.push(
        `CONVERT(date, ISNULL(h.FCND, GETDATE())) >= @${params.length}`,
      );
      params.push(from);
    }
    const to = this.normalizeDate(query.to);
    if (to) {
      where.push(
        `CONVERT(date, ISNULL(h.FCND, GETDATE())) <= @${params.length}`,
      );
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await this.dataSource.query(
      `SELECT COUNT(1) AS total FROM dbo.TRAN_CTR_DOCPRE h ${whereSql}`,
      params,
    );
    const total = this.toInt(totalRows?.[0]?.total) ?? 0;
    const rows = await this.dataSource.query(
      `
      SELECT
        h.DOC,
        h.FCND,
        h.FCNC,
        TRY_CONVERT(FLOAT, ISNULL(h.CTD, 0)) AS CTD,
        TRY_CONVERT(FLOAT, ISNULL(h.IMP, 0)) AS IMP,
        UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) AS ESTATUS,
        LTRIM(RTRIM(ISNULL(h.USR, ''))) AS USR,
        LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT))) AS SUC_ENT,
        LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL))) AS SUC_SAL,
        LTRIM(RTRIM(ISNULL(h.MTV, ''))) AS MTV,
        LTRIM(RTRIM(ISNULL(h.PRIO, ''))) AS PRIO,
        LTRIM(RTRIM(ISNULL(h.TXT, ''))) AS TXT,
        ISNULL(det.DETALLE_ACTIVO, 0) AS DETALLE_ACTIVO
      FROM dbo.TRAN_CTR_DOCPRE h
      OUTER APPLY (
        SELECT COUNT(1) AS DETALLE_ACTIVO
        FROM dbo.TRAN_DET_ART d
        WHERE d.DOC = h.DOC AND ISNULL(d.BLOQ, 0) <> -1
      ) det
      ${whereSql}
      ORDER BY TRY_CONVERT(BIGINT, h.DOC) DESC, h.FCND DESC
      OFFSET @${params.length} ROWS FETCH NEXT @${params.length + 1} ROWS ONLY
      `,
      [...params, skip, limit],
    );

    return {
      items: (rows ?? []).map((row: Record<string, unknown>) =>
        this.mapHeader(row),
      ),
      total,
      page,
      limit,
    };
  }

  async reportes(query: TransferenciaQueryDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertInventoryChiefRole(ctx);
    const { page, limit, skip } = this.normalizePagination(
      query.page,
      query.limit,
    );
    const where: string[] = [];
    const params: unknown[] = [];

    const search = this.normalizeText(query.search);
    if (search) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(h.DOC, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(h.USR, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(h.TXT, '')))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }

    const doc = this.normalizeText(query.doc);
    if (doc) {
      where.push(`LTRIM(RTRIM(ISNULL(h.DOC, ''))) LIKE @${params.length}`);
      params.push(`%${doc}%`);
    }

    const usuario = this.normalizeText(query.usuario);
    if (usuario) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(h.USR, '')))) LIKE @${params.length}`,
      );
      params.push(`%${usuario.toUpperCase()}%`);
    }

    const suc = this.normalizeText(query.suc);
    if (suc) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT)))) = @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL)))) = @${params.length})`,
      );
      params.push(suc.toUpperCase());
    }

    const estatus = this.normalizeText(query.estatus).toUpperCase();
    if (estatus) {
      if (estatus === 'INCIDENCIA') {
        where.push('1 = 0');
      } else {
        where.push(
          `UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) = @${params.length}`,
        );
        params.push(estatus);
      }
    }

    const from = this.normalizeDate(query.from);
    if (from) {
      where.push(
        `CONVERT(date, ISNULL(h.FCND, GETDATE())) >= @${params.length}`,
      );
      params.push(from);
    }
    const to = this.normalizeDate(query.to);
    if (to) {
      where.push(
        `CONVERT(date, ISNULL(h.FCND, GETDATE())) <= @${params.length}`,
      );
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await this.dataSource.query(
      `SELECT COUNT(1) AS total FROM dbo.TRAN_CTR_DOCPRE h ${whereSql}`,
      params,
    );
    const rows = await this.dataSource.query(
      `
      SELECT
        h.DOC,
        h.FCND,
        h.FCNC,
        TRY_CONVERT(FLOAT, ISNULL(h.CTD, 0)) AS CTD,
        TRY_CONVERT(FLOAT, ISNULL(h.IMP, 0)) AS IMP,
        UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) AS ESTATUS,
        LTRIM(RTRIM(ISNULL(h.USR, ''))) AS USR,
        LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT))) AS SUC_ENT,
        LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL))) AS SUC_SAL,
        LTRIM(RTRIM(ISNULL(h.MTV, ''))) AS MTV,
        LTRIM(RTRIM(ISNULL(h.PRIO, ''))) AS PRIO,
        LTRIM(RTRIM(ISNULL(h.TXT, ''))) AS TXT,
        ISNULL(det.DETALLE_ACTIVO, 0) AS DETALLE_ACTIVO,
        ISNULL(inc.HAS_INCIDENCIA, 0) AS HAS_INCIDENCIA
      FROM dbo.TRAN_CTR_DOCPRE h
      OUTER APPLY (
        SELECT COUNT(1) AS DETALLE_ACTIVO
        FROM dbo.TRAN_DET_ART d
        WHERE d.DOC = h.DOC AND ISNULL(d.BLOQ, 0) <> -1
      ) det
      OUTER APPLY (
        SELECT CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) = 'INCIDENCIA' THEN 1
          WHEN COUNT(1) > 0 THEN 1
          ELSE 0
        END AS HAS_INCIDENCIA
        FROM dbo.TRAN_DET_ART d
        WHERE d.DOC = h.DOC
          AND ISNULL(d.BLOQ, 0) <> -1
          AND (
            UPPER(LTRIM(RTRIM(ISNULL(d.ESTATUS_R, '')))) = 'INCIDENCIA'
            OR (
              UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) IN ('REVISANDO', 'INCIDENCIA')
              AND d.FCN_CONT IS NULL
              AND d.CTD_R IS NOT NULL
              AND ABS(ISNULL(d.DIF_R, 0)) > 0
            )
          )
      ) inc
      ${whereSql}
      ORDER BY TRY_CONVERT(BIGINT, h.DOC) DESC, h.FCND DESC
      OFFSET @${params.length} ROWS FETCH NEXT @${params.length + 1} ROWS ONLY
      `,
      [...params, skip, limit],
    );

    return {
      items: (rows ?? []).map((row: Record<string, unknown>) =>
        this.mapHeader(row),
      ),
      total: this.toInt(totalRows?.[0]?.total) ?? 0,
      page,
      limit,
    };
  }

  async reporteDetalle(docRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertInventoryChiefRole(ctx);
    const doc = this.requireText(docRaw, 'doc');
    const header = await this.fetchHeader(doc);
    const detalle = await this.fetchDetalle(doc, header.sucSal, header.sucEnt);
    const paqueteria = await this.fetchPaqueteria(doc);
    return { ...header, detalle, paqueteria };
  }

  async findOne(docRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(
      header.sucEnt,
      header.sucSal,
      ctx,
      header.estatus,
    );
    const detalle = await this.fetchDetalle(doc, header.sucSal, header.sucEnt);
    const paqueteria = await this.fetchPaqueteria(doc);
    return { ...header, detalle, paqueteria };
  }

  async create(dto: CreateTransferenciaDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const sucEnt = await this.resolveTargetSuc(dto.sucEnt, ctx);
    const sucSal = this.requireText(dto.sucSal, 'sucSal').toUpperCase();
    await this.assertSucAllowed(sucEnt, ctx);

    try {
      const rows = await this.dataSource.query(
        `EXEC dbo.sp_trans_crear @SUC_ENT=@0, @SUC_SAL=@1, @MTV=@2, @PRIO=@3, @TXT=@4, @USER=@5`,
        [
          sucEnt,
          sucSal,
          this.requireText(dto.mtv, 'mtv').toUpperCase(),
          this.normalizeText(dto.prio || 'NORMAL').toUpperCase(),
          this.normalizeNullable(dto.txt),
          ctx.username,
        ],
      );
      const doc = this.normalizeText(rows?.[0]?.DOC ?? rows?.[0]?.doc);
      if (!doc)
        throw new BadRequestException('No fue posible crear solicitud.');
      return this.findOne(doc, user);
    } catch (error) {
      this.throwSqlBusinessError(error, 'No fue posible crear solicitud.');
    }
  }

  async update(docRaw: string, dto: UpdateTransferenciaDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(
      header.sucEnt,
      header.sucSal,
      ctx,
      header.estatus,
    );
    this.assertHeaderEditable(header.estatus);
    const sucEnt = this.normalizeNullable(dto.sucEnt)?.toUpperCase();
    const sucSal = this.normalizeNullable(dto.sucSal)?.toUpperCase();
    if (sucEnt) await this.assertSucAllowed(sucEnt, ctx);
    if (sucSal && !ctx.isAdmin && !this.isInventoryRole(ctx.roleCode)) {
      await this.assertSucAllowed(sucSal, ctx, false);
    }

    await this.dataSource.query(
      `
      UPDATE dbo.TRAN_CTR_DOCPRE
      SET SUC_ENT = COALESCE(@1, SUC_ENT),
          SUC_SAL = COALESCE(@2, SUC_SAL),
          MTV = COALESCE(@3, MTV),
          PRIO = COALESCE(@4, PRIO),
          TXT = COALESCE(@5, TXT),
          FCNM = GETDATE()
      WHERE DOC = @0
      `,
      [
        doc,
        sucEnt,
        sucSal,
        this.normalizeNullable(dto.mtv)?.toUpperCase(),
        this.normalizeNullable(dto.prio)?.toUpperCase(),
        this.normalizeNullable(dto.txt),
      ],
    );
    await this.dataSource.query(`EXEC dbo.sp_trans_recalcular @DOC=@0`, [doc]);
    return this.findOne(doc, user);
  }

  async addDetalle(
    docRaw: string,
    dto: AddTransferenciaDetailDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(
      header.sucEnt,
      header.sucSal,
      ctx,
      header.estatus,
    );
    this.assertHeaderEditable(header.estatus);
    const art = this.requireText(dto.art, 'art');
    if (dto.ctd <= 0) throw new BadRequestException('ctd debe ser mayor a 0.');
    const artSucSal = this.resolveDatArtSuc(header.sucSal);
    const artSucEnt = this.resolveDatArtSuc(header.sucEnt);

    const artRows = await this.dataSource.query(
      `
      SELECT TOP 1
        s.ART,
        LTRIM(RTRIM(ISNULL(s.DES, ''))) AS DES,
        TRY_CONVERT(FLOAT, ISNULL(s.STOCK, 0)) AS EXIS_S,
        TRY_CONVERT(FLOAT, ISNULL(d.STOCK, 0)) AS EXIS_D,
        TRY_CONVERT(FLOAT, ISNULL(s.CTOP, 0)) AS CTOP
      FROM dbo.DAT_ART s
      LEFT JOIN dbo.DAT_ART d
        ON LTRIM(RTRIM(ISNULL(d.SUC, ''))) = @2
       AND LTRIM(RTRIM(ISNULL(d.ART, ''))) = LTRIM(RTRIM(ISNULL(s.ART, '')))
      WHERE LTRIM(RTRIM(ISNULL(s.SUC, ''))) = @1
        AND LTRIM(RTRIM(ISNULL(s.ART, ''))) = @0
      `,
      [art, artSucSal, artSucEnt],
    );
    if (!artRows?.length) {
      throw new BadRequestException('Articulo no existe en sucursal origen.');
    }
    const row = artRows[0] as Record<string, unknown>;
    await this.dataSource.query(
      `
      INSERT INTO dbo.TRAN_DET_ART
        (IDPD, DOC, ART, CTD, BLOQ, [DESC], EXIS_S, EXIS_D, CTOTAL, TXT)
      VALUES
        (CONVERT(NVARCHAR(36), NEWID()), @0, @1, @2, 0, @3, @4, @5, @6, @7)
      `,
      [
        doc,
        art,
        String(dto.ctd),
        this.normalizeText(row.DES),
        this.toNumber(row.EXIS_S) ?? 0,
        this.toNumber(row.EXIS_D) ?? 0,
        dto.ctd * (this.toNumber(row.CTOP) ?? 0),
        this.normalizeNullable(dto.txt),
      ],
    );
    await this.dataSource.query(`EXEC dbo.sp_trans_recalcular @DOC=@0`, [doc]);
    return this.findOne(doc, user);
  }

  async addDetalleBulk(
    docRaw: string,
    dto: BulkAddTransferenciaDetailDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(
      header.sucEnt,
      header.sucSal,
      ctx,
      header.estatus,
    );
    this.assertHeaderEditable(header.estatus);

    const items = (dto.items ?? [])
      .map((item) => ({
        art: this.normalizeText(item.art).slice(0, 50),
        ctd: Number(item.ctd),
        des: this.normalizeText(item.des ?? '').slice(0, 255),
      }))
      .filter((item) => item.art && Number.isFinite(item.ctd) && item.ctd > 0);
    if (!items.length) {
      throw new BadRequestException('El archivo no contiene articulos validos.');
    }

    const artSucSal = this.resolveDatArtSuc(header.sucSal);
    const artSucEnt = this.resolveDatArtSuc(header.sucEnt);
    const payload = JSON.stringify(items);
    const validationRows = await this.dataSource.query(
      `
      DECLARE @items TABLE (
        RowNum INT IDENTITY(1,1),
        ART NVARCHAR(50) NOT NULL,
        CTD FLOAT NOT NULL,
        DES NVARCHAR(255) NULL
      );

      INSERT INTO @items (ART, CTD, DES)
      SELECT
        LTRIM(RTRIM(ISNULL(art, ''))),
        TRY_CONVERT(FLOAT, ctd),
        LTRIM(RTRIM(ISNULL(des, '')))
      FROM OPENJSON(@0)
      WITH (
        art NVARCHAR(50) '$.art',
        ctd NVARCHAR(50) '$.ctd',
        des NVARCHAR(255) '$.des'
      )
      WHERE LTRIM(RTRIM(ISNULL(art, ''))) <> ''
        AND TRY_CONVERT(FLOAT, ctd) > 0;

      SELECT
        COUNT(1) AS TOTAL,
        SUM(CASE WHEN s.ART IS NULL THEN 1 ELSE 0 END) AS FALTANTES,
        STUFF((
          SELECT TOP 5 ', ' + x.ART
          FROM @items x
          LEFT JOIN dbo.DAT_ART sx
            ON LTRIM(RTRIM(ISNULL(sx.SUC, ''))) = @1
           AND LTRIM(RTRIM(ISNULL(sx.ART, ''))) = x.ART
          WHERE sx.ART IS NULL
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS EJEMPLOS
      FROM @items i
      LEFT JOIN dbo.DAT_ART s
        ON LTRIM(RTRIM(ISNULL(s.SUC, ''))) = @1
       AND LTRIM(RTRIM(ISNULL(s.ART, ''))) = i.ART;
      `,
      [payload, artSucSal],
    );
    const validation = validationRows?.[0] as Record<string, unknown> | undefined;
    const faltantes = this.toInt(validation?.FALTANTES) ?? 0;
    if (faltantes > 0) {
      const ejemplos = this.normalizeText(validation?.EJEMPLOS ?? '');
      throw new BadRequestException(
        `Hay ${faltantes} articulos que no existen en sucursal origen ${header.sucSal}. Ejemplos: ${ejemplos}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        DECLARE @items TABLE (
          RowNum INT IDENTITY(1,1),
          ART NVARCHAR(50) NOT NULL,
          CTD FLOAT NOT NULL,
          DES NVARCHAR(255) NULL
        );

        INSERT INTO @items (ART, CTD, DES)
        SELECT
          LTRIM(RTRIM(ISNULL(art, ''))),
          TRY_CONVERT(FLOAT, ctd),
          LTRIM(RTRIM(ISNULL(des, '')))
        FROM OPENJSON(@0)
        WITH (
          art NVARCHAR(50) '$.art',
          ctd NVARCHAR(50) '$.ctd',
          des NVARCHAR(255) '$.des'
        )
        WHERE LTRIM(RTRIM(ISNULL(art, ''))) <> ''
          AND TRY_CONVERT(FLOAT, ctd) > 0;

        INSERT INTO dbo.TRAN_DET_ART
          (IDPD, DOC, ART, CTD, BLOQ, [DESC], EXIS_S, EXIS_D, CTOTAL, TXT)
        SELECT
          CONVERT(NVARCHAR(36), NEWID()),
          @1,
          i.ART,
          i.CTD,
          0,
          COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(s.DES, ''))), ''), NULLIF(i.DES, ''), i.ART),
          TRY_CONVERT(FLOAT, ISNULL(s.STOCK, 0)),
          TRY_CONVERT(FLOAT, ISNULL(d.STOCK, 0)),
          i.CTD * TRY_CONVERT(FLOAT, ISNULL(s.CTOP, 0)),
          NULL
        FROM @items i
        INNER JOIN dbo.DAT_ART s
          ON LTRIM(RTRIM(ISNULL(s.SUC, ''))) = @2
         AND LTRIM(RTRIM(ISNULL(s.ART, ''))) = i.ART
        LEFT JOIN dbo.DAT_ART d
          ON LTRIM(RTRIM(ISNULL(d.SUC, ''))) = @3
         AND LTRIM(RTRIM(ISNULL(d.ART, ''))) = i.ART
        ORDER BY i.RowNum;
        `,
        [payload, doc, artSucSal, artSucEnt],
      );
      await manager.query(`EXEC dbo.sp_trans_recalcular @DOC=@0`, [doc]);
    });

    return this.findOne(doc, user);
  }

  async updateDetalle(
    docRaw: string,
    idpdRaw: string,
    dto: UpdateTransferenciaDetailDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const idpd = this.requireText(idpdRaw, 'idpd');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(
      header.sucEnt,
      header.sucSal,
      ctx,
      header.estatus,
    );
    const currentRows = await this.dataSource.query(
      `SELECT TOP 1 * FROM dbo.TRAN_DET_ART WHERE DOC=@0 AND IDPD=@1 AND ISNULL(BLOQ, 0) <> -1`,
      [doc, idpd],
    );
    if (!currentRows?.length) throw new NotFoundException('Detalle no existe.');
    if (currentRows[0].FCN_CONT) {
      throw new BadRequestException('Articulo ya contabilizado.');
    }
    const art = this.normalizeText(currentRows[0].ART);
    const ctoRows = await this.dataSource.query(
      `SELECT TOP 1 TRY_CONVERT(FLOAT, ISNULL(CTOP, 0)) AS CTOP FROM dbo.DAT_ART WHERE LTRIM(RTRIM(ISNULL(SUC, ''))) = @0 AND LTRIM(RTRIM(ISNULL(ART, ''))) = @1`,
      [this.resolveDatArtSuc(header.sucSal), art],
    );
    const cto = this.toNumber(ctoRows?.[0]?.CTOP) ?? 0;
    const setParts: string[] = [];
    const params: unknown[] = [doc, idpd];

    if (dto.ctd !== undefined) {
      if (header.estatus !== 'BORRADOR') {
        throw new BadRequestException('ctd solo se edita en BORRADOR.');
      }
      setParts.push(`CTD=@${params.length}`, `CTOTAL=@${params.length + 1}`);
      params.push(String(dto.ctd), dto.ctd * cto);
    }
    if (dto.ctdLib !== undefined) {
      if (header.estatus !== 'PENDIENTE') {
        throw new BadRequestException('ctdLib solo se edita en PENDIENTE.');
      }
      setParts.push(
        `CTD_LIB=@${params.length}`,
        `CTOLIB=@${params.length + 1}`,
      );
      params.push(dto.ctdLib, dto.ctdLib * cto);
    }
    if (dto.ctdR !== undefined) {
      const canEditIncidence =
        header.estatus === 'INCIDENCIA' &&
        (ctx.isAdmin || ctx.roleId === 2 || this.isInventoryRole(ctx.roleCode));
      if (
        !['TRANSITO', 'REVISANDO'].includes(header.estatus) &&
        !canEditIncidence
      ) {
        throw new BadRequestException('ctdR solo se captura en recepcion.');
      }
      const ctdLib =
        this.toNumber(currentRows[0].CTD_LIB) ??
        this.toNumber(currentRows[0].CTD) ??
        0;
      const dif = ctdLib - dto.ctdR;
      setParts.push(
        `CTD_R=@${params.length}`,
        `CTO_R=@${params.length + 1}`,
        `DIF_R=@${params.length + 2}`,
        `DIFCTO_R=@${params.length + 3}`,
      );
      params.push(dto.ctdR, dto.ctdR * cto, dif, dif * cto);
    }
    if (dto.estatusR !== undefined) {
      const canEditIncidence =
        header.estatus === 'INCIDENCIA' &&
        (ctx.isAdmin || ctx.roleId === 2 || this.isInventoryRole(ctx.roleCode));
      if (header.estatus !== 'REVISANDO' && !canEditIncidence) {
        throw new BadRequestException('estatusR solo se captura en REVISANDO.');
      }
      const estatusR = this.normalizeText(dto.estatusR).toUpperCase();
      if (!['CONTABILIZADO', 'INCIDENCIA'].includes(estatusR)) {
        throw new BadRequestException(
          'estatusR debe ser CONTABILIZADO o INCIDENCIA.',
        );
      }
      setParts.push(`ESTATUS_R=@${params.length}`);
      params.push(estatusR);
    }
    if (dto.txt !== undefined) {
      setParts.push(`TXT=@${params.length}`);
      params.push(this.normalizeNullable(dto.txt));
    }
    if (!setParts.length) return this.findOne(doc, user);

    await this.dataSource.query(
      `UPDATE dbo.TRAN_DET_ART SET ${setParts.join(', ')} WHERE DOC=@0 AND IDPD=@1`,
      params,
    );
    const previousDetailStatus = this.normalizeText(
      currentRows[0].ESTATUS_R,
    ).toUpperCase();
    const newDetailStatus = this.normalizeText(dto.estatusR).toUpperCase();
    const keepsIncidenceWorkflow =
      header.estatus === 'REVISANDO' &&
      (previousDetailStatus === 'INCIDENCIA' ||
        newDetailStatus === 'INCIDENCIA');
    if (keepsIncidenceWorkflow) {
      await this.dataSource.query(
        `UPDATE dbo.TRAN_CTR_DOCPRE SET ESTATUS='INCIDENCIA', FCNM=GETDATE() WHERE DOC=@0 AND UPPER(LTRIM(RTRIM(ISNULL(ESTATUS, ''))))='REVISANDO'`,
        [doc],
      );
    }
    await this.dataSource.query(`EXEC dbo.sp_trans_recalcular @DOC=@0`, [doc]);
    return this.findOne(doc, user);
  }

  async removeDetalle(docRaw: string, idpdRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const idpd = this.requireText(idpdRaw, 'idpd');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(
      header.sucEnt,
      header.sucSal,
      ctx,
      header.estatus,
    );
    this.assertHeaderEditable(header.estatus);
    await this.dataSource.query(
      `UPDATE dbo.TRAN_DET_ART SET BLOQ=-1 WHERE DOC=@0 AND IDPD=@1`,
      [doc, idpd],
    );
    await this.dataSource.query(`EXEC dbo.sp_trans_recalcular @DOC=@0`, [doc]);
    return this.findOne(doc, user);
  }

  async addEvidencia(
    docRaw: string,
    idpdRaw: string,
    dto: AddTransferenciaEvidenceDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const idpd = this.requireText(idpdRaw, 'idpd');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(
      header.sucEnt,
      header.sucSal,
      ctx,
      header.estatus,
    );
    if (header.estatus !== 'PREPARACION') {
      throw new BadRequestException(
        'La evidencia solo se captura en PREPARACION.',
      );
    }
    if (!ctx.isAdmin && !this.isInventoryRole(ctx.roleCode)) {
      const allowed = await this.resolveAuthorizedSucs(ctx);
      if (!allowed.includes(this.normalizeText(header.sucSal).toUpperCase())) {
        throw new ForbiddenException(
          'Solo la sucursal origen puede capturar evidencia.',
        );
      }
    }
    const detailRows = await this.dataSource.query(
      `SELECT TOP 1 IDPD FROM dbo.TRAN_DET_ART WHERE DOC=@0 AND IDPD=@1 AND ISNULL(BLOQ, 0) <> -1`,
      [doc, idpd],
    );
    if (!detailRows?.length) throw new NotFoundException('Detalle no existe.');
    const imgEvi = this.requireText(dto.imgEvi, 'imgEvi');
    this.assertEvidenceImage(imgEvi);
    await this.dataSource.query(
      `INSERT INTO dbo.TRAN_EVID (IDPD, IMG_EVI, TIPO, USR) VALUES (@0, @1, @2, @3)`,
      [idpd, imgEvi, this.normalizeNullable(dto.tipo), ctx.username],
    );
    return this.findOne(doc, user);
  }

  async addDocumentoEvidencia(
    docRaw: string,
    dto: AddTransferenciaEvidenceDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(
      header.sucEnt,
      header.sucSal,
      ctx,
      header.estatus,
    );
    if (!['LIBERADA', 'PREPARACION'].includes(header.estatus)) {
      throw new BadRequestException(
        'La evidencia del documento solo se captura en LIBERADA o PREPARACION.',
      );
    }
    if (!ctx.isAdmin && !this.isInventoryRole(ctx.roleCode)) {
      const allowed = await this.resolveAuthorizedSucs(ctx);
      if (!allowed.includes(this.normalizeText(header.sucSal).toUpperCase())) {
        throw new ForbiddenException(
          'Solo la sucursal origen puede capturar evidencia.',
        );
      }
    }
    const imgEvi = this.requireText(dto.imgEvi, 'imgEvi');
    this.assertEvidenceImage(imgEvi);
    await this.dataSource.query(
      `INSERT INTO dbo.TRAN_EVID (IDPD, DOC, IMG_EVI, TIPO, USR) VALUES (@0, @1, @2, @3, @4)`,
      [
        `DOC:${doc}`,
        doc,
        imgEvi,
        this.normalizeNullable(dto.tipo),
        ctx.username,
      ],
    );
    return this.findOne(doc, user);
  }

  enviar(doc: string, user: JwtPayload) {
    return this.execAction(doc, user, 'sp_trans_enviar');
  }

  liberar(doc: string, user: JwtPayload) {
    return this.execAction(doc, user, 'sp_trans_liberar', true);
  }

  rechazar(doc: string, dto: TransferenciaActionDto, user: JwtPayload) {
    return this.execAction(doc, user, 'sp_trans_rechazar', true, dto);
  }

  preparar(doc: string, user: JwtPayload) {
    return this.execAction(
      doc,
      user,
      'sp_trans_preparar',
      false,
      undefined,
      true,
    );
  }

  async transito(doc: string, dto: TransferenciaActionDto, user: JwtPayload) {
    await this.assertTransferEvidenceComplete(doc);
    return this.execAction(doc, user, 'sp_trans_transito', false, dto, true);
  }

  recibir(doc: string, user: JwtPayload) {
    return this.execAction(doc, user, 'sp_trans_recibir');
  }

  contabilizar(doc: string, user: JwtPayload) {
    return this.execAction(doc, user, 'sp_trans_contabilizar');
  }

  async catalogSucursales(user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.isAdmin || this.isInventoryRole(ctx.roleCode)) {
      const rows = await this.dataSource.query(
        `SELECT SUC FROM dbo.DAT_SUC ORDER BY SUC ASC`,
      );
      return (rows ?? []).map((row: Record<string, unknown>) =>
        this.normalizeText(row.SUC),
      );
    }
    return this.resolveAuthorizedSucs(ctx);
  }

  async catalogMotivos() {
    const rows = await this.dataSource.query(
      `SELECT CLAVE AS clave, [DESC] AS [desc] FROM dbo.MOV_TRAN ORDER BY CLAVE`,
    );
    return rows ?? [];
  }

  async catalogPrioridades() {
    const rows = await this.dataSource.query(
      `SELECT [DESC] AS [desc] FROM dbo.PRIO_TRAN ORDER BY ID`,
    );
    return rows ?? [];
  }

  async catalogEstatus() {
    const rows = await this.dataSource.query(
      `SELECT [DESC] AS [desc], ORDEN AS orden FROM dbo.ESTATUS_TRAN ORDER BY ORDEN`,
    );
    return rows ?? [];
  }

  async notificaciones(user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const params: unknown[] = [];
    const statusLimit = this.resolveStatusLimit(ctx);
    const notificationStatuses = (
      statusLimit.length
        ? statusLimit
        : [
            'PENDIENTE',
            'LIBERADA',
            'PREPARACION',
            'TRANSITO',
            'REVISANDO',
            'INCIDENCIA',
          ]
    ).filter((estatus) => estatus !== 'BORRADOR');
    const statusPlaceholders = notificationStatuses.map(
      (_, i) => `@${params.length + i}`,
    );
    const where: string[] = [
      `UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) IN (${statusPlaceholders.join(', ')})`,
    ];
    params.push(...notificationStatuses);

    if (!ctx.isAdmin && !this.isInventoryRole(ctx.roleCode)) {
      const sucs = await this.resolveAuthorizedSucs(ctx);
      const placeholders = sucs.map((_, i) => `@${params.length + i}`);
      where.push(
        `(
          (
            UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) = 'LIBERADA'
            AND UPPER(LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL)))) IN (${placeholders.join(', ')})
          )
          OR
          (
            UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) IN ('TRANSITO', 'REVISANDO')
            AND UPPER(LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT)))) IN (${placeholders.join(', ')})
          )
          OR
          (
            UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) NOT IN ('LIBERADA', 'TRANSITO', 'REVISANDO')
            AND (
              UPPER(LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT)))) IN (${placeholders.join(', ')})
              OR UPPER(LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL)))) IN (${placeholders.join(', ')})
            )
          )
        )`,
      );
      params.push(...sucs);
    }

    const rows = await this.dataSource.query(
      `
      SELECT TOP 50
        h.DOC,
        h.FCND,
        h.FCNC,
        TRY_CONVERT(FLOAT, ISNULL(h.CTD, 0)) AS CTD,
        TRY_CONVERT(FLOAT, ISNULL(h.IMP, 0)) AS IMP,
        UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) AS ESTATUS,
        LTRIM(RTRIM(ISNULL(h.USR, ''))) AS USR,
        LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT))) AS SUC_ENT,
        LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL))) AS SUC_SAL,
        LTRIM(RTRIM(ISNULL(h.MTV, ''))) AS MTV,
        LTRIM(RTRIM(ISNULL(h.PRIO, ''))) AS PRIO,
        LTRIM(RTRIM(ISNULL(h.TXT, ''))) AS TXT,
        ISNULL(det.DETALLE_ACTIVO, 0) AS DETALLE_ACTIVO
      FROM dbo.TRAN_CTR_DOCPRE h
      OUTER APPLY (
        SELECT COUNT(1) AS DETALLE_ACTIVO
        FROM dbo.TRAN_DET_ART d
        WHERE d.DOC = h.DOC AND ISNULL(d.BLOQ, 0) <> -1
      ) det
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, ''))))
          WHEN 'INCIDENCIA' THEN 1
          WHEN 'PENDIENTE' THEN 2
          WHEN 'LIBERADA' THEN 3
          WHEN 'TRANSITO' THEN 4
          WHEN 'REVISANDO' THEN 5
          ELSE 6
        END,
        ISNULL(h.FCNM, h.FCND) DESC
      `,
      params,
    );
    return (rows ?? []).map((row: Record<string, unknown>) =>
      this.mapHeader(row),
    );
  }

  async catalogArticulos(
    query: TransferenciaArticulosQueryDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const { page, limit, skip } = this.normalizePagination(
      query.page,
      query.limit,
    );
    const sucSal = this.requireText(query.sucSal, 'sucSal').toUpperCase();
    const sucEnt = this.normalizeText(query.sucEnt).toUpperCase();
    const artSucSal = this.resolveDatArtSuc(sucSal);
    const artSucEnt = this.resolveDatArtSuc(sucEnt);
    await this.resolveAuthorizedSucs(ctx);
    const where: string[] = [`LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @0`];
    const params: unknown[] = [artSucSal];
    const search = this.normalizeText(query.search);
    if (search) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(a.UPC, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(a.DES, '')))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }
    this.pushNumericFilter(where, params, 'a.DEPA', query.depa);
    this.pushNumericFilter(where, params, 'a.SUBD', query.subd);
    this.pushNumericFilter(where, params, 'a.CLAS', query.clas);
    this.pushNumericFilter(where, params, 'a.SCLA', query.scla);
    this.pushNumericFilter(where, params, 'a.SCLA2', query.scla2);
    this.pushNumericFilter(where, params, 'a.SPH', query.sph);
    this.pushNumericFilter(where, params, 'a.CYL', query.cyl);
    this.pushNumericFilter(where, params, 'a.ADIC', query.adic);
    const totalRows = await this.dataSource.query(
      `SELECT COUNT(1) AS total FROM dbo.DAT_ART a WHERE ${where.join(' AND ')}`,
      params,
    );
    const rows = await this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(a.ART, ''))) AS ART,
        LTRIM(RTRIM(ISNULL(a.UPC, ''))) AS UPC,
        LTRIM(RTRIM(ISNULL(a.DES, ''))) AS DES,
        TRY_CONVERT(FLOAT, ISNULL(a.STOCK, 0)) AS STOCK_SAL,
        TRY_CONVERT(FLOAT, ISNULL(dest.STOCK, 0)) AS STOCK_ENT,
        TRY_CONVERT(FLOAT, ISNULL(a.STOCK_MIN, 0)) AS STOCK_MIN,
        TRY_CONVERT(FLOAT, ISNULL(a.CTOP, 0)) AS CTOP
      FROM dbo.DAT_ART a
      LEFT JOIN dbo.DAT_ART dest
        ON LTRIM(RTRIM(ISNULL(dest.SUC, ''))) = @${params.length}
       AND LTRIM(RTRIM(ISNULL(dest.ART, ''))) = LTRIM(RTRIM(ISNULL(a.ART, '')))
      WHERE ${where.join(' AND ')}
      ORDER BY a.ART
      OFFSET @${params.length + 1} ROWS FETCH NEXT @${params.length + 2} ROWS ONLY
      `,
      [...params, artSucEnt, skip, limit],
    );
    return {
      items: (rows ?? []).map((row: Record<string, unknown>) => ({
        art: this.normalizeText(row.ART),
        upc: this.normalizeText(row.UPC),
        des: this.normalizeText(row.DES),
        stockSal: this.toNumber(row.STOCK_SAL) ?? 0,
        stockEnt: this.toNumber(row.STOCK_ENT) ?? 0,
        stockMin: this.toNumber(row.STOCK_MIN) ?? 0,
        ctop: this.toMoney(row.CTOP) ?? 0,
      })),
      total: this.toInt(totalRows?.[0]?.total) ?? 0,
      page,
      limit,
    };
  }

  async envio(docRaw: string, user: JwtPayload) {
    const doc = await this.findOne(docRaw, user);
    return {
      doc: doc.doc,
      sucEnt: doc.sucEnt,
      sucSal: doc.sucSal,
      fcnd: doc.fcnd,
      estatus: doc.estatus,
      paqueteria: doc.paqueteria,
      detalle: doc.detalle,
    };
  }

  private async execAction(
    docRaw: string,
    user: JwtPayload,
    sp: string,
    requireInventory = false,
    dto?: TransferenciaActionDto,
    requireOrigin = false,
  ) {
    const ctx = await this.resolveUserContext(user);
    if (requireInventory) this.assertInventoryRole(ctx);
    const doc = this.requireText(docRaw, 'doc');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(header.sucEnt, header.sucSal, ctx);
    if (requireOrigin) await this.assertSucAllowed(header.sucSal, ctx, false);
    try {
      if (sp === 'sp_trans_rechazar') {
        await this.dataSource.query(
          `EXEC dbo.sp_trans_rechazar @DOC=@0, @USER=@1, @TXT=@2`,
          [doc, ctx.username, this.normalizeNullable(dto?.txt)],
        );
      } else if (sp === 'sp_trans_transito') {
        await this.dataSource.query(
          `EXEC dbo.sp_trans_transito @DOC=@0, @USER=@1, @EMP=@2, @NUM_GUIA=@3, @RESP=@4, @TXT=@5`,
          [
            doc,
            ctx.username,
            this.normalizeNullable(dto?.emp),
            this.normalizeNullable(dto?.numGuia),
            this.normalizeNullable(dto?.resp),
            this.normalizeNullable(dto?.txt),
          ],
        );
      } else {
        await this.dataSource.query(`EXEC dbo.${sp} @DOC=@0, @USER=@1`, [
          doc,
          ctx.username,
        ]);
      }
      return this.findOne(doc, user);
    } catch (error) {
      this.throwSqlBusinessError(error, 'No fue posible completar la accion.');
    }
  }

  private async fetchHeader(doc: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        h.DOC,
        h.FCND,
        h.FCNC,
        TRY_CONVERT(FLOAT, ISNULL(h.CTD, 0)) AS CTD,
        TRY_CONVERT(FLOAT, ISNULL(h.IMP, 0)) AS IMP,
        UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) AS ESTATUS,
        LTRIM(RTRIM(ISNULL(h.USR, ''))) AS USR,
        LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT))) AS SUC_ENT,
        LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL))) AS SUC_SAL,
        LTRIM(RTRIM(ISNULL(h.MTV, ''))) AS MTV,
        LTRIM(RTRIM(ISNULL(mt.[DESC], ''))) AS MTV_DESC,
        LTRIM(RTRIM(ISNULL(h.PRIO, ''))) AS PRIO,
        LTRIM(RTRIM(ISNULL(h.TXT, ''))) AS TXT,
        LTRIM(RTRIM(ISNULL(h.USR_L, ''))) AS USR_L,
        LTRIM(RTRIM(ISNULL(h.USR_R, ''))) AS USR_R,
        LTRIM(RTRIM(ISNULL(h.USR_E, ''))) AS USR_E,
        LTRIM(RTRIM(ISNULL(h.DOC_MB51_SAL, ''))) AS DOC_MB51_SAL,
        LTRIM(RTRIM(ISNULL(h.DOC_MB51_ENT, ''))) AS DOC_MB51_ENT,
        ISNULL(evi.EVIDENCIAS, 0) AS EVIDENCIAS,
        evi.IMG_EVI AS EVIDENCIA_URL,
        evi.TIPO AS EVIDENCIA_MIME,
        ISNULL(inc.HAS_INCIDENCIA, 0) AS HAS_INCIDENCIA
      FROM dbo.TRAN_CTR_DOCPRE h
      LEFT JOIN dbo.MOV_TRAN mt ON mt.CLAVE = h.MTV
      OUTER APPLY (
        SELECT
          COUNT(1) AS EVIDENCIAS,
          (
            SELECT TOP 1 ev2.IMG_EVI
            FROM dbo.TRAN_EVID ev2
            WHERE ev2.DOC = h.DOC
            ORDER BY ev2.FCN DESC, ev2.ID DESC
          ) AS IMG_EVI,
          (
            SELECT TOP 1 ev3.TIPO
            FROM dbo.TRAN_EVID ev3
            WHERE ev3.DOC = h.DOC
            ORDER BY ev3.FCN DESC, ev3.ID DESC
          ) AS TIPO
        FROM dbo.TRAN_EVID ev
        WHERE ev.DOC = h.DOC
      ) evi
      OUTER APPLY (
        SELECT CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) = 'INCIDENCIA' THEN 1
          WHEN COUNT(1) > 0 THEN 1
          ELSE 0
        END AS HAS_INCIDENCIA
        FROM dbo.TRAN_DET_ART d
        WHERE d.DOC = h.DOC
          AND ISNULL(d.BLOQ, 0) <> -1
          AND (
            UPPER(LTRIM(RTRIM(ISNULL(d.ESTATUS_R, '')))) = 'INCIDENCIA'
            OR (
              UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) IN ('REVISANDO', 'INCIDENCIA')
              AND d.FCN_CONT IS NULL
              AND d.CTD_R IS NOT NULL
              AND ABS(ISNULL(d.DIF_R, 0)) > 0
            )
          )
      ) inc
      WHERE h.DOC = @0
      `,
      [doc],
    );
    if (!rows?.length) throw new NotFoundException(`No existe DOC ${doc}.`);
    return this.mapHeader(rows[0] as Record<string, unknown>);
  }

  private async fetchDetalle(doc: string, sucSal: string, sucEnt: string) {
    const artSucSal = this.resolveDatArtSuc(sucSal);
    const artSucEnt = this.resolveDatArtSuc(sucEnt);
    const rows = await this.dataSource.query(
      `
      SELECT
        d.IDPD,
        LTRIM(RTRIM(ISNULL(d.ART, ''))) AS ART,
        LTRIM(RTRIM(ISNULL(d.[DESC], a.DES))) AS DES,
        TRY_CONVERT(FLOAT, ISNULL(d.EXIS_S, a.STOCK)) AS EXIS_S,
        TRY_CONVERT(FLOAT, ISNULL(d.EXIS_D, dest.STOCK)) AS EXIS_D,
        TRY_CONVERT(FLOAT, ISNULL(d.CTD, 0)) AS CTD,
        TRY_CONVERT(FLOAT, ISNULL(d.CTD_LIB, 0)) AS CTD_LIB,
        TRY_CONVERT(FLOAT, ISNULL(d.CTOTAL, TRY_CONVERT(FLOAT, ISNULL(d.CTD, 0)) * ISNULL(a.CTOP, 0))) AS CTOTAL,
        TRY_CONVERT(FLOAT, ISNULL(d.CTOLIB, ISNULL(d.CTD_LIB, 0) * ISNULL(a.CTOP, 0))) AS CTOLIB,
        CASE WHEN d.CTD_R IS NULL THEN 0 ELSE 1 END AS CTD_R_CAPTURADA,
        TRY_CONVERT(FLOAT, ISNULL(d.CTD_R, 0)) AS CTD_R,
        TRY_CONVERT(FLOAT, ISNULL(d.CTO_R, 0)) AS CTO_R,
        TRY_CONVERT(FLOAT, ISNULL(d.DIF_R, 0)) AS DIF_R,
        TRY_CONVERT(FLOAT, ISNULL(d.DIFCTO_R, 0)) AS DIFCTO_R,
        LTRIM(RTRIM(ISNULL(d.TXT, ''))) AS TXT,
        LTRIM(RTRIM(ISNULL(d.ESTATUS_R, ''))) AS ESTATUS_R,
        LTRIM(RTRIM(ISNULL(d.USR_L, ''))) AS USR_L,
        LTRIM(RTRIM(ISNULL(d.USR_E, ''))) AS USR_E,
        TRY_CONVERT(FLOAT, ISNULL(a.CTOP, 0)) AS CTOP,
        LTRIM(RTRIM(ISNULL(a.SUC, ''))) AS SUC,
        LTRIM(RTRIM(ISNULL(a.UPC, ''))) AS UPC,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), a.DEPA), ''))) AS DEPA,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), a.SUBD), ''))) AS SUBD,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), a.CLAS), ''))) AS CLAS,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), a.SCLA), ''))) AS SCLA,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), a.SCLA2), ''))) AS SCLA2,
        LTRIM(RTRIM(COALESCE(js2.DSCLA2, js.DSCLA, jc.DCLAS, jsub.DSUBD, jd.DDEPA, ''))) AS JERARQUIA_NOMBRE,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), a.SPH), ''))) AS SPH,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), a.CYL), ''))) AS CYL,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), a.ADIC), ''))) AS ADIC,
        ISNULL(evi.EVIDENCIAS, 0) AS EVIDENCIAS,
        evi.IMG_EVI AS EVIDENCIA_URL,
        evi.TIPO AS EVIDENCIA_MIME
      FROM dbo.TRAN_DET_ART d
      LEFT JOIN dbo.DAT_ART a
        ON LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @1
       AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
      LEFT JOIN dbo.DAT_ART dest
        ON LTRIM(RTRIM(ISNULL(dest.SUC, ''))) = @2
       AND LTRIM(RTRIM(ISNULL(dest.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
      LEFT JOIN dbo.JRQ_DEPA jd
        ON jd.DEPA = TRY_CONVERT(FLOAT, a.DEPA)
      LEFT JOIN dbo.JRQ_SUBD jsub
        ON jsub.SUBD = TRY_CONVERT(FLOAT, a.SUBD)
      LEFT JOIN dbo.JRQ_CLAS jc
        ON jc.CLAS = TRY_CONVERT(FLOAT, a.CLAS)
      LEFT JOIN dbo.JRQ_SCLA js
        ON js.SCLA = TRY_CONVERT(FLOAT, a.SCLA)
      LEFT JOIN dbo.JRQ_SCLA2 js2
        ON js2.SCLA2 = TRY_CONVERT(FLOAT, a.SCLA2)
      OUTER APPLY (
        SELECT
          COUNT(1) AS EVIDENCIAS,
          (
            SELECT TOP 1 ev2.IMG_EVI
            FROM dbo.TRAN_EVID ev2
            WHERE ev2.IDPD = d.IDPD
            ORDER BY ev2.FCN DESC, ev2.ID DESC
          ) AS IMG_EVI,
          (
            SELECT TOP 1 ev3.TIPO
            FROM dbo.TRAN_EVID ev3
            WHERE ev3.IDPD = d.IDPD
            ORDER BY ev3.FCN DESC, ev3.ID DESC
          ) AS TIPO
        FROM dbo.TRAN_EVID ev
        WHERE ev.IDPD = d.IDPD
      ) evi
      WHERE d.DOC = @0
        AND ISNULL(d.BLOQ, 0) <> -1
      ORDER BY d.IDPD
      `,
      [doc, artSucSal, artSucEnt],
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      idpd: this.normalizeText(row.IDPD),
      art: this.normalizeText(row.ART),
      des: this.normalizeText(row.DES),
      exisS: this.toNumber(row.EXIS_S) ?? 0,
      exisD: this.toNumber(row.EXIS_D) ?? 0,
      ctd: this.toNumber(row.CTD) ?? 0,
      ctdLib: this.toNumber(row.CTD_LIB) ?? 0,
      ctotal: this.toMoney(row.CTOTAL) ?? 0,
      ctolib: this.toMoney(row.CTOLIB) ?? 0,
      ctdRCapturada: (this.toInt(row.CTD_R_CAPTURADA) ?? 0) > 0,
      ctdR: this.toNumber(row.CTD_R) ?? 0,
      ctoR: this.toMoney(row.CTO_R) ?? 0,
      difR: this.toNumber(row.DIF_R) ?? 0,
      difctoR: this.toMoney(row.DIFCTO_R) ?? 0,
      txt: this.normalizeText(row.TXT),
      estatusR: this.normalizeText(row.ESTATUS_R).toUpperCase(),
      usrL: this.normalizeText(row.USR_L),
      usrE: this.normalizeText(row.USR_E),
      ctop: this.toMoney(row.CTOP) ?? 0,
      suc: this.normalizeText(row.SUC),
      upc: this.normalizeText(row.UPC),
      depa: this.normalizeText(row.DEPA),
      subd: this.normalizeText(row.SUBD),
      clas: this.normalizeText(row.CLAS),
      scla: this.normalizeText(row.SCLA),
      scla2: this.normalizeText(row.SCLA2),
      jerarquiaNombre: this.normalizeText(row.JERARQUIA_NOMBRE),
      sph: this.normalizeText(row.SPH),
      cyl: this.normalizeText(row.CYL),
      adic: this.normalizeText(row.ADIC),
      evidencias: this.toInt(row.EVIDENCIAS) ?? 0,
      evidenciaUrl: this.normalizeText(row.EVIDENCIA_URL),
      evidenciaMime: this.normalizeText(row.EVIDENCIA_MIME),
    }));
  }

  private async fetchPaqueteria(doc: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 EMP, NUM_GUIA, FENV, RESP, TXT, USR
      FROM dbo.TRAN_PAQ_ENV
      WHERE DOC = @0
      ORDER BY FCN DESC, ID DESC
      `,
      [doc],
    );
    const row = rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      emp: this.normalizeText(row.EMP),
      numGuia: this.normalizeText(row.NUM_GUIA),
      fenv: this.toIsoDate(row.FENV),
      resp: this.normalizeText(row.RESP),
      txt: this.normalizeText(row.TXT),
      usr: this.normalizeText(row.USR),
    };
  }

  private mapHeader(row: Record<string, unknown>) {
    return {
      doc: this.normalizeText(row.DOC),
      fcnd: this.toIsoDate(row.FCND),
      fcnc: this.toIsoDate(row.FCNC),
      ctd: this.toNumber(row.CTD) ?? 0,
      imp: this.toMoney(row.IMP) ?? 0,
      estatus: this.normalizeText(row.ESTATUS).toUpperCase(),
      usr: this.normalizeText(row.USR),
      sucEnt: this.normalizeText(row.SUC_ENT),
      sucSal: this.normalizeText(row.SUC_SAL),
      mtv: this.normalizeText(row.MTV),
      mtvDesc: this.normalizeText(row.MTV_DESC),
      prio: this.normalizeText(row.PRIO),
      txt: this.normalizeText(row.TXT),
      usrL: this.normalizeText(row.USR_L),
      usrR: this.normalizeText(row.USR_R),
      usrE: this.normalizeText(row.USR_E),
      docMb51Sal: this.normalizeText(row.DOC_MB51_SAL),
      docMb51Ent: this.normalizeText(row.DOC_MB51_ENT),
      evidencias: this.toInt(row.EVIDENCIAS) ?? 0,
      evidenciaUrl: this.normalizeText(row.EVIDENCIA_URL),
      evidenciaMime: this.normalizeText(row.EVIDENCIA_MIME),
      detalleActivo: this.toInt(row.DETALLE_ACTIVO) ?? 0,
      hasIncidencia: (this.toInt(row.HAS_INCIDENCIA) ?? 0) > 0,
    };
  }

  private normalizePagination(pageRaw?: number, limitRaw?: number) {
    const page = Number.isFinite(Number(pageRaw))
      ? Math.max(1, Math.trunc(Number(pageRaw)))
      : 1;
    const limit = Number.isFinite(Number(limitRaw))
      ? Math.min(200, Math.max(1, Math.trunc(Number(limitRaw))))
      : 30;
    return { page, limit, skip: (page - 1) * limit };
  }

  private normalizeText(value?: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeNullable(value?: unknown) {
    const text = this.normalizeText(value);
    return text.length ? text : null;
  }

  private requireText(value: unknown, label: string) {
    const text = this.normalizeText(value);
    if (!text) throw new BadRequestException(`${label} es requerido.`);
    return text;
  }

  private normalizeDate(value?: unknown) {
    const text = this.normalizeText(value);
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new BadRequestException(`Fecha invalida: ${text}`);
    }
    return text;
  }

  private pushNumericFilter(
    where: string[],
    params: unknown[],
    column: string,
    value: unknown,
  ) {
    const text = this.normalizeText(value);
    if (!text) return;
    const normalized = Number(text.replace(',', '.'));
    if (!Number.isFinite(normalized)) {
      throw new BadRequestException(`Filtro numerico invalido: ${text}`);
    }
    where.push(`TRY_CONVERT(FLOAT, ISNULL(${column}, 0)) = @${params.length}`);
    params.push(normalized);
  }

  private resolveDatArtSuc(suc: string) {
    const normalized = this.normalizeText(suc).toUpperCase();
    return (
      TransferenciasService.DAT_ART_SUC_ALIASES.get(normalized) ?? normalized
    );
  }

  private toNumber(value?: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private toInt(value?: unknown) {
    const n = this.toNumber(value);
    return n == null ? null : Math.trunc(n);
  }

  private toMoney(value?: unknown) {
    const n = this.toNumber(value);
    return n == null ? null : Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private toIsoDate(value?: unknown) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  private async resolveUserContext(
    user?: JwtPayload | null,
  ): Promise<UserContext> {
    const raw = (user ?? {}) as Record<string, unknown>;
    const userId = Number(raw.sub ?? raw.idUsuario ?? 0);
    const roleId = Number(raw.roleId ?? 0);
    const username = this.normalizeText(raw.username);
    const suc = this.normalizeText(raw.suc).toUpperCase();
    const isAdmin =
      roleId === 1 || username.toUpperCase() === 'ADMIN' || roleId === 0;
    if (!userId || !username) {
      throw new ForbiddenException('Token de usuario invalido.');
    }
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(CODIGO, '')))) AS CODIGO,
        UPPER(LTRIM(RTRIM(ISNULL(NOMBRE, '')))) AS NOMBRE
      FROM dbo.ROL
      WHERE IDROL = @0
      `,
      [roleId],
    );
    return {
      userId,
      username,
      suc,
      roleId,
      roleCode: this.normalizeText(rows?.[0]?.CODIGO).toUpperCase(),
      roleName: this.normalizeText(rows?.[0]?.NOMBRE).toUpperCase(),
      isAdmin,
    };
  }

  private async resolveTargetSuc(sucRaw: string | undefined, ctx: UserContext) {
    const requested = this.normalizeText(sucRaw).toUpperCase();
    if (ctx.isAdmin) {
      if (!requested) throw new BadRequestException('sucEnt es requerida.');
      return requested;
    }
    if (requested) {
      await this.assertSucAllowed(requested, ctx);
      return requested;
    }
    if (!ctx.suc) throw new ForbiddenException('Usuario sin sucursal.');
    return ctx.suc;
  }

  private async resolveAuthorizedSucs(ctx: UserContext) {
    if (ctx.isAdmin) return [] as string[];
    const moduleParams = TransferenciasService.MODULE_CODES.map(
      (_, i) => `@${i + 1}`,
    ).join(', ');
    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) AS SUC
      FROM dbo.USR_MOD_SUC
      WHERE UPPER(LTRIM(RTRIM(ISNULL(USUARIO, '')))) = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) IN (${moduleParams})
        AND ISNULL(ACTIVO, 1) = 1
        AND LTRIM(RTRIM(ISNULL(SUC, ''))) <> ''
      ORDER BY UPPER(LTRIM(RTRIM(ISNULL(SUC, ''))))
      `,
      [ctx.username.toUpperCase(), ...TransferenciasService.MODULE_CODES],
    );
    const allowed = Array.from(
      new Set(
        (rows ?? [])
          .map((row: Record<string, unknown>) =>
            this.normalizeText(row.SUC).toUpperCase(),
          )
          .filter(Boolean),
      ),
    );
    if (allowed.length) return allowed;
    if (!ctx.suc) throw new ForbiddenException('Usuario sin sucursal.');
    return [ctx.suc];
  }

  private async assertSucAllowed(
    suc: string,
    ctx: UserContext,
    allowInventoryAll = true,
  ) {
    if (ctx.isAdmin) return;
    if (allowInventoryAll && this.isInventoryRole(ctx.roleCode)) return;
    const allowed = await this.resolveAuthorizedSucs(ctx);
    if (allowed.includes(this.normalizeText(suc).toUpperCase())) return;
    throw new ForbiddenException(`No autorizado para la sucursal ${suc}.`);
  }

  private async assertDocAccess(
    sucEnt: string,
    sucSal: string,
    ctx: UserContext,
    estatus?: string,
  ) {
    if (ctx.isAdmin || this.isInventoryRole(ctx.roleCode)) return;
    const allowed = await this.resolveAuthorizedSucs(ctx);
    if (this.normalizeText(estatus).toUpperCase() === 'REVISANDO') {
      if (allowed.includes(this.normalizeText(sucEnt).toUpperCase())) return;
      throw new ForbiddenException(
        'Documento en revision solo disponible para la sucursal solicitante.',
      );
    }
    if (
      allowed.includes(this.normalizeText(sucEnt).toUpperCase()) ||
      allowed.includes(this.normalizeText(sucSal).toUpperCase())
    ) {
      return;
    }
    throw new ForbiddenException('Documento fuera de sucursales autorizadas.');
  }

  private isInventoryRole(roleCode: string) {
    return TransferenciasService.INVENTORY_ROLE_CODES.has(
      this.normalizeText(roleCode).toUpperCase(),
    );
  }

  private resolveStatusLimit(ctx: UserContext) {
    return (
      TransferenciasService.STATUS_LIMITS_BY_ROLE.get(
        this.normalizeText(ctx.roleCode).toUpperCase(),
      ) ?? []
    );
  }

  private assertInventoryRole(ctx: UserContext) {
    if (ctx.isAdmin || this.isInventoryRole(ctx.roleCode)) return;
    throw new ForbiddenException('Accion reservada a inventarios/admin.');
  }

  private assertInventoryChiefRole(ctx: UserContext) {
    const roleCode = this.normalizeText(ctx.roleCode).toUpperCase();
    if (
      ctx.isAdmin ||
      ctx.roleId === 2 ||
      roleCode === 'INVJEF' ||
      roleCode === 'JEFE_INVENTARIOS'
    ) {
      return;
    }
    throw new ForbiddenException('Accion reservada a jefe de inventarios.');
  }

  private assertHeaderEditable(estatus: string) {
    if (estatus === 'BORRADOR') return;
    throw new BadRequestException('Documento no editable en estatus actual.');
  }

  private assertEvidenceImage(dataUrl: string) {
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!match?.[1]) {
      throw new BadRequestException('La evidencia debe ser una imagen valida.');
    }
    let bytes = 0;
    try {
      bytes = Buffer.from(match[1], 'base64').length;
    } catch {
      throw new BadRequestException('La evidencia no se pudo leer.');
    }
    if (bytes <= 500) {
      throw new BadRequestException(
        'La evidencia debe ser una imagen mayor a 500 bytes.',
      );
    }
    if (bytes > 500 * 1024) {
      throw new BadRequestException('La evidencia no debe exceder 500 KB.');
    }
  }

  private async assertTransferEvidenceComplete(doc: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 ID
      FROM dbo.TRAN_EVID
      WHERE DOC = @0
      ORDER BY FCN DESC, ID DESC
      `,
      [this.requireText(doc, 'doc')],
    );
    if (!rows?.length) {
      throw new BadRequestException(
        'Debe adjuntar una evidencia del documento antes de enviar a transito.',
      );
    }
  }

  private throwSqlBusinessError(
    error: unknown,
    fallbackMessage: string,
  ): never {
    const message = this.extractSqlMessage(error) ?? fallbackMessage;
    throw new BadRequestException(message);
  }

  private extractSqlMessage(error: unknown) {
    if (error instanceof QueryFailedError) {
      const driver = (error as { driverError?: { message?: unknown } })
        .driverError;
      const sqlMessage = this.normalizeText(driver?.message ?? '');
      if (sqlMessage) return sqlMessage.replace(/\s+/g, ' ').trim();
    }
    return null;
  }
}
