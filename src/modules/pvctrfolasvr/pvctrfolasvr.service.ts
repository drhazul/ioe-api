import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { PvCtrFolAsvrEntity } from './pvctrfolasvr.entity';
import { CreatePvCtrFolAsvrDto } from './dto/create-pvctrfolasvr.dto';
import { UpdatePvCtrFolAsvrDto } from './dto/update-pvctrfolasvr.dto';
import { CreatePvCtrFolAsvrAutoDto } from './dto/create-pvctrfolasvr-auto.dto';
import { ListPvCtrFolAsvrQueryDto } from './dto/list-pvctrfolasvr-query.dto';
import { ListPvCtrFolAsvrReimpresionQueryDto } from './dto/list-pvctrfolasvr-reimpresion-query.dto';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  inferOrigenAut,
  normalizeAut,
  normalizeEstadoOperativo,
} from './pv-folio-homologation.util';

@Injectable()
export class PvCtrFolAsvrService {
  constructor(
    @InjectRepository(PvCtrFolAsvrEntity)
    private readonly repo: Repository<PvCtrFolAsvrEntity>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async findAll(query: ListPvCtrFolAsvrQueryDto, user: JwtPayload) {
    const isAdmin = this.isAdmin(user);
    const actorSuc = this.normalizeText(user?.suc ?? '');
    const actorOpv = this.normalizeText(user?.username ?? '');

    const requestedSuc = this.normalizeText(query?.suc ?? '');
    const requestedOpv = this.normalizeText(query?.opv ?? '');
    const search = this.normalizeText(query?.search ?? '');
    const targetOpv = requestedOpv.length > 0 ? requestedOpv : actorOpv;

    const suc = requestedSuc || (isAdmin ? '' : actorSuc);
    const actorOpvUpper = this.normalizeUpper(actorOpv);
    const requestedOpvUpper = this.normalizeUpper(requestedOpv);
    const requestedOpvIsActor =
      requestedOpvUpper.length > 0 && requestedOpvUpper === actorOpvUpper;
    const runOwnScope = isAdmin || !requestedOpv || requestedOpvIsActor;
    const isCrossOpvQuery =
      !isAdmin && requestedOpv.length > 0 && !requestedOpvIsActor;

    if (
      !isAdmin &&
      requestedSuc &&
      this.normalizeUpper(requestedSuc) !== this.normalizeUpper(actorSuc)
    ) {
      throw new ForbiddenException(
        'No autorizado para consultar otra sucursal',
      );
    }
    if (!isAdmin && suc.length == 0) {
      throw new BadRequestException(
        'No se pudo resolver sucursal para consultar cotizaciones',
      );
    }
    if (!isAdmin && actorOpv.length == 0) {
      throw new BadRequestException(
        'No se pudo resolver OPV para consultar cotizaciones',
      );
    }
    if (
      isCrossOpvQuery &&
      search.length === 0 &&
      !this.looksLikeOpvSearch(requestedOpv)
    ) {
      throw new ForbiddenException(
        'No autorizado para consultar cotizaciones de otro OPV',
      );
    }

    const queryRows = async (
      where: string[],
      params: unknown[],
    ): Promise<Record<string, unknown>[]> => {
      const rows = await this.dataSource.query(
        `
        SELECT
          a.*,
          c.RazonSocialReceptor AS RazonSocialReceptor
        FROM dbo.PV_CTR_FOL_ASVR a
        LEFT JOIN dbo.FACT_CLIENT_SHP c ON a.CLIEN = c.IDC
        WHERE ${where.join(' AND ')}
        ORDER BY a.FCN DESC, a.TRA DESC;
        `,
        params,
      );
      return (rows ?? []) as Record<string, unknown>[];
    };

    let ownRows: Record<string, unknown>[] = [];
    if (runOwnScope) {
      const ownParams: unknown[] = [];
      const ownWhere: string[] = [
        "a.AUT IN ('CA','VF','CP')",
        "a.ESTA IN ('PENDIENTE','EDITANDO','PAGADO')",
      ];

      if (suc.length > 0) {
        ownWhere.push(`a.SUC = @${ownParams.length}`);
        ownParams.push(suc);
      }

      if (targetOpv.length > 0) {
        ownWhere.push(
          `(a.OPV = @${ownParams.length} OR a.OPVM = @${ownParams.length})`,
        );
        ownParams.push(targetOpv);
      }

      if (search.length > 0) {
        const like = `%${search}%`;
        ownWhere.push(
          `(a.IDFOL LIKE @${ownParams.length} OR ISNULL(a.IDFOLINICIAL, '') LIKE @${ownParams.length} OR ISNULL(c.RazonSocialReceptor, '') LIKE @${ownParams.length} OR CAST(ISNULL(a.CLIEN, 0) AS NVARCHAR(50)) LIKE @${ownParams.length})`,
        );
        ownParams.push(like);
      }

      ownRows = await queryRows(ownWhere, ownParams);
    }

    const shouldQueryCrossScope =
      !isAdmin && (search.length > 0 || (requestedOpv.length > 0 && !requestedOpvIsActor));
    let crossRows: Record<string, unknown>[] = [];

    if (shouldQueryCrossScope) {
      const crossParams: unknown[] = [];
    const crossWhere: string[] = [
      "a.AUT = 'CP'",
      "a.ESTA = 'PENDIENTE'",
    ];

      if (suc.length > 0) {
        crossWhere.push(`a.SUC = @${crossParams.length}`);
        crossParams.push(suc);
      }

      crossWhere.push(
        `(ISNULL(LTRIM(RTRIM(a.OPV)), '') <> @${crossParams.length} AND ISNULL(LTRIM(RTRIM(a.OPVM)), '') <> @${crossParams.length})`,
      );
      crossParams.push(actorOpv);

      const crossSearchWhere = this.buildCrossScopeSearchWhere({
        requestedOpv,
        requestedOpvIsActor,
        search,
        params: crossParams,
      });
      if (crossSearchWhere.length > 0) {
        crossWhere.push(...crossSearchWhere);
      }

      crossRows = await queryRows(crossWhere, crossParams);
    }

    const dedup = new Map<string, Record<string, unknown>>();
    for (const row of [...ownRows, ...crossRows]) {
      const idfol = this.normalizeText(String(row.IDFOL ?? ''));
      if (!idfol) continue;
      if (!dedup.has(idfol)) dedup.set(idfol, row);
    }

    const items = Array.from(dedup.values());
    await Promise.all(
      items.map((row) => this.regularizeHistoricalFolioRow(row)),
    );
    return items;
  }

  async findForReimpresion(query: ListPvCtrFolAsvrReimpresionQueryDto) {
    const suc = this.normalizeText(query?.suc ?? '');
    const opv = this.normalizeText(query?.opv ?? '');
    const search = this.normalizeText(query?.search ?? '');
    const fcnm = this.normalizeText(query?.fcnm ?? '');
    const pageSize = Math.min(20, Math.max(1, Number(query?.pageSize ?? 20) || 20));
    const pageRequested = Math.max(1, Number(query?.page ?? 1) || 1);

    const hasCriteria = fcnm.length > 0 || search.length > 0 || opv.length > 0;
    if (!hasCriteria) {
      return {
        data: [],
        total: 0,
        page: pageRequested,
        pageSize,
        totalPages: 0,
      };
    }

    const params: unknown[] = [];
    const where: string[] = ["a.ESTA = 'MB51PROCES'"];

    if (suc.length > 0) {
      where.push(`a.SUC = @${params.length}`);
      params.push(suc);
    }

    if (opv.length > 0) {
      where.push(
        `(a.OPV = @${params.length} OR a.OPVM = @${params.length})`,
      );
      params.push(opv);
    }

    if (fcnm.length > 0) {
      const normalizedDate = this.parseSqlDate(fcnm, 'fcnm');
      where.push(`CAST(a.FCNM AS DATE) = @${params.length}`);
      params.push(normalizedDate);
    }

    if (search.length > 0) {
      where.push(
        `(a.IDFOL LIKE @${params.length} OR ISNULL(a.IDFOLINICIAL, '') LIKE @${params.length} OR ISNULL(c.RazonSocialReceptor, '') LIKE @${params.length} OR CAST(ISNULL(a.CLIEN, 0) AS NVARCHAR(50)) LIKE @${params.length} OR ISNULL(a.OPV, '') LIKE @${params.length} OR ISNULL(a.OPVM, '') LIKE @${params.length})`,
      );
      params.push(`%${search}%`);
    }

    const totalRows = await this.dataSource.query(
      `
      SELECT COUNT(1) AS total
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON a.CLIEN = c.IDC
      WHERE ${where.join(' AND ')};
      `,
      params,
    );
    const total = this.toInt(totalRows?.[0]?.total ?? totalRows?.[0]?.TOTAL);
    const totalPages = total <= 0 ? 0 : Math.ceil(total / pageSize);
    const page = totalPages > 0 ? Math.min(pageRequested, totalPages) : pageRequested;
    if (total <= 0) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        totalPages,
      };
    }

    const offset = (page - 1) * pageSize;
    const rows = await this.dataSource.query(
      `
      SELECT
        a.*,
        c.RazonSocialReceptor AS RazonSocialReceptor
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON a.CLIEN = c.IDC
      WHERE ${where.join(' AND ')}
      ORDER BY a.FCNM DESC
      OFFSET @${params.length} ROWS
      FETCH NEXT @${params.length + 1} ROWS ONLY;
      `,
      [...params, offset, pageSize],
    );

    return {
      data: ((rows ?? []) as Record<string, unknown>[]),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async findOneForRead(idfol: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        a.*,
        c.RazonSocialReceptor AS RazonSocialReceptor
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON a.CLIEN = c.IDC
      WHERE a.IDFOL = @0
         OR a.IDFOLINICIAL = @0
      ORDER BY CASE WHEN a.IDFOL = @0 THEN 0 ELSE 1 END, a.FCN DESC, a.FCNM DESC;
      `,
      [idfol],
    );
    const row = rows?.[0];
    if (!row) throw new NotFoundException(`PV_CTR_FOL_ASVR ${idfol} no existe`);
    await this.regularizeHistoricalFolioRow(row as Record<string, unknown>);
    return row;
  }

  async findOne(idfol: string) {
    const resolvedIdfol = await this.resolveCurrentIdfol(idfol);
    const row = await this.repo.findOne({ where: { IDFOL: resolvedIdfol } });
    if (!row) throw new NotFoundException(`PV_CTR_FOL_ASVR ${idfol} no existe`);
    return row;
  }

  async create(dto: CreatePvCtrFolAsvrDto) {
    const exists = await this.repo.exist({ where: { IDFOL: dto.IDFOL } });
    if (exists) throw new ConflictException(`IDFOL ${dto.IDFOL} ya existe`);

    const aut = normalizeAut(dto.AUT ?? 'CP');
    const esta = normalizeEstadoOperativo(dto.ESTA ?? 'PENDIENTE');
    const idfolInicial =
      String(dto.IDFOLINICIAL ?? dto.IDFOL ?? '').trim() || dto.IDFOL;
    const origenAut = inferOrigenAut({
      aut,
      origenAut: dto.ORIGEN_AUT,
      fallback: 'CA',
    });

    const entity = this.repo.create({
      IDFOL: dto.IDFOL,
      CLIEN: dto.CLIEN ?? null,
      DOC: dto.DOC ?? null,
      FCN: dto.FCN ? new Date(dto.FCN) : null,
      SUC: dto.SUC ?? null,
      TER: dto.TER ?? null,
      TRA: dto.TRA ?? null,
      OPV: dto.OPV ?? null,
      ESTA: esta,
      IMPT: dto.IMPT ?? null,
      FPGO: dto.FPGO ?? null,
      IMPP: dto.IMPP ?? null,
      AUT: aut,
      REQF: this.normalizeReqf(dto.REQF),
      FCNM: dto.FCNM ? new Date(dto.FCNM) : null,
      OPVM: dto.OPVM ?? null,
      MOD: dto.MOD ?? null,
      IDFOLORIG: dto.IDFOLORIG ?? null,
      IDFOLINICIAL: idfolInicial,
      ORIGEN_AUT: origenAut,
    });

    return this.repo.save(entity);
  }

  async createAuto(dto: CreatePvCtrFolAsvrAutoDto, user: JwtPayload) {
    const isAdmin = this.isAdmin(user);
    const actorSuc = this.normalizeText(user?.suc ?? '');
    const actorOpv =
      this.normalizeText(user?.username ?? '') ||
      this.normalizeText(String(user?.sub ?? ''));

    const requestedSuc = this.normalizeText(dto?.SUC ?? '');
    const requestedOpv = this.normalizeText(dto?.OPV ?? '');
    const suc = requestedSuc || actorSuc;
    const opv = requestedOpv || actorOpv;

    if (!isAdmin && actorSuc.length === 0) {
      throw new ForbiddenException('Usuario sin sucursal');
    }
    if (!isAdmin && actorOpv.length === 0) {
      throw new BadRequestException('OPV requerida');
    }
    if (
      !isAdmin &&
      requestedSuc &&
      this.normalizeUpper(requestedSuc) !== this.normalizeUpper(actorSuc)
    ) {
      throw new ForbiddenException(
        'No autorizado para crear cotizaciones en otra sucursal',
      );
    }
    if (
      !isAdmin &&
      requestedOpv &&
      this.normalizeUpper(requestedOpv) !== this.normalizeUpper(actorOpv)
    ) {
      throw new ForbiddenException(
        'No autorizado para crear cotizaciones con otro OPV',
      );
    }
    if (!suc) throw new ForbiddenException('Usuario sin sucursal');
    if (!opv) throw new BadRequestException('OPV requerida');

    const ter = this.normalizeText(dto?.TER ?? '') || null;

    let result: any[];
    try {
      result = await this.dataSource.query(
        `
        DECLARE @IDFOL_OUT NVARCHAR(255);
        DECLARE @TRA_OUT INT;
        EXEC dbo.sp_pvctrfolasvr_create
          @SUC=@0,
          @OPV=@1,
          @TER=@2,
          @IDFOL_OUT=@IDFOL_OUT OUTPUT,
          @TRA_OUT=@TRA_OUT OUTPUT;
        SELECT @IDFOL_OUT AS IDFOL, @TRA_OUT AS TRA;
        `,
        [suc, opv, ter],
      );
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo crear PV_CTR_FOL_ASVR: ${err?.message ?? 'error inesperado'}`,
      );
    }

    const firstRow = result?.[0] ?? null;
    let idfol: any =
      firstRow?.IDFOL ?? firstRow?.Idfol ?? firstRow?.idfol ?? null;
    if (!idfol && firstRow) {
      const key = Object.keys(firstRow).find(
        (k) => k.toLowerCase() === 'idfol',
      );
      if (key) idfol = firstRow[key];
    }

    if (!idfol || String(idfol).trim().length === 0) {
      throw new ConflictException('No se pudo generar IDFOL');
    }

    const rows = await this.dataSource.query(
      `SELECT TOP 1 * FROM ${this.repo.metadata.tablePath} WHERE IDFOL = @0`,
      [idfol],
    );
    if (!rows?.length)
      throw new NotFoundException(`PV_CTR_FOL_ASVR ${idfol} no existe`);

    await this.regularizeHistoricalFolioRow(rows[0] as Record<string, unknown>);
    return rows[0];
  }

  async update(idfol: string, dto: UpdatePvCtrFolAsvrDto) {
    const row = await this.findOne(idfol);

    const partial: Partial<PvCtrFolAsvrEntity> = {};
    if (dto.CLIEN !== undefined) partial.CLIEN = dto.CLIEN ?? null;
    if (dto.DOC !== undefined) partial.DOC = dto.DOC ?? null;
    if (dto.FCN !== undefined) partial.FCN = dto.FCN ? new Date(dto.FCN) : null;
    if (dto.SUC !== undefined) partial.SUC = dto.SUC ?? null;
    if (dto.TER !== undefined) partial.TER = dto.TER ?? null;
    if (dto.TRA !== undefined) partial.TRA = dto.TRA ?? null;
    if (dto.OPV !== undefined) partial.OPV = dto.OPV ?? null;
    if (dto.ESTA !== undefined)
      partial.ESTA = normalizeEstadoOperativo(dto.ESTA ?? 'PENDIENTE');
    if (dto.IMPT !== undefined) partial.IMPT = dto.IMPT ?? null;
    if (dto.FPGO !== undefined) partial.FPGO = dto.FPGO ?? null;
    if (dto.IMPP !== undefined) partial.IMPP = dto.IMPP ?? null;
    if (dto.AUT !== undefined) partial.AUT = normalizeAut(dto.AUT);
    if (dto.REQF !== undefined) partial.REQF = this.normalizeReqf(dto.REQF);
    if (dto.FCNM !== undefined)
      partial.FCNM = dto.FCNM ? new Date(dto.FCNM) : null;
    if (dto.OPVM !== undefined) partial.OPVM = dto.OPVM ?? null;
    if (dto.MOD !== undefined) partial.MOD = dto.MOD ?? null;
    if (dto.IDFOLORIG !== undefined) partial.IDFOLORIG = dto.IDFOLORIG ?? null;
    if (dto.IDFOLINICIAL !== undefined)
      partial.IDFOLINICIAL = String(dto.IDFOLINICIAL ?? '').trim() || row.IDFOL;
    if (dto.ORIGEN_AUT !== undefined)
      partial.ORIGEN_AUT = inferOrigenAut({
        aut: dto.AUT ?? row.AUT,
        origenAut: dto.ORIGEN_AUT,
        fallback: inferOrigenAut({ aut: row.AUT, origenAut: row.ORIGEN_AUT }),
      });

    const merged = this.repo.merge(row, partial);
    merged.IDFOLINICIAL =
      String(merged.IDFOLINICIAL ?? '').trim() || merged.IDFOL;
    merged.ORIGEN_AUT = inferOrigenAut({
      aut: merged.AUT,
      origenAut: merged.ORIGEN_AUT,
      fallback: 'CA',
    });

    return this.repo.save(merged);
  }

  async remove(idfol: string) {
    const row = await this.findOne(idfol);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar PV_CTR_FOL_ASVR ${idfol} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, IDFOL: idfol };
  }

  private parseIds(...values: Array<string | undefined>) {
    const out: number[] = [];
    for (const value of values) {
      if (!value) continue;
      for (const part of value.split(',')) {
        const n = Number(part.trim());
        if (Number.isFinite(n)) out.push(n);
      }
    }
    return out;
  }

  private isAdmin(user?: JwtPayload | null) {
    const username = this.normalizeUpper(user?.username ?? '');
    if (username === 'ADMIN') return true;

    const roleId = Number(user?.roleId ?? 0);
    const nivel = Number(user?.nivel ?? 0);

    const adminRoleIds = this.parseIds(
      this.config.get<string>('ADMIN_ROLE_IDS'),
      this.config.get<string>('ADMIN_ROLE_ID'),
      process.env.ADMIN_ROLE_IDS,
      process.env.ADMIN_ROLE_ID,
    );
    const adminNiveles = this.parseIds(
      this.config.get<string>('ADMIN_NIVELES'),
      this.config.get<string>('ADMIN_NIVEL'),
      process.env.ADMIN_NIVELES,
      process.env.ADMIN_NIVEL,
    );

    const roleAllowed = (adminRoleIds.length ? adminRoleIds : [1]).includes(
      roleId,
    );
    const nivelAllowed =
      adminNiveles.length > 0 && adminNiveles.includes(nivel);

    return roleAllowed || nivelAllowed;
  }

  private normalizeText(value: string) {
    return String(value ?? '').trim();
  }

  private normalizeReqf(value: number | null | undefined): number | null {
    if (value == null) return null;
    return Number(value) === 1 ? 1 : 0;
  }

  private normalizeUpper(value: string) {
    return this.normalizeText(value).toUpperCase();
  }

  private parseSqlDate(value: string, fieldName: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${fieldName} invalido`);
    }
    const [yy, mm, dd] = value.split('-').map((part) => Number(part));
    const parsed = new Date(yy, mm - 1, dd);
    if (
      parsed.getFullYear() !== yy ||
      parsed.getMonth() !== mm - 1 ||
      parsed.getDate() !== dd
    ) {
      throw new BadRequestException(`${fieldName} invalido`);
    }
    return `${yy.toString().padStart(4, '0')}-${mm.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;
  }

  private toInt(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private buildCrossScopeSearchWhere(input: {
    requestedOpv: string;
    requestedOpvIsActor: boolean;
    search: string;
    params: unknown[];
  }): string[] {
    const where: string[] = [];
    const crossByRequestedOpv =
      input.requestedOpv && !input.requestedOpvIsActor
        ? this.normalizeText(input.requestedOpv)
        : '';
    if (crossByRequestedOpv) {
      where.push(
        `(a.OPV = @${input.params.length} OR a.OPVM = @${input.params.length})`,
      );
      input.params.push(crossByRequestedOpv);
    }

    const search = this.normalizeText(input.search);
    if (!search) return where;

    if (this.looksLikeOpvSearch(search) && !crossByRequestedOpv) {
      where.push(
        `(a.OPV = @${input.params.length} OR a.OPVM = @${input.params.length})`,
      );
      input.params.push(search);
      return where;
    }

    if (this.looksLikeIdFolSearch(search)) {
      where.push(
        `(a.IDFOL = @${input.params.length} OR ISNULL(a.IDFOLINICIAL, '') = @${input.params.length})`,
      );
      input.params.push(search);
      return where;
    }

    if (this.looksLikeClientSearch(search)) {
      where.push(
        `(CAST(TRY_CONVERT(BIGINT, a.CLIEN) AS NVARCHAR(50)) = @${input.params.length} OR CAST(ISNULL(a.CLIEN, 0) AS NVARCHAR(50)) = @${input.params.length})`,
      );
      input.params.push(search);
      return where;
    }

    const like = `%${search}%`;
    where.push(
      `(a.IDFOL LIKE @${input.params.length} OR ISNULL(a.IDFOLINICIAL, '') LIKE @${input.params.length} OR ISNULL(c.RazonSocialReceptor, '') LIKE @${input.params.length} OR CAST(ISNULL(a.CLIEN, 0) AS NVARCHAR(50)) LIKE @${input.params.length})`,
    );
    input.params.push(like);
    return where;
  }

  private looksLikeIdFolSearch(value: string) {
    const text = this.normalizeText(value);
    if (text.length < 6 || text.includes(' ')) return false;
    const hasValidChars = /^[A-Za-z0-9_-]+$/.test(text);
    const hasDigit = /\d/.test(text);
    return hasValidChars && hasDigit;
  }

  private looksLikeClientSearch(value: string) {
    const text = this.normalizeText(value);
    return /^\d+$/.test(text) && text.length !== 4;
  }

  private looksLikeOpvSearch(value: string) {
    const text = this.normalizeText(value);
    return /^\d{4}$/.test(text);
  }

  private async resolveCurrentIdfol(idfol: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 IDFOL
      FROM dbo.PV_CTR_FOL_ASVR
      WHERE IDFOL = @0
         OR IDFOLINICIAL = @0
      ORDER BY CASE WHEN IDFOL = @0 THEN 0 ELSE 1 END, FCN DESC, FCNM DESC;
      `,
      [idfol],
    );
    const resolved = this.normalizeText(String(rows?.[0]?.IDFOL ?? ''));
    if (!resolved) {
      throw new NotFoundException(`PV_CTR_FOL_ASVR ${idfol} no existe`);
    }
    return resolved;
  }

  private async regularizeHistoricalFolioRow(row: Record<string, unknown>) {
    const idfol = this.normalizeText(String(row?.IDFOL ?? ''));
    if (!idfol) return;

    const currentInicial = this.normalizeText(String(row?.IDFOLINICIAL ?? ''));
    const currentAut = normalizeAut(row?.AUT ?? '');
    const currentEsta = this.normalizeUpper(String(row?.ESTA ?? ''));
    const currentOrigen = this.normalizeUpper(String(row?.ORIGEN_AUT ?? ''));

    const nextInicial = currentInicial || idfol;
    const nextEsta = normalizeEstadoOperativo(currentEsta || 'PENDIENTE');
    const nextOrigen = inferOrigenAut({
      aut: currentAut,
      origenAut: currentOrigen,
      fallback: 'CA',
    });

    const needsUpdate =
      currentInicial !== nextInicial ||
      currentEsta !== nextEsta ||
      currentOrigen !== nextOrigen;

    if (!needsUpdate) return;

    await this.dataSource.query(
      `
      UPDATE dbo.PV_CTR_FOL_ASVR
      SET
        IDFOLINICIAL = @1,
        ORIGEN_AUT = @2,
        ESTA = @3
      WHERE IDFOL = @0
      `,
      [idfol, nextInicial, nextOrigen, nextEsta],
    );

    row.IDFOLINICIAL = nextInicial;
    row.ORIGEN_AUT = nextOrigen;
    row.ESTA = nextEsta;
  }

}
