import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AddTransferenciaDetailDto } from './dto/add-transferencia-detail.dto';
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
    ['AUX', ['BORRADOR', 'PREPARACION', 'TRANSITO', 'REVISANDO']],
    ['ENC_SUCURSAL', ['BORRADOR', 'PREPARACION', 'TRANSITO', 'REVISANDO']],
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
        `(UPPER(LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT)))) IN (${placeholders.join(', ')}) OR UPPER(LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL)))) IN (${placeholders.join(', ')}))`,
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

  async findOne(docRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(header.sucEnt, header.sucSal, ctx);
    const detalle = await this.fetchDetalle(doc, header.sucSal, header.sucEnt);
    const paqueteria = await this.fetchPaqueteria(doc);
    return { ...header, detalle, paqueteria };
  }

  async create(dto: CreateTransferenciaDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.roleCode === 'INVJEF') {
      throw new ForbiddenException('Jefe de inventarios no crea solicitudes.');
    }
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
    await this.assertDocAccess(header.sucEnt, header.sucSal, ctx);
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
    await this.assertDocAccess(header.sucEnt, header.sucSal, ctx);
    this.assertHeaderEditable(header.estatus);
    const art = this.requireText(dto.art, 'art');
    if (dto.ctd <= 0) throw new BadRequestException('ctd debe ser mayor a 0.');

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
      [art, header.sucSal, header.sucEnt],
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
    await this.assertDocAccess(header.sucEnt, header.sucSal, ctx);
    const currentRows = await this.dataSource.query(
      `SELECT TOP 1 * FROM dbo.TRAN_DET_ART WHERE DOC=@0 AND IDPD=@1 AND ISNULL(BLOQ, 0) <> -1`,
      [doc, idpd],
    );
    if (!currentRows?.length) throw new NotFoundException('Detalle no existe.');
    const art = this.normalizeText(currentRows[0].ART);
    const ctoRows = await this.dataSource.query(
      `SELECT TOP 1 TRY_CONVERT(FLOAT, ISNULL(CTOP, 0)) AS CTOP FROM dbo.DAT_ART WHERE LTRIM(RTRIM(ISNULL(SUC, ''))) = @0 AND LTRIM(RTRIM(ISNULL(ART, ''))) = @1`,
      [header.sucSal, art],
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
      if (header.estatus !== 'TRANSITO') {
        throw new BadRequestException('ctdR solo se captura en TRANSITO.');
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
    if (dto.txt !== undefined) {
      setParts.push(`TXT=@${params.length}`);
      params.push(this.normalizeNullable(dto.txt));
    }
    if (!setParts.length) return this.findOne(doc, user);

    await this.dataSource.query(
      `UPDATE dbo.TRAN_DET_ART SET ${setParts.join(', ')} WHERE DOC=@0 AND IDPD=@1`,
      params,
    );
    await this.dataSource.query(`EXEC dbo.sp_trans_recalcular @DOC=@0`, [doc]);
    return this.findOne(doc, user);
  }

  async removeDetalle(docRaw: string, idpdRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const doc = this.requireText(docRaw, 'doc');
    const idpd = this.requireText(idpdRaw, 'idpd');
    const header = await this.fetchHeader(doc);
    await this.assertDocAccess(header.sucEnt, header.sucSal, ctx);
    this.assertHeaderEditable(header.estatus);
    await this.dataSource.query(
      `UPDATE dbo.TRAN_DET_ART SET BLOQ=-1 WHERE DOC=@0 AND IDPD=@1`,
      [doc, idpd],
    );
    await this.dataSource.query(`EXEC dbo.sp_trans_recalcular @DOC=@0`, [doc]);
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

  transito(doc: string, dto: TransferenciaActionDto, user: JwtPayload) {
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
    const notificationStatuses = statusLimit.length
      ? statusLimit
      : [
          'PENDIENTE',
          'LIBERADA',
          'PREPARACION',
          'TRANSITO',
          'REVISANDO',
          'INCIDENCIA',
        ];
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
        `(UPPER(LTRIM(RTRIM(ISNULL(h.SUC_ENT, h.ALM_ENT)))) IN (${placeholders.join(', ')}) OR UPPER(LTRIM(RTRIM(ISNULL(h.SUC_SAL, h.ALM_SAL)))) IN (${placeholders.join(', ')}))`,
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
          WHEN 'TRANSITO' THEN 3
          WHEN 'REVISANDO' THEN 4
          ELSE 5
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
    await this.resolveAuthorizedSucs(ctx);
    const where: string[] = [`LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @0`];
    const params: unknown[] = [sucSal];
    const search = this.normalizeText(query.search);
    if (search) {
      const searchBy = this.normalizeText(query.searchBy).toUpperCase();
      const allowedSearch: Record<string, string> = {
        ART: 'a.ART',
        UPC: 'a.UPC',
        DES: 'a.DES',
      };
      const column = allowedSearch[searchBy];
      if (column) {
        where.push(
          `UPPER(LTRIM(RTRIM(ISNULL(${column}, '')))) LIKE @${params.length}`,
        );
      } else {
        where.push(
          `(UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(a.UPC, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(a.DES, '')))) LIKE @${params.length})`,
        );
      }
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
      [...params, sucEnt, skip, limit],
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
        LTRIM(RTRIM(ISNULL(h.DOC_MB51_ENT, ''))) AS DOC_MB51_ENT
      FROM dbo.TRAN_CTR_DOCPRE h
      LEFT JOIN dbo.MOV_TRAN mt ON mt.CLAVE = h.MTV
      WHERE h.DOC = @0
      `,
      [doc],
    );
    if (!rows?.length) throw new NotFoundException(`No existe DOC ${doc}.`);
    return this.mapHeader(rows[0] as Record<string, unknown>);
  }

  private async fetchDetalle(doc: string, sucSal: string, sucEnt: string) {
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
        TRY_CONVERT(FLOAT, ISNULL(d.CTD_R, 0)) AS CTD_R,
        TRY_CONVERT(FLOAT, ISNULL(d.CTO_R, 0)) AS CTO_R,
        TRY_CONVERT(FLOAT, ISNULL(d.DIF_R, 0)) AS DIF_R,
        TRY_CONVERT(FLOAT, ISNULL(d.DIFCTO_R, 0)) AS DIFCTO_R,
        LTRIM(RTRIM(ISNULL(d.TXT, ''))) AS TXT,
        LTRIM(RTRIM(ISNULL(d.USR_L, ''))) AS USR_L,
        LTRIM(RTRIM(ISNULL(d.USR_E, ''))) AS USR_E,
        TRY_CONVERT(FLOAT, ISNULL(a.CTOP, 0)) AS CTOP
      FROM dbo.TRAN_DET_ART d
      LEFT JOIN dbo.DAT_ART a
        ON LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @1
       AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
      LEFT JOIN dbo.DAT_ART dest
        ON LTRIM(RTRIM(ISNULL(dest.SUC, ''))) = @2
       AND LTRIM(RTRIM(ISNULL(dest.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
      WHERE d.DOC = @0
        AND ISNULL(d.BLOQ, 0) <> -1
      ORDER BY d.IDPD
      `,
      [doc, sucSal, sucEnt],
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
      ctdR: this.toNumber(row.CTD_R) ?? 0,
      ctoR: this.toMoney(row.CTO_R) ?? 0,
      difR: this.toNumber(row.DIF_R) ?? 0,
      difctoR: this.toMoney(row.DIFCTO_R) ?? 0,
      txt: this.normalizeText(row.TXT),
      usrL: this.normalizeText(row.USR_L),
      usrE: this.normalizeText(row.USR_E),
      ctop: this.toMoney(row.CTOP) ?? 0,
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
      detalleActivo: this.toInt(row.DETALLE_ACTIVO) ?? 0,
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
  ) {
    if (ctx.isAdmin || this.isInventoryRole(ctx.roleCode)) return;
    const allowed = await this.resolveAuthorizedSucs(ctx);
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

  private assertHeaderEditable(estatus: string) {
    if (estatus === 'BORRADOR') return;
    throw new BadRequestException('Documento no editable en estatus actual.');
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
