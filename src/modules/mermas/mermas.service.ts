import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AddMermaDetailDto } from './dto/add-merma-detail.dto';
import { AnularMermaDto } from './dto/anular-merma.dto';
import { AuditarMermaDto } from './dto/auditar-merma.dto';
import { CreateMermaDto } from './dto/create-merma.dto';
import { MermaCatalogArticulosQueryDto } from './dto/merma-catalog-articulos-query.dto';
import { MermaQueryDto } from './dto/merma-query.dto';
import { MermaReporteQueryDto } from './dto/merma-reporte-query.dto';
import { RevisarMermaDto } from './dto/revisar-merma.dto';
import { UpdateMermaDetailDto } from './dto/update-merma-detail.dto';
import { UpdateMermaDto } from './dto/update-merma.dto';

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
export class MermasService {
  private static readonly INVENTORY_ROLE_CODES = new Set([
    'INVJEF',
    'ANALISTA_INV',
    'JEFE_INVENTARIOS',
    'ANALISTA_INVENTARIOS',
  ]);
  private static readonly MERMA_MODULE_CODES = [
    'DAT_JAA_MERM',
    'DAT_JAA_MEM',
    'DAT_CONSU_MERMA',
    'DAT_AUDIT_MERMA',
  ];

  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: MermaQueryDto, user: JwtPayload, readOnly: boolean) {
    const ctx = await this.resolveUserContext(user);
    const { page, limit, skip } = this.normalizePagination(
      query.page,
      query.limit,
    );
    const where: string[] = [];
    const params: unknown[] = [];

    if (!ctx.isAdmin) {
      this.ensureSuc(ctx);
      where.push(`LTRIM(RTRIM(ISNULL(m.SUC, ''))) = @${params.length}`);
      params.push(ctx.suc);
    } else if (this.normalizeText(query.suc)) {
      where.push(`LTRIM(RTRIM(ISNULL(m.SUC, ''))) = @${params.length}`);
      params.push(this.normalizeText(query.suc));
    }

    const docmer = this.normalizeText(query.docmer);
    if (docmer) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(m.DOCMER,'')))) LIKE @${params.length}`,
      );
      params.push(`%${docmer.toUpperCase()}%`);
    }

    const usuario = this.normalizeText(query.usuario);
    if (usuario) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(m.[USER],'')))) LIKE @${params.length}`,
      );
      params.push(`%${usuario.toUpperCase()}%`);
    }

    const search = this.normalizeText(query.search);
    if (search) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(m.DOCMER,'')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(m.[USER],'')))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }

    const estatusFilter = this.normalizeText(query.estatus).toUpperCase();
    if (estatusFilter) {
      where.push(`${this.statusLabelSql('m')} = @${params.length}`);
      params.push(estatusFilter);
    }

    const from = this.normalizeDate(query.from);
    if (from) {
      where.push(
        `CONVERT(date, ISNULL(m.FCND, GETDATE())) >= @${params.length}`,
      );
      params.push(from);
    }
    const to = this.normalizeDate(query.to);
    if (to) {
      where.push(
        `CONVERT(date, ISNULL(m.FCND, GETDATE())) <= @${params.length}`,
      );
      params.push(to);
    }

    if (!readOnly) {
      where.push(`${this.statusIdSql('m')} <> 6`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRows = await this.dataSource.query(
      `SELECT COUNT(1) AS total FROM dbo.DOC_CTRL_MERMA m ${whereSql}`,
      params,
    );
    const total = Number(totalRows?.[0]?.total ?? totalRows?.[0]?.TOTAL ?? 0);

    const dataRows = await this.dataSource.query(
      `
      SELECT
        m.DOCMER,
        LTRIM(RTRIM(ISNULL(m.SUC, ''))) AS SUC,
        LTRIM(RTRIM(ISNULL(m.[USER], ''))) AS [USER],
        m.FCND,
        m.FCNC,
        ${this.statusIdSql('m')} AS ID_ESTATUS,
        ${this.statusLabelSql('m')} AS ESTATUS,
        TRY_CONVERT(FLOAT, ISNULL(m.NARTS, 0)) AS NARTS,
        TRY_CONVERT(FLOAT, ISNULL(m.TOTAL, 0)) AS TOTAL,
        LTRIM(RTRIM(ISNULL(m.TXT, ''))) AS TXT,
        ISNULL(det.DETALLE_ACTIVO, 0) AS DETALLE_ACTIVO
      FROM dbo.DOC_CTRL_MERMA m
      OUTER APPLY (
        SELECT COUNT(1) AS DETALLE_ACTIVO
        FROM dbo.DET_ART_MERMA d
        WHERE d.DOCMER = m.DOCMER
          AND ISNULL(d.BLOQ, 0) <> -1
      ) det
      ${whereSql}
      ORDER BY TRY_CONVERT(BIGINT, m.DOCMER) DESC, LTRIM(RTRIM(ISNULL(m.DOCMER, ''))) DESC
      OFFSET @${params.length} ROWS
      FETCH NEXT @${params.length + 1} ROWS ONLY
      `,
      [...params, skip, limit],
    );

    return {
      items: (dataRows ?? []).map((row: Record<string, unknown>) => ({
        docmer: this.normalizeText(row.DOCMER),
        suc: this.normalizeText(row.SUC),
        user: this.normalizeText(row.USER),
        fcnd: this.toIsoDate(row.FCND),
        fcnc: this.toIsoDate(row.FCNC),
        idEstatus: this.toInt(row.ID_ESTATUS) ?? 0,
        estatus: this.normalizeText(row.ESTATUS),
        narts: this.toNumber(row.NARTS) ?? 0,
        total: this.toMoney(row.TOTAL) ?? 0,
        txt: this.normalizeText(row.TXT),
        detalleActivo: this.toInt(row.DETALLE_ACTIVO) ?? 0,
      })),
      total,
      page,
      limit,
    };
  }

  async findOne(docmerRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    const detalle = await this.fetchDetalle(docmer);
    return { ...header, detalle };
  }

  async listGestionCabecerasAbiertas(user: JwtPayload, sucRaw?: string) {
    const ctx = await this.resolveUserContext(user);
    const requestedSuc = this.normalizeText(sucRaw).toUpperCase();
    const allowedStatuses = this.gestionAllowedStatusesByRole(ctx);
    const statusParams = allowedStatuses.map((_, i) => `@${i}`).join(', ');
    const params: unknown[] = [...allowedStatuses];
    let whereSucSql = '';

    if (ctx.isAdmin) {
      if (requestedSuc) {
        whereSucSql = `AND UPPER(LTRIM(RTRIM(ISNULL(m.SUC, '')))) = @${params.length}`;
        params.push(requestedSuc);
      }
    } else {
      const authorizedSucs = await this.resolveAuthorizedSucsForMerma(ctx);
      const allowedSet = new Set(authorizedSucs);
      const canUseRequestedSuc = requestedSuc && allowedSet.has(requestedSuc);

      if (canUseRequestedSuc) {
        whereSucSql = `AND UPPER(LTRIM(RTRIM(ISNULL(m.SUC, '')))) = @${params.length}`;
        params.push(requestedSuc);
      } else {
        const sucParams = authorizedSucs
          .map((_, i) => `@${params.length + i}`)
          .join(', ');
        whereSucSql = `AND UPPER(LTRIM(RTRIM(ISNULL(m.SUC, '')))) IN (${sucParams})`;
        params.push(...authorizedSucs);
      }
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        m.DOCMER,
        m.FCND,
        ${this.statusLabelSql('m')} AS ESTATUS,
        m.SUC
      FROM dbo.DOC_CTRL_MERMA m
      WHERE ${this.statusLabelSql('m')} IN (${statusParams})
        ${whereSucSql}
      ORDER BY m.FCND DESC
      `,
      params,
    );

    return (rows ?? []).map((row: Record<string, unknown>) => ({
      docmer: this.normalizeText(row.DOCMER),
      fcnd: this.toIsoDate(row.FCND),
      estats: this.normalizeText(row.ESTATUS).toUpperCase(),
      suc: this.normalizeText(row.SUC),
    }));
  }

  async findOneConsulta(docmerRaw: string, user: JwtPayload) {
    return this.findOne(docmerRaw, user);
  }

  async create(dto: CreateMermaDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const suc = await this.resolveTargetSuc(dto.suc, ctx);
    const txt = this.normalizeNullable(dto.txt);
    const areaM = this.normalizeNullable(dto.areaM);

    const rows = await this.dataSource.query(
      `EXEC dbo.sp_merma_crear @SUC=@0, @USER=@1, @AREAM=@2, @TXT=@3`,
      [suc, ctx.username, null, txt],
    );
    const docmer = this.normalizeText(rows?.[0]?.DOCMER ?? rows?.[0]?.docmer);
    if (!docmer) throw new BadRequestException('No fue posible crear merma.');
    if (areaM !== null) {
      await this.dataSource.query(
        `
        UPDATE dbo.DOC_CTRL_MERMA
        SET AREAM = @1
        WHERE DOCMER = @0
        `,
        [docmer, areaM],
      );
    }
    return this.findOne(docmer, user);
  }

  async update(docmerRaw: string, dto: UpdateMermaDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    this.assertEditableStatus(header.idEstatus);
    if (!ctx.isAdmin && this.isInventoryRole(ctx.roleCode)) {
      throw new ForbiddenException(
        'Inventarios no edita cabecera en ABIERTO/REVISAR.',
      );
    }
    await this.dataSource.query(
      `
      UPDATE dbo.DOC_CTRL_MERMA
      SET AREAM = COALESCE(@1, AREAM),
          TXT = COALESCE(@2, TXT),
          FCNM = GETDATE()
      WHERE DOCMER = @0
      `,
      [
        docmer,
        this.normalizeNullable(dto.areaM),
        this.normalizeNullable(dto.txt),
      ],
    );
    return this.findOne(docmer, user);
  }

  async remove(docmerRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    if (header.idEstatus === 5 || header.idEstatus === 6) {
      throw new BadRequestException(
        'No se puede eliminar un documento contabilizado o auditado.',
      );
    }

    const detailRows = await this.dataSource.query(
      `
      SELECT COUNT(1) AS TOTAL
      FROM dbo.DET_ART_MERMA
      WHERE DOCMER = @0
        AND ISNULL(BLOQ, 0) <> -1
      `,
      [docmer],
    );
    const activeDetails =
      this.toInt(detailRows?.[0]?.TOTAL ?? detailRows?.[0]?.total) ?? 0;

    // Si el documento nunca tuvo artÃ­culos activos, lo borramos fÃ­sicamente
    // para no consumir consecutivo al cancelar la creaciÃ³n.
    if (
      (header.idEstatus === 1 || header.idEstatus === 4) &&
      activeDetails <= 0
    ) {
      await this.dataSource.query(
        `
        DELETE FROM dbo.DET_ART_MERMA
        WHERE DOCMER = @0
        `,
        [docmer],
      );
      await this.dataSource.query(
        `
        DELETE FROM dbo.DOC_CTRL_MERMA
        WHERE DOCMER = @0
        `,
        [docmer],
      );
      return { deleted: true, docmer, hardDeleted: true };
    }

    await this.dataSource.query(
      `
      UPDATE dbo.DET_ART_MERMA
      SET BLOQ = -1
      WHERE DOCMER = @0
      `,
      [docmer],
    );
    await this.dataSource.query(
      `
      UPDATE dbo.DOC_CTRL_MERMA
      SET ESTATS = 'ANULADO',
          ID_ESTATUS = 3,
          FCNM = GETDATE()
      WHERE DOCMER = @0
      `,
      [docmer],
    );
    return { deleted: true, docmer };
  }

  async listDetalle(docmerRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    return this.fetchDetalle(docmer);
  }

  async addDetalle(
    docmerRaw: string,
    dto: AddMermaDetailDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    this.assertEditableStatus(header.idEstatus);
    const spRows = await this.dataSource.query(
      `EXEC dbo.sp_merma_agregar_articulo @DOCMER=@0, @ART=@1, @CTD=@2, @MOT_M=@3, @RESP_M=@4, @OBS_M=@5, @USER=@6`,
      [
        docmer,
        this.requireText(dto.art, 'art'),
        dto.ctd,
        Math.trunc(dto.motM),
        this.normalizeNullable(dto.respM),
        this.normalizeNullable(dto.obsM),
        ctx.username,
      ],
    );
    const idpd = this.normalizeText(spRows?.[0]?.IDPD ?? spRows?.[0]?.idpd);
    const areaM = this.normalizeNullable(dto.areaM);
    if (idpd && areaM !== null) {
      await this.dataSource.query(
        `
        UPDATE dbo.DET_ART_MERMA
        SET AREAM = @2
        WHERE DOCMER = @0 AND IDPD = @1
        `,
        [docmer, idpd, areaM],
      );
    }
    const eviM = this.normalizeEvidence(dto.eviM);
    if (idpd && eviM !== null) {
      await this.dataSource.query(
        `
        UPDATE dbo.DET_ART_MERMA
        SET EVI_M = @2
        WHERE DOCMER = @0 AND IDPD = @1
        `,
        [docmer, idpd, eviM],
      );
    }
    return this.findOne(docmer, user);
  }

  async updateDetalle(
    docmerRaw: string,
    idpdRaw: string,
    dto: UpdateMermaDetailDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const idpd = this.requireText(idpdRaw, 'idpd');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    this.assertEditableStatus(header.idEstatus);
    const current = await this.dataSource.query(
      `SELECT TOP 1 * FROM dbo.DET_ART_MERMA WHERE DOCMER=@0 AND IDPD=@1`,
      [docmer, idpd],
    );
    if (!current?.length) throw new NotFoundException('Detalle no encontrado.');
    const ctd = dto.ctd ?? this.toNumber(current[0].CTD) ?? 0;
    const motM = dto.motM ?? this.toNumber(current[0].MOT_M) ?? 0;
    if (ctd <= 0) throw new BadRequestException('ctd debe ser mayor a 0.');
    if (motM <= 0) throw new BadRequestException('motM es requerido.');

    const mtvRows = await this.dataSource.query(
      `SELECT TOP 1 [DESC] FROM dbo.MOT_MERMA WHERE ID=@0`,
      [Math.trunc(motM)],
    );
    if (!mtvRows?.length) throw new BadRequestException('motM no existe.');

    await this.dataSource.query(
      `
      UPDATE dbo.DET_ART_MERMA
      SET CTD=@2,
          MOT_M=@3,
          MTVMER=@4,
          AREAM=COALESCE(@5, AREAM),
          RESP_M=@6,
          OBS_M=@7,
          EVI_M=COALESCE(@8, EVI_M)
      WHERE DOCMER=@0 AND IDPD=@1
      `,
      [
        docmer,
        idpd,
        ctd,
        Math.trunc(motM),
        this.normalizeText(mtvRows[0].DESC),
        this.normalizeNullable(dto.areaM),
        this.normalizeNullable(dto.respM),
        this.normalizeNullable(dto.obsM),
        this.normalizeEvidence(dto.eviM),
      ],
    );
    await this.recalcDocumento(docmer);
    return this.findOne(docmer, user);
  }

  async removeDetalle(docmerRaw: string, idpdRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const idpd = this.requireText(idpdRaw, 'idpd');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    this.assertEditableStatus(header.idEstatus);
    await this.dataSource.query(
      `
      DELETE FROM dbo.MERMA_EVIDENCIA
      WHERE LTRIM(RTRIM(ISNULL(IDPD, ''))) = @0
      `,
      [idpd],
    );
    await this.dataSource.query(
      `DELETE FROM dbo.DET_ART_MERMA WHERE DOCMER=@0 AND IDPD=@1`,
      [docmer, idpd],
    );
    await this.recalcDocumento(docmer);
    return this.findOne(docmer, user);
  }

  async solicitarAutorizacion(docmerRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);

    if (header.idEstatus !== 1 && header.idEstatus !== 4) {
      throw new BadRequestException(
        'Solo se puede solicitar autorizacion desde ABIERTO o REVISAR.',
      );
    }

    const activeRows = await this.dataSource.query(
      `
      SELECT COUNT(1) AS TOTAL
      FROM dbo.DET_ART_MERMA d
      WHERE d.DOCMER = @0
        AND ISNULL(d.BLOQ, 0) <> -1
      `,
      [docmer],
    );
    const activeCount =
      this.toInt(activeRows?.[0]?.TOTAL ?? activeRows?.[0]?.total) ?? 0;
    if (activeCount <= 0) {
      throw new BadRequestException('Documento sin articulos activos.');
    }

    const invalidRows = await this.dataSource.query(
      `
      SELECT COUNT(1) AS TOTAL
      FROM dbo.DET_ART_MERMA d
      WHERE d.DOCMER = @0
        AND ISNULL(d.BLOQ, 0) <> -1
        AND (ISNULL(d.CTD, 0) <= 0 OR d.MOT_M IS NULL)
      `,
      [docmer],
    );
    const invalidCount =
      this.toInt(invalidRows?.[0]?.TOTAL ?? invalidRows?.[0]?.total) ?? 0;
    if (invalidCount > 0) {
      throw new BadRequestException(
        'Todos los articulos deben tener cantidad > 0 y motivo.',
      );
    }

    await this.dataSource.query(
      `
      UPDATE dbo.DOC_CTRL_MERMA
      SET ESTATS = 'PENDIENTE',
          ID_ESTATUS = 2,
          USER_R = @1,
          FCNM = GETDATE()
      WHERE DOCMER = @0
      `,
      [docmer, ctx.username],
    );
    return this.findOne(docmer, user);
  }

  async revisar(docmerRaw: string, dto: RevisarMermaDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertInventoryRole(ctx);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    try {
      await this.dataSource.query(
        `EXEC dbo.sp_merma_revisar @DOCMER=@0, @USER=@1, @OBS=@2`,
        [docmer, ctx.username, this.requireText(dto.obs, 'obs')],
      );
    } catch (error) {
      this.throwSqlBusinessError(
        error,
        'No fue posible marcar el documento en revision.',
      );
    }
    return this.findOne(docmer, user);
  }

  async contabilizar(docmerRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertInventoryRole(ctx);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    try {
      await this.dataSource.query(
        `EXEC dbo.sp_merma_contabilizar @DOCMER=@0, @USER=@1`,
        [docmer, ctx.username],
      );
    } catch (error) {
      this.throwSqlBusinessError(
        error,
        'No fue posible contabilizar el documento.',
      );
    }
    return this.findOne(docmer, user);
  }

  async anular(docmerRaw: string, dto: AnularMermaDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertInventoryRole(ctx);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    try {
      await this.dataSource.query(
        `EXEC dbo.sp_merma_anular @DOCMER=@0, @USER=@1, @OBS=@2`,
        [docmer, ctx.username, this.requireText(dto.obs, 'obs')],
      );
    } catch (error) {
      this.throwSqlBusinessError(error, 'No fue posible anular el documento.');
    }
    return this.findOne(docmer, user);
  }

  async auditar(docmerRaw: string, dto: AuditarMermaDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertInventoryRole(ctx);
    const docmer = this.requireText(docmerRaw, 'docmer');
    const header = await this.fetchHeader(docmer);
    await this.assertDocAccess(header.suc, ctx);
    try {
      await this.dataSource.query(
        `EXEC dbo.sp_merma_auditar @DOCMER=@0, @USER=@1, @OBS_AUDIT=@2, @CONFIRM_FISICA=@3`,
        [
          docmer,
          ctx.username,
          this.normalizeNullable(dto.obsAudit),
          dto.confirmFisica ?? true,
        ],
      );
    } catch (error) {
      this.throwSqlBusinessError(error, 'No fue posible auditar el documento.');
    }
    return this.findOne(docmer, user);
  }

  async listAuditoriaPendientes(query: MermaQueryDto, user: JwtPayload) {
    const base = await this.findAll(
      {
        ...query,
        estatus: 'CONTABILIZADO',
      },
      user,
      true,
    );
    return {
      ...base,
      items: base.items.filter((x) => x.idEstatus === 5),
    };
  }

  async buildSoporte(docmerRaw: string, user: JwtPayload) {
    const one = await this.findOneConsulta(docmerRaw, user);
    return {
      docmer: one.docmer,
      suc: one.suc,
      estatus: one.estatus,
      fcnd: one.fcnd,
      fcnc: one.fcnc,
      user: one.user,
      narts: one.narts,
      total: one.total,
      txt: one.txt,
      detalle: one.detalle,
      audit: {
        fcnAud: one.fcnAud,
        userAud: one.userAud,
        obsAudit: one.obsAudit,
      },
    };
  }

  async buildEtiqueta(docmerRaw: string, user: JwtPayload) {
    const one = await this.findOneConsulta(docmerRaw, user);
    const payload = one.docmer;
    return {
      docmer: one.docmer,
      suc: one.suc,
      fechaDocumento: one.fcnd,
      fechaContabilizacion: one.fcnc,
      totalArticulos: one.narts,
      estatus: one.estatus,
      qrPayload: payload,
      barcode: one.docmer,
    };
  }

  async catalogMotivos() {
    const rows = await this.dataSource.query(
      `
      SELECT m.ID, m.[DESC], m.ID_CLAS, c.[DESC] AS CLAS_DESC, m.REQUIERE_EVIDENCIA
      FROM dbo.MOT_MERMA m
      LEFT JOIN dbo.CLAS_MERMA c ON c.ID = m.ID_CLAS
      ORDER BY m.[DESC] ASC
      `,
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      id: this.toInt(row.ID) ?? 0,
      desc: this.normalizeText(row.DESC),
      idClas: this.toInt(row.ID_CLAS) ?? 0,
      clasDesc: this.normalizeText(row.CLAS_DESC),
      requiereEvidencia: this.toBool(row.REQUIERE_EVIDENCIA),
    }));
  }

  async catalogClasificaciones() {
    const rows = await this.dataSource.query(
      `SELECT ID, [DESC] FROM dbo.CLAS_MERMA ORDER BY [DESC] ASC`,
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      id: this.toInt(row.ID) ?? 0,
      desc: this.normalizeText(row.DESC),
    }));
  }

  async catalogEstatus() {
    const rows = await this.dataSource.query(
      `SELECT ID, [DESC] FROM dbo.ESTATUS_MERMA ORDER BY ID ASC`,
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      id: this.toInt(row.ID) ?? 0,
      desc: this.normalizeText(row.DESC),
    }));
  }

  async catalogAreas() {
    const rows = await this.dataSource.query(
      `
      SELECT
        TRY_CONVERT(INT, d.IDDEPTO) AS ID,
        LTRIM(RTRIM(ISNULL(d.NOMBRE, ''))) AS [DESC]
      FROM dbo.DEPARTAMENTO d
      WHERE ISNULL(d.ACTIVO, 1) = 1
        AND LTRIM(RTRIM(ISNULL(d.NOMBRE, ''))) <> ''
      ORDER BY LTRIM(RTRIM(ISNULL(d.NOMBRE, ''))) ASC
      `,
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      id: this.toInt(row.ID) ?? 0,
      desc: this.normalizeText(row.DESC),
    }));
  }

  async catalogSucursales(user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const allowedSucs = ctx.isAdmin
      ? null
      : await this.resolveAuthorizedSucsForMerma(ctx);
    const params: unknown[] = [];
    let whereAllowed = '';
    if (allowedSucs && allowedSucs.length > 0) {
      const placeholders = allowedSucs.map((_, i) => `@${i}`).join(', ');
      whereAllowed = `AND LTRIM(RTRIM(ISNULL(s.SUC, ''))) IN (${placeholders})`;
      params.push(...allowedSucs);
    }

    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT
        LTRIM(RTRIM(ISNULL(s.SUC, ''))) AS SUC
      FROM dbo.DAT_SUC s
      WHERE LTRIM(RTRIM(ISNULL(s.SUC, ''))) <> ''
        ${whereAllowed}
      ORDER BY LTRIM(RTRIM(ISNULL(s.SUC, ''))) ASC
      `,
      params,
    );
    return (rows ?? [])
      .map((row: Record<string, unknown>) => this.normalizeText(row.SUC))
      .filter((suc) => suc.length > 0);
  }

  async catalogArticulos(
    query: MermaCatalogArticulosQueryDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const { page, limit, skip } = this.normalizePagination(
      query.page,
      query.limit,
    );
    const where: string[] = [`LTRIM(RTRIM(ISNULL(a.ART, ''))) <> ''`];
    const params: unknown[] = [];

    const suc = this.normalizeText(query.suc);
    if (!ctx.isAdmin) {
      this.ensureSuc(ctx);
      where.push(`LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @${params.length}`);
      params.push(ctx.suc);
    } else if (suc) {
      where.push(`LTRIM(RTRIM(ISNULL(a.SUC, ''))) = @${params.length}`);
      params.push(suc);
    }

    const addNumberEq = (col: string, value?: string) => {
      const text = this.normalizeText(value);
      if (!text) return;
      where.push(`TRY_CONVERT(FLOAT, ${col}) = @${params.length}`);
      params.push(Number(text));
    };
    addNumberEq('a.DEPA', query.depa);
    addNumberEq('a.SUBD', query.subd);
    addNumberEq('a.CLAS', query.clas);
    addNumberEq('a.SCLA', query.scla);
    addNumberEq('a.SCLA2', query.scla2);

    const addLike = (col: string, value?: string) => {
      const text = this.normalizeText(value);
      if (!text) return;
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(${col}, '')))) LIKE @${params.length}`,
      );
      params.push(`%${text.toUpperCase()}%`);
    };
    addLike('a.MARCA', query.marca);
    addLike('a.MODELO', query.modelo);
    addLike('a.UPC', query.upc);

    const search = this.normalizeText(query.search);
    if (search) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(a.UPC, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(a.DES, '')))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRows = await this.dataSource.query(
      `SELECT COUNT(1) AS total FROM dbo.DAT_ART a ${whereSql}`,
      params,
    );
    const total = Number(totalRows?.[0]?.total ?? totalRows?.[0]?.TOTAL ?? 0);
    const rows = await this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(a.ART, ''))) AS ART,
        LTRIM(RTRIM(ISNULL(a.UPC, ''))) AS UPC,
        LTRIM(RTRIM(ISNULL(a.DES, ''))) AS DES,
        TRY_CONVERT(FLOAT, a.STOCK) AS STOCK,
        TRY_CONVERT(FLOAT, a.CTOP) AS CTOP,
        LTRIM(RTRIM(ISNULL(a.SUC, ''))) AS SUC,
        TRY_CONVERT(INT, a.DEPA) AS DEPA,
        TRY_CONVERT(INT, a.SUBD) AS SUBD,
        TRY_CONVERT(INT, a.CLAS) AS CLAS,
        TRY_CONVERT(INT, a.SCLA) AS SCLA,
        TRY_CONVERT(INT, a.SCLA2) AS SCLA2,
        LTRIM(RTRIM(ISNULL(a.MARCA, ''))) AS MARCA,
        LTRIM(RTRIM(ISNULL(a.MODELO, ''))) AS MODELO
      FROM dbo.DAT_ART a
      ${whereSql}
      ORDER BY LTRIM(RTRIM(ISNULL(a.ART, ''))) ASC
      OFFSET @${params.length} ROWS
      FETCH NEXT @${params.length + 1} ROWS ONLY
      `,
      [...params, skip, limit],
    );
    return {
      items: (rows ?? []).map((row: Record<string, unknown>) => ({
        art: this.normalizeText(row.ART),
        upc: this.normalizeText(row.UPC),
        des: this.normalizeText(row.DES),
        stock: this.toNumber(row.STOCK) ?? 0,
        ctop: this.toMoney(row.CTOP) ?? 0,
        suc: this.normalizeText(row.SUC),
        depa: this.toInt(row.DEPA) ?? 0,
        subd: this.toInt(row.SUBD) ?? 0,
        clas: this.toInt(row.CLAS) ?? 0,
        scla: this.toInt(row.SCLA) ?? 0,
        scla2: this.toInt(row.SCLA2) ?? 0,
        marca: this.normalizeText(row.MARCA),
        modelo: this.normalizeText(row.MODELO),
      })),
      total,
      page,
      limit,
    };
  }

  async reporteMensual(query: MermaReporteQueryDto, user: JwtPayload) {
    const { whereSql, params } = await this.buildReportWhere(query, user);
    return this.dataSource.query(
      `
      SELECT
        FORMAT(ISNULL(m.FCNC, m.FCND), 'yyyy-MM') AS periodo,
        LTRIM(RTRIM(ISNULL(m.SUC, ''))) AS suc,
        COUNT(1) AS documentos,
        SUM(ISNULL(m.NARTS, 0)) AS cantidad,
        SUM(ISNULL(m.TOTAL, 0)) AS total
      FROM dbo.DOC_CTRL_MERMA m
      ${whereSql}
      GROUP BY FORMAT(ISNULL(m.FCNC, m.FCND), 'yyyy-MM'), LTRIM(RTRIM(ISNULL(m.SUC, '')))
      ORDER BY periodo DESC, suc ASC
      `,
      params,
    );
  }

  async reporteSucursal(query: MermaReporteQueryDto, user: JwtPayload) {
    const { whereSql, params } = await this.buildReportWhere(query, user);
    return this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(m.SUC, ''))) AS suc,
        COUNT(1) AS documentos,
        SUM(ISNULL(m.NARTS, 0)) AS articulos,
        SUM(ISNULL(m.TOTAL, 0)) AS costo
      FROM dbo.DOC_CTRL_MERMA m
      ${whereSql}
      GROUP BY LTRIM(RTRIM(ISNULL(m.SUC, '')))
      ORDER BY costo DESC
      `,
      params,
    );
  }

  async reporteTaller(query: MermaReporteQueryDto, user: JwtPayload) {
    const { whereSql, params } = await this.buildReportWhere(query, user);
    return this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(m.SUC, ''))) AS suc,
        ISNULL(mt.[DESC], LTRIM(RTRIM(ISNULL(d.MTVMER, 'SIN MOTIVO')))) AS motivo,
        COUNT(1) AS renglones,
        SUM(ISNULL(d.CTD, 0)) AS cantidad,
        SUM(ISNULL(d.CTD, 0) * ISNULL(d.CTO, 0)) AS costo
      FROM dbo.DOC_CTRL_MERMA m
      JOIN dbo.DET_ART_MERMA d
        ON d.DOCMER = m.DOCMER AND ISNULL(d.BLOQ, 0) <> -1
      LEFT JOIN dbo.MOT_MERMA mt ON mt.ID = d.MOT_M
      LEFT JOIN dbo.CLAS_MERMA cm ON cm.ID = mt.ID_CLAS
      ${whereSql}${whereSql ? ' AND' : ' WHERE'} (
        UPPER(LTRIM(RTRIM(ISNULL(cm.[DESC], '')))) = 'TALLER'
        OR UPPER(LTRIM(RTRIM(ISNULL(d.MTVMER, '')))) LIKE '%TALLER%'
      )
      GROUP BY LTRIM(RTRIM(ISNULL(m.SUC, ''))), ISNULL(mt.[DESC], LTRIM(RTRIM(ISNULL(d.MTVMER, 'SIN MOTIVO'))))
      ORDER BY costo DESC
      `,
      params,
    );
  }

  async reporteProducto(query: MermaReporteQueryDto, user: JwtPayload) {
    const { whereSql, params } = await this.buildReportWhere(query, user);
    return this.dataSource.query(
      `
      SELECT TOP 200
        LTRIM(RTRIM(ISNULL(d.ART, ''))) AS art,
        MAX(LTRIM(RTRIM(ISNULL(a.DES, '')))) AS descripcion,
        SUM(ISNULL(d.CTD, 0)) AS cantidad,
        SUM(ISNULL(d.CTD, 0) * ISNULL(d.CTO, 0)) AS costo
      FROM dbo.DOC_CTRL_MERMA m
      JOIN dbo.DET_ART_MERMA d
        ON d.DOCMER = m.DOCMER AND ISNULL(d.BLOQ, 0) <> -1
      LEFT JOIN dbo.DAT_ART a
        ON LTRIM(RTRIM(ISNULL(a.SUC, ''))) = LTRIM(RTRIM(ISNULL(d.SUC, '')))
       AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
      ${whereSql}
      GROUP BY LTRIM(RTRIM(ISNULL(d.ART, '')))
      ORDER BY costo DESC, cantidad DESC
      `,
      params,
    );
  }

  async reporteMotivos(query: MermaReporteQueryDto, user: JwtPayload) {
    const { whereSql, params } = await this.buildReportWhere(query, user);
    return this.dataSource.query(
      `
      SELECT
        ISNULL(cm.[DESC], 'SIN CLASIFICACION') AS clasificacion,
        ISNULL(mt.[DESC], LTRIM(RTRIM(ISNULL(d.MTVMER, 'SIN MOTIVO')))) AS motivo,
        SUM(ISNULL(d.CTD, 0)) AS cantidad,
        SUM(ISNULL(d.CTD, 0) * ISNULL(d.CTO, 0)) AS costo
      FROM dbo.DOC_CTRL_MERMA m
      JOIN dbo.DET_ART_MERMA d
        ON d.DOCMER = m.DOCMER AND ISNULL(d.BLOQ, 0) <> -1
      LEFT JOIN dbo.MOT_MERMA mt ON mt.ID = d.MOT_M
      LEFT JOIN dbo.CLAS_MERMA cm ON cm.ID = mt.ID_CLAS
      ${whereSql}
      GROUP BY ISNULL(cm.[DESC], 'SIN CLASIFICACION'), ISNULL(mt.[DESC], LTRIM(RTRIM(ISNULL(d.MTVMER, 'SIN MOTIVO'))))
      ORDER BY costo DESC
      `,
      params,
    );
  }

  async reporteComparativo(query: MermaReporteQueryDto, user: JwtPayload) {
    const { whereSql, params } = await this.buildReportWhere(query, user);
    return this.dataSource.query(
      `
      WITH base AS (
        SELECT
          FORMAT(ISNULL(m.FCNC, m.FCND), 'yyyy-MM') AS periodo,
          SUM(ISNULL(m.NARTS, 0)) AS cantidad,
          SUM(ISNULL(m.TOTAL, 0)) AS costo
        FROM dbo.DOC_CTRL_MERMA m
        ${whereSql}
        GROUP BY FORMAT(ISNULL(m.FCNC, m.FCND), 'yyyy-MM')
      )
      SELECT
        periodo,
        cantidad,
        costo,
        cantidad - ISNULL(LAG(cantidad) OVER (ORDER BY periodo), 0) AS varCantidad,
        costo - ISNULL(LAG(costo) OVER (ORDER BY periodo), 0) AS varCosto
      FROM base
      ORDER BY periodo DESC
      `,
      params,
    );
  }

  async reporteAnual(query: MermaReporteQueryDto, user: JwtPayload) {
    const { whereSql, params } = await this.buildReportWhere(query, user);
    return this.dataSource.query(
      `
      SELECT
        YEAR(ISNULL(m.FCNC, m.FCND)) AS anio,
        MONTH(ISNULL(m.FCNC, m.FCND)) AS mes,
        LTRIM(RTRIM(ISNULL(m.SUC, ''))) AS suc,
        SUM(ISNULL(m.NARTS, 0)) AS cantidad,
        SUM(ISNULL(m.TOTAL, 0)) AS costo
      FROM dbo.DOC_CTRL_MERMA m
      ${whereSql}
      GROUP BY YEAR(ISNULL(m.FCNC, m.FCND)), MONTH(ISNULL(m.FCNC, m.FCND)), LTRIM(RTRIM(ISNULL(m.SUC, '')))
      ORDER BY anio DESC, mes DESC, suc ASC
      `,
      params,
    );
  }

  private async buildReportWhere(
    query: MermaReporteQueryDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const where: string[] = [`${this.statusIdSql('m')} IN (5, 6)`];
    const params: unknown[] = [];

    if (!ctx.isAdmin) {
      this.ensureSuc(ctx);
      where.push(`LTRIM(RTRIM(ISNULL(m.SUC, ''))) = @${params.length}`);
      params.push(ctx.suc);
    } else if (this.normalizeText(query.suc)) {
      where.push(`LTRIM(RTRIM(ISNULL(m.SUC, ''))) = @${params.length}`);
      params.push(this.normalizeText(query.suc));
    }

    const from = this.normalizeDate(query.from);
    if (from) {
      where.push(`CONVERT(date, ISNULL(m.FCNC, m.FCND)) >= @${params.length}`);
      params.push(from);
    }
    const to = this.normalizeDate(query.to);
    if (to) {
      where.push(`CONVERT(date, ISNULL(m.FCNC, m.FCND)) <= @${params.length}`);
      params.push(to);
    }

    const estatus = this.normalizeText(query.estatus).toUpperCase();
    if (estatus) {
      where.push(`${this.statusLabelSql('m')} = @${params.length}`);
      params.push(estatus);
    }

    return {
      whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
      params,
    };
  }

  private async fetchHeader(docmer: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        m.DOCMER,
        LTRIM(RTRIM(ISNULL(m.SUC, ''))) AS SUC,
        LTRIM(RTRIM(ISNULL(m.[USER], ''))) AS [USER],
        m.FCND,
        m.FCNC,
        ${this.statusIdSql('m')} AS ID_ESTATUS,
        ${this.statusLabelSql('m')} AS ESTATUS,
        TRY_CONVERT(FLOAT, ISNULL(m.NARTS, 0)) AS NARTS,
        TRY_CONVERT(FLOAT, ISNULL(m.TOTAL, 0)) AS TOTAL,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(120), m.AREAM), ''))) AS AREAM,
        LTRIM(RTRIM(ISNULL(m.TXT, ''))) AS TXT,
        LTRIM(RTRIM(ISNULL(m.USER_A, ''))) AS USER_A,
        LTRIM(RTRIM(ISNULL(m.USER_R, ''))) AS USER_R,
        LTRIM(RTRIM(ISNULL(m.USER_AUD, ''))) AS USER_AUD,
        LTRIM(RTRIM(ISNULL(m.DOC_MB51, ''))) AS DOC_MB51,
        LTRIM(RTRIM(ISNULL(m.OBS_AUDIT, ''))) AS OBS_AUDIT,
        m.FCNAUD
      FROM dbo.DOC_CTRL_MERMA m
      WHERE LTRIM(RTRIM(ISNULL(m.DOCMER, ''))) = @0
      `,
      [docmer],
    );
    if (!rows?.length)
      throw new NotFoundException(`No existe DOCMER ${docmer}.`);
    const row = rows[0] as Record<string, unknown>;
    return {
      docmer: this.normalizeText(row.DOCMER),
      suc: this.normalizeText(row.SUC),
      user: this.normalizeText(row.USER),
      fcnd: this.toIsoDate(row.FCND),
      fcnc: this.toIsoDate(row.FCNC),
      idEstatus: this.toInt(row.ID_ESTATUS) ?? 0,
      estatus: this.normalizeText(row.ESTATUS),
      narts: this.toNumber(row.NARTS) ?? 0,
      total: this.toMoney(row.TOTAL) ?? 0,
      areaM: this.normalizeNullable(row.AREAM),
      txt: this.normalizeText(row.TXT),
      userA: this.normalizeText(row.USER_A),
      userR: this.normalizeText(row.USER_R),
      userAud: this.normalizeText(row.USER_AUD),
      docMb51: this.normalizeText(row.DOC_MB51),
      obsAudit: this.normalizeText(row.OBS_AUDIT),
      fcnAud: this.toIsoDate(row.FCNAUD),
    };
  }

  private async fetchDetalle(docmer: string) {
    const rows = await this.dataSource.query(
      `
      SELECT
        d.IDPD,
        LTRIM(RTRIM(ISNULL(d.ART, ''))) AS ART,
        LTRIM(RTRIM(ISNULL(a.DES, ''))) AS DES,
        TRY_CONVERT(FLOAT, ISNULL(d.CTD, 0)) AS CTD,
        TRY_CONVERT(FLOAT, ISNULL(d.CTO, 0)) AS CTO,
        TRY_CONVERT(FLOAT, ISNULL(d.CTD, 0) * ISNULL(d.CTO, 0)) AS CTOT,
        TRY_CONVERT(INT, d.MOT_M) AS MOT_M,
        ISNULL(mt.[DESC], LTRIM(RTRIM(ISNULL(d.MTVMER, '')))) AS MOTIVO,
        LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(120), d.AREAM), ''))) AS AREA_M,
        LTRIM(RTRIM(ISNULL(d.RESP_M, ''))) AS RESP_M,
        LTRIM(RTRIM(ISNULL(d.OBS_M, ''))) AS OBS_M,
        LTRIM(RTRIM(ISNULL(d.EVI_M, ''))) AS EVI_M,
        CASE
          WHEN ISNULL(me_count.total_evidencias, 0) > 0 THEN ISNULL(me_count.total_evidencias, 0)
          WHEN LTRIM(RTRIM(ISNULL(d.EVI_M, ''))) <> '' THEN 1
          ELSE 0
        END AS EVIDENCIAS,
        COALESCE(
          NULLIF(LTRIM(RTRIM(ISNULL(me_last.ultima_url, ''))), ''),
          NULLIF(LTRIM(RTRIM(ISNULL(d.EVI_M, ''))), '')
        ) AS EVIDENCIA_URL,
        LTRIM(RTRIM(ISNULL(me_last.ultima_mime, ''))) AS EVIDENCIA_MIME
      FROM dbo.DET_ART_MERMA d
      LEFT JOIN dbo.MOT_MERMA mt ON mt.ID = d.MOT_M
      LEFT JOIN dbo.DAT_ART a
        ON LTRIM(RTRIM(ISNULL(a.SUC, ''))) = LTRIM(RTRIM(ISNULL(d.SUC, '')))
       AND LTRIM(RTRIM(ISNULL(a.ART, ''))) = LTRIM(RTRIM(ISNULL(d.ART, '')))
      OUTER APPLY (
        SELECT COUNT(1) AS total_evidencias
        FROM dbo.MERMA_EVIDENCIA e
        WHERE LTRIM(RTRIM(ISNULL(e.IDPD, ''))) = LTRIM(RTRIM(ISNULL(d.IDPD, '')))
      ) me_count
      OUTER APPLY (
        SELECT TOP 1
          LTRIM(RTRIM(ISNULL(e.URL_ARCHIVO, ''))) AS ultima_url,
          LTRIM(RTRIM(ISNULL(e.MIME_TYPE, ''))) AS ultima_mime
        FROM dbo.MERMA_EVIDENCIA e
        WHERE LTRIM(RTRIM(ISNULL(e.IDPD, ''))) = LTRIM(RTRIM(ISNULL(d.IDPD, '')))
        ORDER BY ISNULL(e.FCN, GETDATE()) DESC, e.ID DESC
      ) me_last
      WHERE d.DOCMER = @0
        AND ISNULL(d.BLOQ, 0) <> -1
      ORDER BY d.IDPD ASC
      `,
      [docmer],
    );
    return (rows ?? []).map((row: Record<string, unknown>) => ({
      idpd: this.normalizeText(row.IDPD),
      art: this.normalizeText(row.ART),
      des: this.normalizeText(row.DES),
      ctd: this.toNumber(row.CTD) ?? 0,
      cto: this.toMoney(row.CTO) ?? 0,
      ctot: this.toMoney(row.CTOT) ?? 0,
      motM: this.toInt(row.MOT_M),
      motivo: this.normalizeText(row.MOTIVO),
      areaM: this.normalizeNullable(row.AREA_M),
      respM: this.normalizeText(row.RESP_M),
      obsM: this.normalizeText(row.OBS_M),
      evidencias: this.toInt(row.EVIDENCIAS) ?? 0,
      evidenciaUrl: this.normalizeText(row.EVIDENCIA_URL),
      evidenciaMime:
        this.normalizeText(row.EVIDENCIA_MIME) ||
        this.extractDataUrlMime(this.normalizeText(row.EVIDENCIA_URL)) ||
        this.extractDataUrlMime(this.normalizeText(row.EVI_M)),
    }));
  }

  private async recalcDocumento(docmer: string) {
    await this.dataSource.query(
      `
      UPDATE m
      SET m.NARTS = agg.narts,
          m.TOTAL = agg.total,
          m.FCNM = GETDATE()
      FROM dbo.DOC_CTRL_MERMA m
      CROSS APPLY (
        SELECT
          SUM(CASE WHEN ISNULL(d.BLOQ, 0) = -1 THEN 0 ELSE ISNULL(d.CTD, 0) END) AS narts,
          SUM(CASE WHEN ISNULL(d.BLOQ, 0) = -1 THEN 0 ELSE ISNULL(d.CTD, 0) * ISNULL(d.CTO, 0) END) AS total
        FROM dbo.DET_ART_MERMA d
        WHERE d.DOCMER = m.DOCMER
      ) agg
      WHERE m.DOCMER = @0
      `,
      [docmer],
    );
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

  private toBool(value?: unknown) {
    if (typeof value === 'boolean') return value;
    const text = this.normalizeText(value).toLowerCase();
    return text === '1' || text === 'true' || text === 'si' || text === 'yes';
  }

  private normalizeEvidence(value?: unknown) {
    const text = this.normalizeText(value);
    if (!text) return null;
    if (text.length > 700000) {
      throw new BadRequestException(
        'La evidencia excede el tamaÃ±o permitido.',
      );
    }
    const compact = text.replace(/\s+/g, '');
    const match = compact.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) {
      throw new BadRequestException(
        'Formato de evidencia invÃ¡lido. Debe ser imagen en base64.',
      );
    }
    return `data:${match[1].toLowerCase()};base64,${match[2]}`;
  }

  private extractDataUrlMime(value?: unknown) {
    const text = this.normalizeText(value);
    const match = text.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
    return match?.[1]?.toLowerCase() ?? '';
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
      if (sqlMessage) {
        const normalized = sqlMessage.replace(/\s+/g, ' ').trim();
        return normalized;
      }
    }
    return null;
  }

  private statusIdSql(alias: string) {
    return `ISNULL(${alias}.ID_ESTATUS, CASE
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${alias}.ESTATS, '')))) = 'ABIERTO' THEN 1
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${alias}.ESTATS, '')))) IN ('PENDIENTE','AUTORIZADO') THEN 2
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${alias}.ESTATS, '')))) IN ('ANULADO','CANCELADO') THEN 3
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${alias}.ESTATS, '')))) IN ('REVISAR','REVISION') THEN 4
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${alias}.ESTATS, '')))) IN ('CONTABILIZADO','COTABILIZADO','COTIBILIZADO','PROCESADO') THEN 5
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${alias}.ESTATS, '')))) = 'AUDITADO' THEN 6
      ELSE 0
    END)`;
  }

  private statusLabelSql(alias: string) {
    return `CASE ${this.statusIdSql(alias)}
      WHEN 1 THEN 'ABIERTO'
      WHEN 2 THEN 'PENDIENTE'
      WHEN 3 THEN 'ANULADO'
      WHEN 4 THEN 'REVISAR'
      WHEN 5 THEN 'CONTABILIZADO'
      WHEN 6 THEN 'AUDITADO'
      ELSE UPPER(LTRIM(RTRIM(ISNULL(${alias}.ESTATS, ''))))
    END`;
  }

  private async resolveUserContext(
    user?: JwtPayload | null,
  ): Promise<UserContext> {
    const raw = (user ?? {}) as Record<string, unknown>;
    const userId = Number(raw.sub ?? raw.idUsuario ?? 0);
    const roleId = Number(raw.roleId ?? 0);
    const username = this.normalizeText(raw.username);
    const suc = this.normalizeText(raw.suc);
    const isAdmin =
      roleId === 1 || username.toUpperCase() === 'ADMIN' || roleId === 0;

    if (!userId || !username) {
      throw new ForbiddenException('Token de usuario invalido.');
    }

    let roleCode = '';
    let roleName = '';
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(CODIGO, '')))) AS CODIGO,
        UPPER(LTRIM(RTRIM(ISNULL(NOMBRE, '')))) AS NOMBRE
      FROM dbo.ROL
      WHERE IDROL=@0
      `,
      [roleId],
    );
    roleCode = this.normalizeText(rows?.[0]?.CODIGO).toUpperCase();
    roleName = this.normalizeText(rows?.[0]?.NOMBRE).toUpperCase();

    return {
      userId,
      username,
      suc,
      roleId,
      roleCode,
      roleName,
      isAdmin,
    };
  }

  private ensureSuc(ctx: UserContext) {
    if (!ctx.suc)
      throw new ForbiddenException('Usuario sin sucursal asignada.');
  }

  private async resolveTargetSuc(sucRaw: string | undefined, ctx: UserContext) {
    const sucDto = this.normalizeText(sucRaw);
    if (ctx.isAdmin) {
      if (!sucDto)
        throw new BadRequestException('suc es requerida para admin.');
      return sucDto;
    }
    const allowedSucs = await this.resolveAuthorizedSucsForMerma(ctx);
    const allowedSet = new Set(allowedSucs);
    if (sucDto) {
      if (!allowedSet.has(sucDto.toUpperCase())) {
        throw new ForbiddenException(
          `No autorizado para la sucursal ${sucDto}.`,
        );
      }
      return sucDto;
    }
    const fallback = this.normalizeText(ctx.suc).toUpperCase();
    if (fallback && allowedSet.has(fallback)) return fallback;
    if (!allowedSucs.length) {
      throw new ForbiddenException(
        'Usuario sin sucursales autorizadas para merma.',
      );
    }
    return allowedSucs[0];
  }

  private async assertDocAccess(docSuc: string, ctx: UserContext) {
    if (ctx.isAdmin) return;
    const allowedSucs = await this.resolveAuthorizedSucsForMerma(ctx);
    if (allowedSucs.includes(this.normalizeText(docSuc).toUpperCase())) return;
    throw new ForbiddenException(
      'Documento fuera de las sucursales autorizadas.',
    );
  }

  private async resolveAuthorizedSucsForMerma(ctx: UserContext) {
    if (ctx.isAdmin) return [] as string[];
    const username = this.normalizeText(ctx.username);
    if (!username) {
      throw new ForbiddenException('Usuario sin username.');
    }

    const moduleParams = MermasService.MERMA_MODULE_CODES.map(
      (_, i) => `@${i + 1}`,
    ).join(', ');
    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(ums.SUC, '')))) AS SUC
      FROM dbo.USR_MOD_SUC ums
      WHERE UPPER(LTRIM(RTRIM(ISNULL(ums.USUARIO, '')))) = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(ums.MODULO, '')))) IN (${moduleParams})
        AND ISNULL(ums.ACTIVO, 1) = 1
        AND LTRIM(RTRIM(ISNULL(ums.SUC, ''))) <> ''
      ORDER BY UPPER(LTRIM(RTRIM(ISNULL(ums.SUC, '')))) ASC
      `,
      [username.toUpperCase(), ...MermasService.MERMA_MODULE_CODES],
    );
    const allowed = Array.from(
      new Set(
        (rows ?? [])
          .map((row: Record<string, unknown>) =>
            this.normalizeText(row.SUC).toUpperCase(),
          )
          .filter((x) => x.length > 0),
      ),
    );
    if (allowed.length > 0) return allowed;

    this.ensureSuc(ctx);
    return [this.normalizeText(ctx.suc).toUpperCase()];
  }

  private canViewAllSucursalesInGestion(ctx: UserContext) {
    if (ctx.isAdmin) return true;
    const roleName = this.normalizeText(ctx.roleName).toUpperCase();
    return (
      roleName.includes('JEFE DE INVENTARIOS') ||
      roleName.includes('JEFE DE INENTARIOS') ||
      roleName.includes('ANALISTA DE INVENTARIOS')
    );
  }

  private isInventoryRole(roleCode: string) {
    return MermasService.INVENTORY_ROLE_CODES.has(
      this.normalizeText(roleCode).toUpperCase(),
    );
  }

  private assertInventoryRole(ctx: UserContext) {
    if (ctx.isAdmin || this.isInventoryRole(ctx.roleCode)) return;
    throw new ForbiddenException('Accion reservada a inventarios/admin.');
  }

  private assertEditableStatus(idEstatus: number) {
    if (idEstatus === 1 || idEstatus === 4) return;
    throw new BadRequestException(
      'Documento no editable en el estatus actual.',
    );
  }

  private gestionAllowedStatusesByRole(ctx: UserContext) {
    if (ctx.isAdmin)
      return ['ABIERTO', 'PENDIENTE', 'REVISAR', 'CONTABILIZADO'];

    const roleName = this.normalizeText(ctx.roleName).toUpperCase();
    if (
      roleName.includes('JEFE DE INVENTARIOS') ||
      roleName.includes('ANALISTA DE INVENTARIOS') ||
      this.isInventoryRole(ctx.roleCode)
    ) {
      return ['ABIERTO', 'PENDIENTE'];
    }

    if (roleName.includes('ENCARGADO DE SUCURSAL')) {
      return ['ABIERTO', 'REVISAR', 'CONTABILIZADO'];
    }

    return ['ABIERTO'];
  }
}
