import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AddSugeridoDetalleDto } from './dto/add-sugerido-detalle.dto';
import { CreateSugeridoOrdenDto } from './dto/create-sugerido-orden.dto';
import { SugeridoActionDto } from './dto/sugerido-action.dto';
import { SugeridosCalculoQueryDto } from './dto/sugeridos-calculo-query.dto';
import { SugeridosQueryDto } from './dto/sugeridos-query.dto';
import { UpdateSugeridoDetalleDto } from './dto/update-sugerido-detalle.dto';

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
export class SugeridosService {
  private static readonly MODULE_CODES = ['DAT_JAA_SUG', 'DAT_ORD_COMP'];
  private static readonly INVENTORY_CHIEF_CODES = new Set([
    'INVJEF',
    'JEFE_INVENTARIOS',
  ]);

  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: SugeridosQueryDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const { page, limit, skip } = this.normalizePagination(
      query.page,
      query.limit,
    );
    const where: string[] = [];
    const params: unknown[] = [];

    await this.pushSucScope(where, params, ctx, query.suc);

    const search = this.normalizeText(query.search);
    if (search) {
      where.push(
        `(LTRIM(RTRIM(ISNULL(h.NPED, ''))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(p.ALIAS, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(h.USR, '')))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }

    const estatus = this.normalizeText(query.estatus).toUpperCase();
    if (estatus) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) = @${params.length}`,
      );
      params.push(estatus);
    }

    if (query.prov != null && query.prov > 0) {
      where.push(`TRY_CONVERT(INT, h.NPROV) = @${params.length}`);
      params.push(query.prov);
    }

    const from = this.normalizeDate(query.from);
    if (from) {
      where.push(
        `CONVERT(date, ISNULL(h.FCNP, GETDATE())) >= @${params.length}`,
      );
      params.push(from);
    }
    const to = this.normalizeDate(query.to);
    if (to) {
      where.push(
        `CONVERT(date, ISNULL(h.FCNP, GETDATE())) <= @${params.length}`,
      );
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await this.dataSource.query(
      `
      SELECT COUNT(1) AS total
      FROM dbo.REC_CAB_PED h
      LEFT JOIN dbo.DAT_PROVD p ON TRY_CONVERT(INT, h.NPROV) = p.ID
      ${whereSql}
      `,
      params,
    );
    const rows = await this.dataSource.query(
      `
      SELECT
        h.NPED, h.SUC, h.TIPO, h.NPROV, h.USR, h.FCNP, h.FCNC, h.IMPP,
        h.NART, h.FCNR, h.ESTATUS, h.SUG, p.ALIAS, p.RSOC,
        ISNULL(det.DETALLE_ACTIVO, 0) AS DETALLE_ACTIVO
      FROM dbo.REC_CAB_PED h
      LEFT JOIN dbo.DAT_PROVD p ON TRY_CONVERT(INT, h.NPROV) = p.ID
      OUTER APPLY (
        SELECT COUNT(1) AS DETALLE_ACTIVO
        FROM dbo.REC_DET_PED d
        WHERE d.NPED = h.NPED AND ISNULL(d.BLOQ, 0) <> -1
      ) det
      ${whereSql}
      ORDER BY TRY_CONVERT(BIGINT, h.NPED) DESC, h.FCNP DESC
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

  async calcular(query: SugeridosCalculoQueryDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const suc = this.normalizeText(query.suc).toUpperCase();
    await this.assertSucAllowed(suc, ctx);
    const page = Math.max(1, this.toInt(query.page) ?? 1);
    const limit = Math.min(500, Math.max(1, this.toInt(query.limit) ?? 100));
    const rows = await this.dataSource.query(
      `
      EXEC dbo.sp_sugeridos_calcular
        @SUC = @0,
        @PROV = @1,
        @MARCA = @2,
        @TIPO = @3,
        @DEPA = @4,
        @SUBD = @5,
        @CLAS = @6,
        @SCLA = @7,
        @SCLA2 = @8,
        @DIAS = @9,
        @PAGE = @10,
        @LIMIT = @11
      `,
      [
        suc,
        query.prov ?? null,
        this.emptyToNull(query.marca),
        this.emptyToNull(query.tipo),
        query.depa ?? null,
        query.subd ?? null,
        query.clas ?? null,
        query.scla ?? null,
        query.scla2 ?? null,
        query.dias ?? 90,
        page,
        limit,
      ],
    );
    return {
      items: (rows ?? []).map((row: Record<string, unknown>) =>
        this.mapCalculo(row),
      ),
      total: this.toInt(rows?.[0]?.TOTAL_COUNT) ?? 0,
      page,
      limit,
    };
  }

  async create(dto: CreateSugeridoOrdenDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const suc = this.normalizeText(dto.suc).toUpperCase();
    await this.assertSucAllowed(suc, ctx);
    try {
      const rows = await this.dataSource.query(
        `
        EXEC dbo.sp_sugeridos_crear_oc
          @SUC = @0,
          @NPROV = @1,
          @USR = @2,
          @TIPO = @3,
          @SUG = @4,
          @ITEMS_JSON = @5
        `,
        [
          suc,
          dto.nprov,
          ctx.username,
          this.normalizeText(dto.tipo || 'NORMAL') || 'NORMAL',
          dto.sugerido === false ? 0 : 1,
          JSON.stringify(
            dto.items.map((item) => ({
              art: this.normalizeText(item.art),
              ctdped: item.ctdped,
              cto: item.cto,
              uncom: this.normalizeText(item.uncom),
            })),
          ),
        ],
      );
      const nped = this.normalizeText(rows?.[0]?.NPED ?? rows?.[0]?.nped);
      return this.findOne(nped, user);
    } catch (error) {
      this.throwSqlBusinessError(error, 'No se pudo crear la orden.');
    }
  }

  async findOne(nped: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const header = await this.getHeader(nped);
    await this.assertDocAccess(header.suc, ctx);
    const detailRows = await this.dataSource.query(
      `
      SELECT
        d.BLOQ, d.RECI, d.POS, d.DREC, d.IDPED, d.NPED, d.ART, d.CTO,
        d.CTDPED, d.UNCOM, d.CTDREC, a.DES, a.UPC,
        CASE WHEN ISNULL(d.BLOQ, 0) = -1 THEN 0 ELSE TRY_CONVERT(MONEY, ISNULL(d.CTO, 0) * ISNULL(d.CTDPED, 0)) END AS CTOT
      FROM dbo.REC_DET_PED d
      LEFT JOIN dbo.DAT_ART a
        ON a.SUC = @1 AND a.ART = d.ART
      WHERE d.NPED = @0
      ORDER BY ISNULL(d.POS, 0), d.IDPED
      `,
      [header.nped, header.suc],
    );
    return {
      ...header,
      detalle: (detailRows ?? []).map((row: Record<string, unknown>) =>
        this.mapDetail(row),
      ),
    };
  }

  async addDetalle(nped: string, dto: AddSugeridoDetalleDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const header = await this.getHeader(nped);
    await this.assertDocAccess(header.suc, ctx);
    this.assertEditable(header.estatus);
    const artInfo = await this.resolveArticuloForProvider(
      header.suc,
      dto.art,
      header.nprov,
    );
    const cto = dto.cto ?? artInfo.cto;
    const uncom = this.normalizeText(dto.uncom || artInfo.uncom);
    if (cto == null) {
      throw new BadRequestException('No se pudo resolver costo de proveedor.');
    }
    await this.dataSource.transaction(async (manager) => {
      const posRows = await manager.query(
        `SELECT ISNULL(MAX(ISNULL(POS, 0)), 0) + 1 AS POS FROM dbo.REC_DET_PED WHERE NPED = @0`,
        [header.nped],
      );
      const pos = this.toInt(posRows?.[0]?.POS) ?? 1;
      await manager.query(
        `
        INSERT INTO dbo.REC_DET_PED (BLOQ, RECI, POS, DREC, IDPED, NPED, ART, CTO, CTDPED, UNCOM, CTDREC)
        VALUES (0, 0, @0, NULL, @1, @2, @3, @4, @5, @6, NULL)
        `,
        [
          pos,
          `${pos}-${header.nped}`,
          header.nped,
          this.normalizeText(dto.art),
          cto,
          dto.ctdped,
          uncom || null,
        ],
      );
      await this.recalculateHeader(manager, header.nped);
    });
    return this.findOne(header.nped, user);
  }

  async updateDetalle(
    nped: string,
    idped: string,
    dto: UpdateSugeridoDetalleDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const header = await this.getHeader(nped);
    await this.assertDocAccess(header.suc, ctx);
    this.assertEditable(header.estatus);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (dto.ctdped != null) {
      sets.push(`CTDPED = @${params.length}`);
      params.push(dto.ctdped);
    }
    if (dto.cto != null) {
      sets.push(`CTO = @${params.length}`);
      params.push(dto.cto);
    }
    if (dto.uncom != null) {
      sets.push(`UNCOM = @${params.length}`);
      params.push(this.normalizeText(dto.uncom) || null);
    }
    if (!sets.length) return this.findOne(header.nped, user);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE dbo.REC_DET_PED
        SET ${sets.join(', ')}
        WHERE NPED = @${params.length} AND IDPED = @${params.length + 1}
        `,
        [...params, header.nped, idped],
      );
      await this.recalculateHeader(manager, header.nped);
    });
    return this.findOne(header.nped, user);
  }

  async removeDetalle(nped: string, idped: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const header = await this.getHeader(nped);
    await this.assertDocAccess(header.suc, ctx);
    this.assertEditable(header.estatus);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE dbo.REC_DET_PED SET BLOQ = -1 WHERE NPED = @0 AND IDPED = @1`,
        [header.nped, idped],
      );
      await this.recalculateHeader(manager, header.nped);
    });
    return this.findOne(header.nped, user);
  }

  async enviar(nped: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const header = await this.getHeader(nped);
    await this.assertDocAccess(header.suc, ctx);
    this.assertEditable(header.estatus);
    if (header.detalleActivo <= 0) {
      throw new BadRequestException('La orden no tiene detalle activo.');
    }
    await this.setStatus(header.nped, 'PENDIENTE');
    return this.findOne(header.nped, user);
  }

  async autorizar(nped: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertInventoryChiefRole(ctx);
    const header = await this.getHeader(nped);
    await this.assertDocAccess(header.suc, ctx);
    if (header.estatus !== 'PENDIENTE') {
      throw new BadRequestException('Solo se autorizan ordenes pendientes.');
    }
    await this.setStatus(header.nped, 'PROCESADO', true);
    return this.findOne(header.nped, user);
  }

  async rechazar(nped: string, _dto: SugeridoActionDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertInventoryChiefRole(ctx);
    const header = await this.getHeader(nped);
    await this.assertDocAccess(header.suc, ctx);
    if (header.estatus !== 'PENDIENTE') {
      throw new BadRequestException('Solo se rechazan ordenes pendientes.');
    }
    await this.setStatus(header.nped, 'ABIERTO');
    return this.findOne(header.nped, user);
  }

  async anular(nped: string, _dto: SugeridoActionDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const header = await this.getHeader(nped);
    await this.assertDocAccess(header.suc, ctx);
    if (!['ABIERTO', 'PENDIENTE'].includes(header.estatus)) {
      throw new BadRequestException('La orden ya no permite anulacion.');
    }
    await this.setStatus(header.nped, 'ANULADO');
    return this.findOne(header.nped, user);
  }

  async catalogSucursales(user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.isAdmin) {
      const rows = await this.dataSource.query(
        `SELECT SUC FROM dbo.DAT_SUC ORDER BY SUC`,
      );
      return (rows ?? []).map((row: Record<string, unknown>) =>
        this.normalizeText(row.SUC),
      );
    }
    return this.resolveAuthorizedSucs(ctx);
  }

  async catalogProveedores() {
    const rows = await this.dataSource.query(
      `
      SELECT ID, RSOC, ALIAS
      FROM dbo.DAT_PROVD
      WHERE ISNULL(BLOQ, 0) <> -1
      ORDER BY ALIAS, RSOC, ID
      `,
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      id: this.toInt(row.ID) ?? 0,
      rsoc: this.normalizeText(row.RSOC),
      alias: this.normalizeText(row.ALIAS),
    }));
  }

  async catalogEstatus() {
    const rows = await this.dataSource.query(
      `
      SELECT [DESC] AS estatus
      FROM dbo.ESTATUS_SUG
      WHERE ISNULL(ACTIVO, 1) = 1
      ORDER BY ORDEN, [DESC]
      `,
    );
    return (rows ?? []).map((row: Record<string, unknown>) =>
      this.normalizeText(row.estatus).toUpperCase(),
    );
  }

  async catalogArticulosProveedor(
    sucRaw: string,
    provRaw: string,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const suc = this.requireText(sucRaw, 'suc').toUpperCase();
    const prov = this.toInt(provRaw);
    if (!prov || prov <= 0) {
      throw new BadRequestException('Proveedor requerido.');
    }
    await this.assertSucAllowed(suc, ctx);
    const rows = await this.dataSource.query(
      `
      SELECT
        a.ART,
        a.DES,
        a.UPC,
        a.UN_COMP,
        CASE
          WHEN TRY_CONVERT(INT, a.PROV_1) = @1 THEN a.CTO_PROV1
          WHEN TRY_CONVERT(INT, a.PROV_2) = @1 THEN a.CTO_PROV2
          WHEN TRY_CONVERT(INT, a.PROV_3) = @1 THEN a.CTO_PROV3
          ELSE a.CTOP
        END AS CTO
      FROM dbo.DAT_ART a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @0
        AND ISNULL(a.BLOQ, 0) <> -1
        AND (
          TRY_CONVERT(INT, a.PROV_1) = @1
          OR TRY_CONVERT(INT, a.PROV_2) = @1
          OR TRY_CONVERT(INT, a.PROV_3) = @1
        )
      ORDER BY a.DES, a.ART
      `,
      [suc, prov],
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      art: this.normalizeText(row.ART),
      des: this.normalizeText(row.DES),
      upc: this.normalizeText(row.UPC),
      unComp: this.normalizeText(row.UN_COMP),
      cto: this.toMoney(row.CTO) ?? 0,
    }));
  }

  private async getHeader(npedRaw: string) {
    const nped = this.requireText(npedRaw, 'nped');
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        h.NPED, h.SUC, h.TIPO, h.NPROV, h.USR, h.FCNP, h.FCNC, h.IMPP,
        h.NART, h.FCNR, h.ESTATUS, h.SUG, p.ALIAS, p.RSOC,
        ISNULL(det.DETALLE_ACTIVO, 0) AS DETALLE_ACTIVO
      FROM dbo.REC_CAB_PED h
      LEFT JOIN dbo.DAT_PROVD p ON TRY_CONVERT(INT, h.NPROV) = p.ID
      OUTER APPLY (
        SELECT COUNT(1) AS DETALLE_ACTIVO
        FROM dbo.REC_DET_PED d
        WHERE d.NPED = h.NPED AND ISNULL(d.BLOQ, 0) <> -1
      ) det
      WHERE h.NPED = @0
      `,
      [nped],
    );
    if (!rows?.length) throw new NotFoundException('Orden no encontrada.');
    return this.mapHeader(rows[0]);
  }

  private async resolveArticuloForProvider(
    suc: string,
    art: string,
    nprov: number,
  ) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        ART,
        UN_COMP,
        CASE
          WHEN TRY_CONVERT(INT, PROV_1) = @2 THEN CTO_PROV1
          WHEN TRY_CONVERT(INT, PROV_2) = @2 THEN CTO_PROV2
          WHEN TRY_CONVERT(INT, PROV_3) = @2 THEN CTO_PROV3
          ELSE CTOP
        END AS CTO
      FROM dbo.DAT_ART
      WHERE UPPER(LTRIM(RTRIM(SUC))) = @0
        AND LTRIM(RTRIM(ART)) = @1
        AND ISNULL(BLOQ, 0) <> -1
      `,
      [
        this.normalizeText(suc).toUpperCase(),
        this.requireText(art, 'art'),
        nprov,
      ],
    );
    if (!rows?.length) throw new NotFoundException('Articulo no encontrado.');
    return {
      cto: this.toMoney(rows[0].CTO),
      uncom: this.normalizeText(rows[0].UN_COMP),
    };
  }

  private async recalculateHeader(
    manager: Pick<DataSource, 'query'>,
    nped: string,
  ) {
    await manager.query(
      `
      UPDATE h
      SET
        IMPP = x.IMPP,
        NART = x.NART
      FROM dbo.REC_CAB_PED h
      CROSS APPLY (
        SELECT
          TRY_CONVERT(MONEY, SUM(ISNULL(d.CTO, 0) * ISNULL(d.CTDPED, 0))) AS IMPP,
          COUNT(1) AS NART
        FROM dbo.REC_DET_PED d
        WHERE d.NPED = h.NPED AND ISNULL(d.BLOQ, 0) <> -1
      ) x
      WHERE h.NPED = @0
      `,
      [nped],
    );
  }

  private async setStatus(nped: string, estatus: string, close = false) {
    await this.dataSource.query(
      `
      UPDATE dbo.REC_CAB_PED
      SET ESTATUS = @1, FCNC = CASE WHEN @2 = 1 THEN GETDATE() ELSE FCNC END
      WHERE NPED = @0
      `,
      [nped, estatus, close ? 1 : 0],
    );
  }

  private async pushSucScope(
    where: string[],
    params: unknown[],
    ctx: UserContext,
    sucRaw?: string,
  ) {
    const suc = this.normalizeText(sucRaw).toUpperCase();
    if (ctx.isAdmin) {
      if (suc) {
        where.push(
          `UPPER(LTRIM(RTRIM(ISNULL(h.SUC, '')))) = @${params.length}`,
        );
        params.push(suc);
      }
      return;
    }
    const allowed = await this.resolveAuthorizedSucs(ctx);
    if (suc) {
      if (!allowed.includes(suc)) {
        where.push('1 = 0');
        return;
      }
      where.push(`UPPER(LTRIM(RTRIM(ISNULL(h.SUC, '')))) = @${params.length}`);
      params.push(suc);
      return;
    }
    const placeholders = allowed.map((_, i) => `@${params.length + i}`);
    where.push(
      `UPPER(LTRIM(RTRIM(ISNULL(h.SUC, '')))) IN (${placeholders.join(', ')})`,
    );
    params.push(...allowed);
  }

  private async resolveUserContext(
    user?: JwtPayload | null,
  ): Promise<UserContext> {
    const raw = (user ?? {}) as Record<string, unknown>;
    const userId = Number(raw.sub ?? raw.idUsuario ?? 0);
    const roleId = Number(raw.roleId ?? raw.idRol ?? raw.IDROL ?? 0);
    const username = this.normalizeText(raw.username);
    const suc = this.normalizeText(raw.suc).toUpperCase();
    const isAdmin =
      roleId === 1 || roleId === 0 || username.toUpperCase() === 'ADMIN';
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

  private async resolveAuthorizedSucs(ctx: UserContext) {
    if (ctx.isAdmin) return [] as string[];
    const moduleParams = SugeridosService.MODULE_CODES.map(
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
      [ctx.username.toUpperCase(), ...SugeridosService.MODULE_CODES],
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

  private async assertSucAllowed(suc: string, ctx: UserContext) {
    if (ctx.isAdmin) return;
    const normalized = this.normalizeText(suc).toUpperCase();
    const allowed = await this.resolveAuthorizedSucs(ctx);
    if (allowed.includes(normalized)) return;
    throw new ForbiddenException(`No autorizado para la sucursal ${suc}.`);
  }

  private async assertDocAccess(suc: string, ctx: UserContext) {
    await this.assertSucAllowed(suc, ctx);
  }

  private assertInventoryChiefRole(ctx: UserContext) {
    const roleCode = this.normalizeText(ctx.roleCode).toUpperCase();
    if (
      ctx.isAdmin ||
      ctx.roleId === 2 ||
      SugeridosService.INVENTORY_CHIEF_CODES.has(roleCode)
    ) {
      return;
    }
    throw new ForbiddenException('Accion reservada a jefe de inventarios.');
  }

  private assertEditable(estatus: string) {
    if (estatus === 'ABIERTO') return;
    throw new BadRequestException('Orden no editable en estatus actual.');
  }

  private mapHeader(row: Record<string, unknown>) {
    return {
      nped: this.normalizeText(row.NPED),
      suc: this.normalizeText(row.SUC).toUpperCase(),
      tipo: this.normalizeText(row.TIPO),
      nprov: this.toInt(row.NPROV) ?? 0,
      usr: this.normalizeText(row.USR),
      fcnp: this.toIsoDate(row.FCNP),
      fcnc: this.toIsoDate(row.FCNC),
      impp: this.toMoney(row.IMPP) ?? 0,
      nart: this.toInt(row.NART) ?? 0,
      fcnr: this.toIsoDate(row.FCNR),
      estatus: this.normalizeText(row.ESTATUS).toUpperCase(),
      sug: (this.toInt(row.SUG) ?? 0) !== 0,
      alias: this.normalizeText(row.ALIAS),
      rsoc: this.normalizeText(row.RSOC),
      detalleActivo: this.toInt(row.DETALLE_ACTIVO) ?? 0,
    };
  }

  private mapDetail(row: Record<string, unknown>) {
    return {
      bloq: this.toInt(row.BLOQ) ?? 0,
      reci: this.toInt(row.RECI) ?? 0,
      pos: this.toInt(row.POS) ?? 0,
      drec: this.normalizeText(row.DREC),
      idped: this.normalizeText(row.IDPED),
      nped: this.normalizeText(row.NPED),
      art: this.normalizeText(row.ART),
      cto: this.toMoney(row.CTO) ?? 0,
      ctdped: this.toNumber(row.CTDPED) ?? 0,
      uncom: this.normalizeText(row.UNCOM),
      ctdrec: this.toNumber(row.CTDREC) ?? 0,
      des: this.normalizeText(row.DES),
      upc: this.normalizeText(row.UPC),
      ctot: this.toMoney(row.CTOT) ?? 0,
    };
  }

  private mapCalculo(row: Record<string, unknown>) {
    return {
      jerarquiaLarga: this.normalizeText(row.DESCRIPCION_LARGA_JERARQUIA),
      suc: this.normalizeText(row.SUC).toUpperCase(),
      tipo: this.normalizeText(row.TIPO),
      art: this.normalizeText(row.ART),
      upc: this.normalizeText(row.UPC),
      des: this.normalizeText(row.DES),
      base: this.normalizeText(row.BASE),
      sph: this.toNumber(row.SPH) ?? 0,
      cyl: this.toNumber(row.CYL) ?? 0,
      adic: this.toNumber(row.ADIC) ?? 0,
      stock: this.toNumber(row.STOCK) ?? 0,
      stockMin: this.toNumber(row.STOCK_MIN) ?? 0,
      estatus: this.normalizeText(row.ESTATUS).toUpperCase(),
      diaReabasto: this.toNumber(row.DIA_REABASTO) ?? 0,
      pvta: this.toMoney(row.PVTA) ?? 0,
      ctop: this.toMoney(row.CTOP) ?? 0,
      nprov: this.toInt(row.NPROV) ?? 0,
      nivelProv: this.toInt(row.NIVEL_PROV) ?? 0,
      cto: this.toMoney(row.CTO) ?? 0,
      unComp: this.normalizeText(row.UN_COMP),
      factComp: this.toNumber(row.FACT_COMP) ?? 1,
      vta90: this.toNumber(row.VTA_90) ?? 0,
      factVtaPD: this.toNumber(row.FACT_VTA_P_D) ?? 0,
      diasInv: this.toNumber(row.DIAS_INV) ?? 0,
      facReab: this.toNumber(row.FAC_REAB) ?? 0,
      sug: this.toNumber(row.SUG) ?? 0,
      pedido: this.toNumber(row.PEDIDO) ?? 0,
      ped: this.toNumber(row.PED) ?? 0,
      cantFinalCompra: this.toNumber(row.CANT_FINAL_COMPRA) ?? 0,
      importe: this.toMoney(row.IMPORTE) ?? 0,
    };
  }

  private normalizePagination(pageRaw?: number, limitRaw?: number) {
    const page = Math.max(1, this.toInt(pageRaw) ?? 1);
    const limit = Math.min(200, Math.max(1, this.toInt(limitRaw) ?? 30));
    return { page, limit, skip: (page - 1) * limit };
  }

  private requireText(value: unknown, name: string) {
    const text = this.normalizeText(value);
    if (!text) throw new BadRequestException(`${name} es requerido.`);
    return text;
  }

  private normalizeText(value?: unknown) {
    return `${value ?? ''}`.trim();
  }

  private emptyToNull(value?: unknown) {
    const text = this.normalizeText(value);
    return text ? text : null;
  }

  private normalizeDate(value?: unknown) {
    const text = this.normalizeText(value);
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new BadRequestException(`Fecha invalida: ${text}`);
    }
    return text;
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
