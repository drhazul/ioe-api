import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  CreateRecepcionDto,
  RecepcionActionDto,
  RecepcionMasivaDto,
  RecepcionesQueryDto,
  SaveRecepcionDraftDto,
  UpdateRecepcionCantidadDto,
  UpdateRecepcionCostoDto,
  UpdateRecepcionDatosDto,
} from './dto/recepciones.dto';

type UserContext = {
  userId: number;
  username: string;
  suc: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  isAdmin: boolean;
  canViewFinancial: boolean;
  canAuthorize: boolean;
  isBranchManager: boolean;
};

@Injectable()
export class RecepcionesService {
  private static readonly MODULE_CODE = 'DAT_REC';
  private static readonly BRANCH_MANAGER_ROLE_ID = 13008;
  private static readonly ADMIN_ROLES = new Set([0, 1]);
  private static readonly ADMINISTRATIVE_ROLES = new Set([
    'INVJEF',
    'JEFE_INVENTARIOS',
    'ANALISTA_INV',
    'ANALISTA DE INVENTARIOS',
  ]);

  constructor(private readonly dataSource: DataSource) {}

  async findAll(query: RecepcionesQueryDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const { page, limit, skip } = this.pagination(query);
    const where = [
      ctx.isBranchManager
        ? `UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) = 'PROCESADO'`
        : `UPPER(LTRIM(RTRIM(ISNULL(h.ESTATUS, '')))) IN ('PROCESADO', 'PARCIAL', 'VALIDADO', 'RECHAZADO')`,
      `UPPER(LTRIM(RTRIM(ISNULL(h.SUC, '')))) IN ('DF01', 'DF04', 'DF05', 'DF06')`,
      `EXISTS (SELECT 1 FROM dbo.REC_DET_PED dx WHERE dx.NPED=h.NPED AND ISNULL(dx.BLOQ,0)<>-1 AND ISNULL(dx.CTDREC,0)<ISNULL(dx.CTDPED,0))`,
    ];
    const params: unknown[] = [];
    await this.pushSucScope(where, params, ctx, query.suc, 'h.SUC');
    if (ctx.isBranchManager) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM dbo.REC_CTRL_DOC_REC rv WHERE rv.NPED=h.NPED AND rv.ESTATUS_REC IN ('VALIDADO','RECHAZADO'))`,
      );
    }
    this.pushCommonFilters(where, params, query, 'h', 'p');
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalRows = await this.dataSource.query(
      `SELECT COUNT(1) total FROM dbo.REC_CAB_PED h LEFT JOIN dbo.DAT_PROVD p ON p.ID=TRY_CONVERT(INT,h.NPROV) ${whereSql}`,
      params,
    );
    const rows = await this.dataSource.query(
      `
      SELECT h.NPED,h.SUC,h.TIPO,h.NPROV,h.USR,h.FCNP,h.FCNC,h.IMPP,h.NART,h.ESTATUS,
             p.ALIAS,p.RSOC,
             x.LINEAS,x.SOLICITADO,x.RECIBIDO,x.PENDIENTE,
             ar.DOCREC AS DOCREC_ACTIVO,ar.ESTATUS_REC AS ESTATUS_RECEPCION
      FROM dbo.REC_CAB_PED h
      LEFT JOIN dbo.DAT_PROVD p ON p.ID=TRY_CONVERT(INT,h.NPROV)
      OUTER APPLY (
        SELECT COUNT(1) LINEAS,SUM(ISNULL(d.CTDPED,0)) SOLICITADO,
               SUM(ISNULL(d.CTDREC,0)) RECIBIDO,
               SUM(CASE WHEN ISNULL(d.CTDPED,0)>ISNULL(d.CTDREC,0) THEN ISNULL(d.CTDPED,0)-ISNULL(d.CTDREC,0) ELSE 0 END) PENDIENTE
        FROM dbo.REC_DET_PED d WHERE d.NPED=h.NPED AND ISNULL(d.BLOQ,0)<>-1
      ) x
      OUTER APPLY (
        SELECT TOP 1 r.DOCREC,r.ESTATUS_REC FROM dbo.REC_CTRL_DOC_REC r
        WHERE r.NPED=h.NPED AND r.ESTATUS_REC IN ('RECEPCION_FISICA','VALIDADO','PENDIENTE_AUTORIZACION','RECHAZADO')
        ORDER BY r.FCN_FISICA DESC,r.DOCREC DESC
      ) ar
      ${whereSql}
      ORDER BY TRY_CONVERT(BIGINT,h.NPED) DESC,h.FCNP DESC
      OFFSET @${params.length} ROWS FETCH NEXT @${params.length + 1} ROWS ONLY`,
      [...params, skip, limit],
    );
    return {
      items: (rows ?? []).map((row: Record<string, unknown>) =>
        this.mapOrder(row, ctx.canViewFinancial),
      ),
      total: this.toInt(totalRows?.[0]?.total),
      page,
      limit,
    };
  }

  async findOne(npedRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const nped = this.required(npedRaw, 'NPED');
    const headers = await this.dataSource.query(
      `
      SELECT TOP 1 h.*,p.ALIAS,p.RSOC,
             x.LINEAS,x.SOLICITADO,x.RECIBIDO,x.PENDIENTE,
             ar.DOCREC AS DOCREC_ACTIVO,ar.ESTATUS_REC AS ESTATUS_RECEPCION
      FROM dbo.REC_CAB_PED h
      LEFT JOIN dbo.DAT_PROVD p ON p.ID=TRY_CONVERT(INT,h.NPROV)
      OUTER APPLY (
        SELECT COUNT(1) LINEAS,SUM(ISNULL(d.CTDPED,0)) SOLICITADO,
               SUM(ISNULL(d.CTDREC,0)) RECIBIDO,
               SUM(CASE WHEN ISNULL(d.CTDPED,0)>ISNULL(d.CTDREC,0) THEN ISNULL(d.CTDPED,0)-ISNULL(d.CTDREC,0) ELSE 0 END) PENDIENTE
        FROM dbo.REC_DET_PED d WHERE d.NPED=h.NPED AND ISNULL(d.BLOQ,0)<>-1
      ) x
      OUTER APPLY (
        SELECT TOP 1 r.DOCREC,r.ESTATUS_REC
        FROM dbo.REC_CTRL_DOC_REC r
        WHERE r.NPED=h.NPED
          AND r.ESTATUS_REC IN ('RECEPCION_FISICA','VALIDADO','PENDIENTE_AUTORIZACION','RECHAZADO')
        ORDER BY COALESCE(r.FCN_FISICA,r.FCNC) DESC,r.DOCREC DESC
      ) ar
      WHERE h.NPED=@0`,
      [nped],
    );
    const header = headers?.[0];
    if (!header) throw new NotFoundException(`No existe la O.C. ${nped}.`);
    await this.assertSucAllowed(this.text(header.SUC), ctx);
    const details = await this.dataSource.query(
      `
      SELECT d.IDPED,d.POS,d.ART,a.UPC,a.DES,d.UNCOM,d.CTO,d.CTDPED,d.CTDREC,
             CASE WHEN ISNULL(d.CTDPED,0)>ISNULL(d.CTDREC,0) THEN ISNULL(d.CTDPED,0)-ISNULL(d.CTDREC,0) ELSE 0 END PENDIENTE,
             a.TIPO,a.DEPA,a.SUBD,a.CLAS,a.SCLA,a.SCLA2,a.BASE,a.SPH,a.CYL,a.ADIC,
             COALESCE(NULLIF(CONCAT_WS(' / ',
               NULLIF(LTRIM(RTRIM(jd.DDEPA)),''),
               NULLIF(LTRIM(RTRIM(jsub.DSUBD)),''),
               NULLIF(LTRIM(RTRIM(jc.DCLAS)),''),
               NULLIF(LTRIM(RTRIM(js.DSCLA)),''),
               NULLIF(LTRIM(RTRIM(js2.DSCLA2)),'')
             ),''),'SIN JERARQUIA') JERARQUIA_NOMBRE
      FROM dbo.REC_DET_PED d
      LEFT JOIN dbo.DAT_ART a ON a.SUC=@1 AND a.ART=d.ART
      LEFT JOIN dbo.JRQ_DEPA jd ON jd.DEPA=a.DEPA
      LEFT JOIN dbo.JRQ_SUBD jsub ON jsub.SUBD=a.SUBD
      LEFT JOIN dbo.JRQ_CLAS jc ON jc.CLAS=a.CLAS
      LEFT JOIN dbo.JRQ_SCLA js ON js.SCLA=a.SCLA
      LEFT JOIN dbo.JRQ_SCLA2 js2 ON js2.SCLA2=a.SCLA2
      WHERE d.NPED=@0 AND ISNULL(d.BLOQ,0)<>-1 ORDER BY d.POS,d.IDPED`,
      [nped, this.text(header.SUC)],
    );
    const receipts = await this.dataSource.query(
      `SELECT DOCREC,NPED,FCNC,NART,IMPT,ESTATUS_REC,TIPO_RECEPCION,FCN_FISICA,FCN_AUTORIZA,USR_RECEPCION,USR_AUTORIZA,TIPO_DOC,FOLIO_DOC,OBSERVACIONES,ALMACEN FROM dbo.REC_CTRL_DOC_REC WHERE NPED=@0 ORDER BY COALESCE(FCN_FISICA,FCNC) DESC,DOCREC DESC`,
      [nped],
    );
    return {
      ...this.mapOrder(header, ctx.canViewFinancial),
      detalle: (details ?? []).map((row: Record<string, unknown>) =>
        this.mapDetail(row, ctx.canViewFinancial),
      ),
      recepciones: (receipts ?? []).map((row: Record<string, unknown>) =>
        this.mapReceipt(row, ctx.canViewFinancial),
      ),
      permisos: {
        verInformacionFinanciera: ctx.canViewFinancial,
        autorizar: ctx.canAuthorize,
      },
    };
  }

  async create(npedRaw: string, dto: CreateRecepcionDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const nped = this.required(npedRaw, 'NPED');
    const header = await this.orderHeader(nped);
    await this.assertSucAllowed(this.text(header.SUC), ctx);
    if (!dto.items?.length)
      throw new BadRequestException('Capture al menos un artículo.');
    const active = await this.dataSource.query(
      `SELECT TOP 1 DOCREC,ESTATUS_REC FROM dbo.REC_CTRL_DOC_REC WHERE NPED=@0 AND ESTATUS_REC IN ('RECEPCION_FISICA','VALIDADO','PENDIENTE_AUTORIZACION','RECHAZADO') ORDER BY COALESCE(FCN_FISICA,FCNC) DESC,DOCREC DESC`,
      [nped],
    );
    if (active?.[0]) {
      throw new BadRequestException(
        `La orden ya tiene la recepción activa ${this.text(active[0].DOCREC)} en estado ${this.text(active[0].ESTATUS_REC)}.`,
      );
    }
    try {
      const rows = await this.dataSource.query(
        `EXEC dbo.sp_rec_recepcion_fisica @NPED=@0,@USR=@1,@TIPO_RECEPCION=@2,@TIPO_DOC=@3,@FOLIO_DOC=@4,@ALMACEN=@5,@OBSERVACIONES=@6,@ITEMS_JSON=@7,@GUIAS_JSON=@8,@INCIDENCIAS_JSON=@9`,
        [
          nped,
          ctx.username,
          dto.tipoRecepcion,
          this.nullText(dto.tipoDocumento),
          this.nullText(dto.folioDocumento),
          this.nullText(dto.almacen) ?? '002',
          this.nullText(dto.observaciones),
          JSON.stringify(dto.items),
          JSON.stringify(dto.guias ?? []),
          JSON.stringify(dto.incidencias ?? []),
        ],
      );
      const docrec = this.text(rows?.[0]?.DOCREC ?? rows?.[0]?.docrec);
      if (ctx.isBranchManager) {
        await this.execAction(
          dto.tipoRecepcion === 'RECHAZO'
            ? 'sp_rec_recepcion_rechazar'
            : 'sp_rec_recepcion_solicitar',
          docrec,
          ctx.username,
          this.nullText(dto.observaciones),
        );
      }
      try {
        await this.dataSource.query(
          `EXEC dbo.sp_rec_recepcion_borrador_eliminar @NPED=@0`,
          [nped],
        );
      } catch {
        // La recepción ya fue creada; el borrador obsoleto no debe revertirla.
      }
      return this.findDocumento(docrec, user);
    } catch (error) {
      this.throwSqlError(error, 'No se pudo registrar la recepción física.');
    }
  }

  async validarMasiva(
    npedRaw: string,
    dto: RecepcionMasivaDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    const nped = this.required(npedRaw, 'NPED');
    const header = await this.orderHeader(nped);
    await this.assertSucAllowed(this.text(header.SUC), ctx);
    const rows = await this.dataSource.query(
      `SELECT IDPED,ART,CTDPED,ISNULL(CTDREC,0) CTDREC FROM dbo.REC_DET_PED WHERE NPED=@0 AND ISNULL(BLOQ,0)<>-1`,
      [nped],
    );
    const byId = new Map<string, Record<string, unknown>>(
      (rows ?? []).map((row: Record<string, unknown>) => [
        this.text(row.IDPED),
        row,
      ]),
    );
    const seen = new Set<string>();
    const items = (dto.items ?? []).map((item, index) => {
      const key =
        this.text(item.idped) || `ART:${this.text(item.art).toUpperCase()}`;
      const errors: string[] = [];
      if (seen.has(key))
        errors.push('Artículo/posición duplicado en el archivo.');
      seen.add(key);
      const orderItem = item.idped
        ? byId.get(this.text(item.idped))
        : undefined;
      if (item.idped && !orderItem)
        errors.push('La posición no pertenece a la O.C.');
      if (orderItem && this.text(orderItem.ART) !== this.text(item.art))
        errors.push('El artículo no coincide con la posición.');
      const pending = orderItem
        ? Math.max(
            0,
            this.toNumber(orderItem.CTDPED) - this.toNumber(orderItem.CTDREC),
          )
        : 0;
      if (item.cantidadRecibida <= 0)
        errors.push('La cantidad recibida debe ser mayor a cero.');
      if (
        (item.cantidadAceptada ?? item.cantidadRecibida) > item.cantidadRecibida
      ) {
        errors.push('La cantidad aceptada no puede exceder la recibida.');
      }
      return {
        fila: index + 1,
        art: item.art,
        idped: item.idped,
        pendiente: pending,
        valido: errors.length === 0,
        errores: errors,
      };
    });
    return {
      valido: items.every((item) => item.valido),
      total: items.length,
      items,
    };
  }

  async findDraft(npedRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    this.assertBranchManager(ctx);
    const nped = this.required(npedRaw, 'NPED');
    const header = await this.orderHeader(nped);
    await this.assertSucAllowed(this.text(header.SUC), ctx);
    const rows = await this.dataSource.query(
      `SELECT TOP 1 NPED,SUC,TIPO_RECEPCION,TIPO_DOC,FOLIO_DOC,GUIA,PAQUETERIA,OBSERVACIONES,FCNM FROM dbo.REC_BORRADOR_REC WHERE NPED=@0`,
      [nped],
    );
    if (!rows?.[0]) return { existe: false, items: [] };
    const items = await this.dataSource.query(
      `SELECT IDPED,ART,CTD_REC,CTD_ACEP,ESTATUS FROM dbo.REC_BORRADOR_REC_DET WHERE NPED=@0 ORDER BY ID`,
      [nped],
    );
    const row = rows[0] as Record<string, unknown>;
    return {
      existe: true,
      nped: this.text(row.NPED),
      suc: this.text(row.SUC),
      tipoRecepcion: this.nullText(row.TIPO_RECEPCION),
      tipoDocumento: this.nullText(row.TIPO_DOC),
      folioDocumento: this.nullText(row.FOLIO_DOC),
      guia: this.nullText(row.GUIA),
      paqueteria: this.nullText(row.PAQUETERIA),
      observaciones: this.nullText(row.OBSERVACIONES),
      fechaModificacion: row.FCNM ?? null,
      items: (items ?? []).map((item: Record<string, unknown>) => ({
        idped: this.text(item.IDPED),
        art: this.text(item.ART),
        cantidadRecibida: this.toNumber(item.CTD_REC),
        cantidadAceptada: this.toNumber(item.CTD_ACEP),
        estatus: this.nullText(item.ESTATUS),
      })),
    };
  }

  async saveDraft(
    npedRaw: string,
    dto: SaveRecepcionDraftDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    this.assertBranchManager(ctx);
    const nped = this.required(npedRaw, 'NPED');
    const header = await this.orderHeader(nped);
    await this.assertSucAllowed(this.text(header.SUC), ctx);
    await this.dataSource.query(
      `EXEC dbo.sp_rec_recepcion_borrador_guardar @NPED=@0,@USR=@1,@TIPO_RECEPCION=@2,@TIPO_DOC=@3,@FOLIO_DOC=@4,@GUIA=@5,@PAQUETERIA=@6,@OBSERVACIONES=@7,@ITEMS_JSON=@8`,
      [
        nped,
        ctx.username,
        this.nullText(dto.tipoRecepcion),
        this.nullText(dto.tipoDocumento),
        this.nullText(dto.folioDocumento),
        this.nullText(dto.guia),
        this.nullText(dto.paqueteria),
        this.nullText(dto.observaciones),
        JSON.stringify(dto.items ?? []),
      ],
    );
    return { guardado: true };
  }

  async findDocumento(docrecRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const docrec = this.required(docrecRaw, 'DOCREC');
    const headers = await this.dataSource.query(
      `SELECT TOP 1 r.*,h.SUC,h.NPROV,p.ALIAS,p.RSOC FROM dbo.REC_CTRL_DOC_REC r JOIN dbo.REC_CAB_PED h ON h.NPED=r.NPED LEFT JOIN dbo.DAT_PROVD p ON p.ID=TRY_CONVERT(INT,h.NPROV) WHERE r.DOCREC=@0`,
      [docrec],
    );
    const header = headers?.[0];
    if (!header)
      throw new NotFoundException(`No existe la recepción ${docrec}.`);
    await this.assertSucAllowed(this.text(header.SUC), ctx);
    const [details, guides, incidents] = await Promise.all([
      this.dataSource.query(
        `SELECT
                x.IDREC,COALESCE(x.POS,d.POS) POS,COALESCE(x.ART,d.ART) ART,
                x.FCN,COALESCE(x.CTD,0) CTD,x.CTDVTA,x.DOCREC,
                COALESCE(x.IDPED,d.IDPED) IDPED,
                COALESCE(x.CTD_SOL,d.CTDPED,0) CTD_SOL,
                COALESCE(x.CTD_ACEP,x.CTD,0) CTD_ACEP,x.CALIDAD_ESTATUS,
                x.CALIDAD_JSON,x.CADUCIDAD,x.OBSERVACIONES,
                a.UPC,a.DES,d.CTDPED,d.CTDREC,d.UNCOM,d.CTO,
                a.TIPO,a.DEPA,a.SUBD,a.CLAS,a.SCLA,a.SCLA2,a.BASE,a.SPH,a.CYL,a.ADIC,
                COALESCE(NULLIF(CONCAT_WS(' / ',
                  NULLIF(LTRIM(RTRIM(jd.DDEPA)),''),
                  NULLIF(LTRIM(RTRIM(jsub.DSUBD)),''),
                  NULLIF(LTRIM(RTRIM(jc.DCLAS)),''),
                  NULLIF(LTRIM(RTRIM(js.DSCLA)),''),
                  NULLIF(LTRIM(RTRIM(js2.DSCLA2)),'')
                ),''),'SIN JERARQUIA') JERARQUIA_NOMBRE
         FROM (
           SELECT * FROM dbo.REC_DET_PED
           WHERE NPED=@2 AND ISNULL(BLOQ,0)<>-1
             AND UPPER(LTRIM(RTRIM(@3))) IN ('VALIDADO','CONTABILIZADO')
         ) d
         FULL OUTER JOIN (
           SELECT * FROM dbo.REC_CTO_HIST WHERE DOCREC=@0
         ) x ON x.IDPED=d.IDPED
         LEFT JOIN dbo.DAT_ART a ON a.SUC=@1 AND a.ART=COALESCE(x.ART,d.ART)
         LEFT JOIN dbo.JRQ_DEPA jd ON jd.DEPA=a.DEPA
         LEFT JOIN dbo.JRQ_SUBD jsub ON jsub.SUBD=a.SUBD
         LEFT JOIN dbo.JRQ_CLAS jc ON jc.CLAS=a.CLAS
         LEFT JOIN dbo.JRQ_SCLA js ON js.SCLA=a.SCLA
         LEFT JOIN dbo.JRQ_SCLA2 js2 ON js2.SCLA2=a.SCLA2
         ORDER BY COALESCE(x.POS,d.POS),x.IDREC,d.IDPED`,
        [
          docrec,
          this.text(header.SUC),
          this.text(header.NPED),
          this.text(header.ESTATUS_REC),
        ],
      ),
      this.dataSource.query(
        `SELECT IDGUIA,GUIA,PAQUETERIA,NPAQ,OBSERVACIONES,FCNR,USR FROM dbo.REC_GUIA_PED WHERE DOCREC=@0 ORDER BY IDGUIA`,
        [docrec],
      ),
      this.dataSource.query(
        `SELECT IDINC,TIPO,ART,CTD_ESPERADA,CTD_RECIBIDA,DIFERENCIA,MOTIVO,ESTATUS,USR,FCNR,USR_AUTORIZA,FCN_AUTORIZA FROM dbo.REC_INCI_PED WHERE DOCREC=@0 ORDER BY IDINC`,
        [docrec],
      ),
    ]);
    return {
      ...this.mapReceipt(header, ctx.canViewFinancial),
      suc: this.text(header.SUC),
      proveedor: this.text(header.ALIAS || header.RSOC),
      detalle: (details ?? []).map((row: Record<string, unknown>) =>
        this.mapReceiptDetail(row, ctx.canViewFinancial),
      ),
      guias: guides ?? [],
      incidencias: incidents ?? [],
      permisos: {
        verInformacionFinanciera: ctx.canViewFinancial,
        autorizar: ctx.canAuthorize,
      },
    };
  }

  async solicitarAutorizacion(docrec: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    await this.assertDocumentAccess(docrec, ctx);
    await this.execAction(
      'sp_rec_recepcion_solicitar',
      docrec,
      ctx.username,
      null,
    );
    return this.findDocumento(docrec, user);
  }

  async autorizar(docrec: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    if (!ctx.canAuthorize)
      throw new ForbiddenException(
        'Solo Inventarios puede autorizar y contabilizar recepciones.',
      );
    await this.assertDocumentAccess(docrec, ctx);
    await this.execAction(
      'sp_rec_recepcion_autorizar',
      docrec,
      ctx.username,
      null,
    );
    return this.findDocumento(docrec, user);
  }

  async rechazar(docrec: string, dto: RecepcionActionDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    if (!ctx.canAuthorize)
      throw new ForbiddenException(
        'Solo Inventarios puede rechazar recepciones.',
      );
    await this.assertDocumentAccess(docrec, ctx);
    await this.execAction(
      'sp_rec_recepcion_devolver_sucursal',
      docrec,
      ctx.username,
      this.nullText(dto.motivo),
    );
    return this.findDocumento(docrec, user);
  }

  async actualizarDatos(
    docrecRaw: string,
    dto: UpdateRecepcionDatosDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.roleId !== 2) {
      throw new ForbiddenException(
        'Solo el Jefe de Inventarios puede modificar los datos documentales.',
      );
    }
    const docrec = this.required(docrecRaw, 'DOCREC');
    await this.assertDocumentAccess(docrec, ctx);
    try {
      await this.dataSource.query(
        `EXEC dbo.sp_rec_recepcion_actualizar_datos @DOCREC=@0,@TIPO_DOC=@1,@FOLIO_DOC=@2,@GUIA=@3,@PAQUETERIA=@4,@OBSERVACIONES=@5,@USR=@6`,
        [
          docrec,
          this.nullText(dto.tipoDocumento),
          this.nullText(dto.folioDocumento),
          this.nullText(dto.guia),
          this.nullText(dto.paqueteria),
          this.nullText(dto.observaciones),
          ctx.username,
        ],
      );
    } catch (error) {
      this.throwSqlError(error, 'No se pudieron actualizar los datos.');
    }
    return this.findDocumento(docrec, user);
  }

  async actualizarCosto(
    docrecRaw: string,
    idrecRaw: string,
    dto: UpdateRecepcionCostoDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.roleId !== 2) {
      throw new ForbiddenException(
        'Solo el Jefe de Inventarios puede modificar el costo.',
      );
    }
    const docrec = this.required(docrecRaw, 'DOCREC');
    const idrec = this.required(idrecRaw, 'IDREC');
    await this.assertDocumentAccess(docrec, ctx);
    try {
      await this.dataSource.query(
        `EXEC dbo.sp_rec_recepcion_actualizar_costo @DOCREC=@0,@IDREC=@1,@COSTO=@2,@USR=@3`,
        [docrec, idrec, dto.costo, ctx.username],
      );
    } catch (error) {
      this.throwSqlError(error, 'No se pudo actualizar el costo.');
    }
    return this.findDocumento(docrec, user);
  }

  async actualizarCantidadFisica(
    docrecRaw: string,
    idrecRaw: string,
    dto: UpdateRecepcionCantidadDto,
    user: JwtPayload,
  ) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.roleId !== 2) {
      throw new ForbiddenException(
        'Solo el Jefe de Inventarios puede modificar la cantidad física.',
      );
    }
    const docrec = this.required(docrecRaw, 'DOCREC');
    const idrec = this.required(idrecRaw, 'IDREC');
    await this.assertDocumentAccess(docrec, ctx);
    try {
      await this.dataSource.query(
        `EXEC dbo.sp_rec_recepcion_actualizar_cantidad @DOCREC=@0,@IDREC=@1,@CANTIDAD=@2,@USR=@3`,
        [docrec, idrec, dto.cantidadFisica, ctx.username],
      );
    } catch (error) {
      this.throwSqlError(error, 'No se pudo actualizar la cantidad física.');
    }
    return this.findDocumento(docrec, user);
  }

  async historial(query: RecepcionesQueryDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.isBranchManager) {
      throw new ForbiddenException(
        'El encargado de sucursal no tiene acceso al histórico.',
      );
    }
    const { page, limit, skip } = this.pagination(query);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    await this.pushSucScope(where, params, ctx, query.suc, 'h.SUC');
    if (query.from) {
      where.push(
        `CONVERT(date,COALESCE(r.FCN_FISICA,r.FCNC))>=@${params.length}`,
      );
      params.push(query.from);
    }
    if (query.to) {
      where.push(
        `CONVERT(date,COALESCE(r.FCN_FISICA,r.FCNC))<=@${params.length}`,
      );
      params.push(query.to);
    }
    if (query.oc?.trim()) {
      where.push(`r.NPED LIKE @${params.length}`);
      params.push(`%${query.oc.trim()}%`);
    }
    if (query.prov != null && query.prov > 0) {
      where.push(`TRY_CONVERT(INT,h.NPROV)=@${params.length}`);
      params.push(query.prov);
    }
    const sqlWhere = `WHERE ${where.join(' AND ')}`;
    const totals = await this.dataSource.query(
      `SELECT COUNT(1) total FROM dbo.REC_CTRL_DOC_REC r JOIN dbo.REC_CAB_PED h ON h.NPED=r.NPED LEFT JOIN dbo.DAT_PROVD p ON p.ID=TRY_CONVERT(INT,h.NPROV) ${sqlWhere}`,
      params,
    );
    const rows = await this.dataSource.query(
      `SELECT r.*,h.SUC,p.ALIAS,p.RSOC FROM dbo.REC_CTRL_DOC_REC r JOIN dbo.REC_CAB_PED h ON h.NPED=r.NPED LEFT JOIN dbo.DAT_PROVD p ON p.ID=TRY_CONVERT(INT,h.NPROV) ${sqlWhere} ORDER BY COALESCE(r.FCN_FISICA,r.FCNC) DESC,r.DOCREC DESC OFFSET @${params.length} ROWS FETCH NEXT @${params.length + 1} ROWS ONLY`,
      [...params, skip, limit],
    );
    return {
      items: (rows ?? []).map((row: Record<string, unknown>) => ({
        ...this.mapReceipt(row, ctx.canViewFinancial),
        suc: this.text(row.SUC),
        proveedor: this.text(row.ALIAS || row.RSOC),
      })),
      total: this.toInt(totals?.[0]?.total),
      page,
      limit,
    };
  }

  async indicadores(query: RecepcionesQueryDto, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.isBranchManager) {
      throw new ForbiddenException(
        'El encargado de sucursal no tiene acceso a indicadores.',
      );
    }
    const where: string[] = [`r.ESTATUS_REC='CONTABILIZADO'`];
    const params: unknown[] = [];
    await this.pushSucScope(where, params, ctx, query.suc, 'h.SUC');
    if (query.from) {
      where.push(`CONVERT(date,r.FCN_AUTORIZA)>=@${params.length}`);
      params.push(query.from);
    }
    if (query.to) {
      where.push(`CONVERT(date,r.FCN_AUTORIZA)<=@${params.length}`);
      params.push(query.to);
    }
    const rows = await this.dataSource.query(
      `SELECT COUNT(DISTINCT r.DOCREC) RECEPCIONES,COUNT(DISTINCT r.NPED) PEDIDOS,
              SUM(ISNULL(x.CTD_ACEP,0)) RECIBIDO,SUM(ISNULL(x.CTD_SOL,0)) SOLICITADO,
              SUM(CASE WHEN i.IDINC IS NOT NULL THEN 1 ELSE 0 END) INCIDENCIAS,
              AVG(CASE WHEN r.FCN_FISICA IS NOT NULL AND r.FCN_AUTORIZA IS NOT NULL THEN DATEDIFF(MINUTE,r.FCN_FISICA,r.FCN_AUTORIZA)*1.0 END) MINUTOS_PROMEDIO
       FROM dbo.REC_CTRL_DOC_REC r JOIN dbo.REC_CAB_PED h ON h.NPED=r.NPED
       LEFT JOIN dbo.REC_CTO_HIST x ON x.DOCREC=r.DOCREC
       LEFT JOIN (SELECT DISTINCT DOCREC,1 IDINC FROM dbo.REC_INCI_PED) i ON i.DOCREC=r.DOCREC
       WHERE ${where.join(' AND ')}`,
      params,
    );
    const row = rows?.[0] ?? {};
    const received = this.toNumber(row.RECIBIDO);
    const requested = this.toNumber(row.SOLICITADO);
    return {
      recepciones: this.toInt(row.RECEPCIONES),
      pedidos: this.toInt(row.PEDIDOS),
      cantidadSolicitada: requested,
      cantidadRecibida: received,
      cumplimientoProveedor: requested > 0 ? (received / requested) * 100 : 0,
      exactitudRecepcion:
        received > 0
          ? Math.min(100, (Math.min(received, requested) / received) * 100)
          : 0,
      incidencias: this.toInt(row.INCIDENCIAS),
      minutosPromedioRecepcion: this.toNumber(row.MINUTOS_PROMEDIO),
    };
  }

  async catalogSucursales(user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    if (ctx.isAdmin || ctx.canAuthorize) {
      const rows = await this.dataSource.query(
        `SELECT SUC,[DESC] NOMBRE FROM dbo.DAT_SUC ORDER BY SUC`,
      );
      return rows ?? [];
    }
    const sucs = await this.authorizedSucs(ctx);
    return sucs.map((suc) => ({ SUC: suc, NOMBRE: suc }));
  }

  async catalogProveedores() {
    const rows = await this.dataSource.query(
      `SELECT ID,ALIAS,RSOC,COALESCE(NULLIF(LTRIM(RTRIM(ALIAS)),''),NULLIF(LTRIM(RTRIM(RSOC)),''),CONVERT(nvarchar(20),ID)) NOMBRE FROM dbo.DAT_PROVD WHERE ISNULL(BLOQ,0)<>-1 ORDER BY TRY_CONVERT(INT,ID),ID`,
    );
    return rows ?? [];
  }

  async catalogCalidad(artRaw: string, sucRaw: string, user: JwtPayload) {
    const ctx = await this.resolveUserContext(user);
    const suc = this.required(sucRaw, 'SUC').toUpperCase();
    await this.assertSucAllowed(suc, ctx);
    const art = this.required(artRaw, 'ART');
    return this.dataSource.query(
      `SELECT c.IDCRITERIO,c.NOMBRE,c.DESCRIPCION,c.REQUERIDO FROM dbo.DAT_ART a JOIN dbo.REC_CALIDAD_CRITERIO c ON c.ACTIVO=1 AND (c.TIPO IS NULL OR c.TIPO=a.TIPO) AND (c.DEPA IS NULL OR c.DEPA=a.DEPA) AND (c.SUBD IS NULL OR c.SUBD=a.SUBD) AND (c.CLAS IS NULL OR c.CLAS=a.CLAS) AND (c.SCLA IS NULL OR c.SCLA=a.SCLA) AND (c.SCLA2 IS NULL OR c.SCLA2=a.SCLA2) WHERE a.SUC=@0 AND a.ART=@1 ORDER BY c.ORDEN,c.IDCRITERIO`,
      [suc, art],
    );
  }

  private async execAction(
    procedure: string,
    docrec: string,
    username: string,
    motivo: string | null,
  ) {
    try {
      await this.dataSource.query(
        `EXEC dbo.${procedure} @DOCREC=@0,@USR=@1,@MOTIVO=@2`,
        [docrec, username, motivo],
      );
    } catch (error) {
      this.throwSqlError(error, 'No se pudo completar la acción de recepción.');
    }
  }

  private async orderHeader(nped: string) {
    const rows = await this.dataSource.query(
      `SELECT TOP 1 NPED,SUC,ESTATUS FROM dbo.REC_CAB_PED WHERE NPED=@0`,
      [nped],
    );
    if (!rows?.[0]) throw new NotFoundException(`No existe la O.C. ${nped}.`);
    return rows[0] as Record<string, unknown>;
  }

  private assertBranchManager(ctx: UserContext) {
    if (!ctx.isBranchManager) {
      throw new ForbiddenException(
        'El borrador de recepción está disponible para encargados de sucursal.',
      );
    }
  }

  private async assertDocumentAccess(docrecRaw: string, ctx: UserContext) {
    const docrec = this.required(docrecRaw, 'DOCREC');
    const rows = await this.dataSource.query(
      `SELECT TOP 1 h.SUC FROM dbo.REC_CTRL_DOC_REC r JOIN dbo.REC_CAB_PED h ON h.NPED=r.NPED WHERE r.DOCREC=@0`,
      [docrec],
    );
    if (!rows?.[0])
      throw new NotFoundException(`No existe la recepción ${docrec}.`);
    await this.assertSucAllowed(this.text(rows[0].SUC), ctx);
  }

  private async resolveUserContext(user: JwtPayload): Promise<UserContext> {
    const usernameClaim = this.text(
      (user as any).username || (user as any).user,
    );
    const userIdClaim = this.toInt(
      (user as any).idUsuario ??
        (user as any).idusuario ??
        (user as any).userId ??
        (user as any).sub,
    );
    const rows = usernameClaim
      ? await this.dataSource.query(
          `SELECT TOP 1 u.IDUSUARIO,u.USERNAME,u.SUC,u.IDROL,r.CODIGO ROLE_CODE,r.NOMBRE ROLE_NAME FROM dbo.USUARIO u LEFT JOIN dbo.ROL r ON r.IDROL=u.IDROL WHERE UPPER(u.USERNAME)=UPPER(@0)`,
          [usernameClaim],
        )
      : userIdClaim > 0
        ? await this.dataSource.query(
            `SELECT TOP 1 u.IDUSUARIO,u.USERNAME,u.SUC,u.IDROL,r.CODIGO ROLE_CODE,r.NOMBRE ROLE_NAME FROM dbo.USUARIO u LEFT JOIN dbo.ROL r ON r.IDROL=u.IDROL WHERE u.IDUSUARIO=@0`,
            [userIdClaim],
          )
        : [];
    const row = rows?.[0] ?? {};
    const roleId = this.toInt(
      (user as any).roleId ?? (user as any).IDROL ?? row.IDROL,
    );
    const roleCode = this.text(
      (user as any).roleCode ?? row.ROLE_CODE,
    ).toUpperCase();
    const roleName = this.text(
      (user as any).roleName ?? row.ROLE_NAME,
    ).toUpperCase();
    const normalized = new Set([roleCode, roleName]);
    const isAdmin =
      RecepcionesService.ADMIN_ROLES.has(roleId) ||
      normalized.has('ADMIN') ||
      normalized.has('ADMINISTRADOR') ||
      normalized.has('ACCESTOTAL');
    const administrative = [...normalized].some((role) =>
      RecepcionesService.ADMINISTRATIVE_ROLES.has(role),
    );
    const isBranchManager =
      roleId === RecepcionesService.BRANCH_MANAGER_ROLE_ID ||
      normalized.has('ENCARGADO DE SUCURSAL') ||
      normalized.has('ENCARGADO_SUCURSAL');
    return {
      userId: this.toInt(row.IDUSUARIO) || userIdClaim,
      username: this.text(row.USERNAME || usernameClaim),
      suc: this.text((user as any).suc || row.SUC).toUpperCase(),
      roleId,
      roleCode,
      roleName,
      isAdmin,
      canViewFinancial: isAdmin || administrative,
      canAuthorize: isAdmin || administrative,
      isBranchManager,
    };
  }

  private async authorizedSucs(ctx: UserContext) {
    if (ctx.isAdmin) return [] as string[];
    if (ctx.isBranchManager) {
      return ctx.suc ? [ctx.suc] : [];
    }
    const rows = await this.dataSource.query(
      `SELECT DISTINCT UPPER(LTRIM(RTRIM(SUC))) SUC FROM dbo.USR_MOD_SUC WHERE UPPER(LTRIM(RTRIM(USUARIO)))=UPPER(@0) AND ACTIVO=1 AND MODULO=@1`,
      [ctx.username, RecepcionesService.MODULE_CODE],
    );
    const values = (rows ?? [])
      .map((row: Record<string, unknown>) => this.text(row.SUC))
      .filter(Boolean);
    if (!values.length && ctx.suc) values.push(ctx.suc);
    return [...new Set(values)];
  }

  private async assertSucAllowed(sucRaw: string, ctx: UserContext) {
    if (ctx.isAdmin || ctx.canAuthorize) return;
    const suc = this.required(sucRaw, 'SUC').toUpperCase();
    if ((await this.authorizedSucs(ctx)).includes(suc)) return;
    throw new ForbiddenException(`No autorizado para la sucursal ${suc}.`);
  }

  private async pushSucScope(
    where: string[],
    params: unknown[],
    ctx: UserContext,
    requested: string | undefined,
    column: string,
  ) {
    const selected = this.text(requested).toUpperCase();
    if (ctx.isAdmin || ctx.canAuthorize) {
      if (selected) {
        where.push(`${column}=@${params.length}`);
        params.push(selected);
      }
      return;
    }
    const allowed = await this.authorizedSucs(ctx);
    if (selected) {
      if (!allowed.includes(selected))
        throw new ForbiddenException(
          `No autorizado para la sucursal ${selected}.`,
        );
      where.push(`${column}=@${params.length}`);
      params.push(selected);
      return;
    }
    if (!allowed.length)
      throw new ForbiddenException(
        'Usuario sin sucursal autorizada para DAT_REC.',
      );
    where.push(
      `${column} IN (${allowed.map((_, index) => `@${params.length + index}`).join(',')})`,
    );
    params.push(...allowed);
  }

  private pushCommonFilters(
    where: string[],
    params: unknown[],
    query: RecepcionesQueryDto,
    header: string,
    provider: string,
  ) {
    if (query.estatus?.trim()) {
      where.push(`UPPER(${header}.ESTATUS)=@${params.length}`);
      params.push(query.estatus.trim().toUpperCase());
    }
    if (query.from) {
      where.push(`CONVERT(date,${header}.FCNP)>=@${params.length}`);
      params.push(query.from);
    }
    if (query.to) {
      where.push(`CONVERT(date,${header}.FCNP)<=@${params.length}`);
      params.push(query.to);
    }
    if (query.search?.trim()) {
      where.push(
        `(${header}.NPED LIKE @${params.length} OR UPPER(ISNULL(${provider}.ALIAS,'')) LIKE @${params.length} OR UPPER(ISNULL(${provider}.RSOC,'')) LIKE @${params.length})`,
      );
      params.push(`%${query.search.trim().toUpperCase()}%`);
    }
    if (query.oc?.trim()) {
      where.push(`${header}.NPED LIKE @${params.length}`);
      params.push(`%${query.oc.trim()}%`);
    }
    if (query.proveedor?.trim()) {
      where.push(
        `(UPPER(ISNULL(${provider}.ALIAS,'')) LIKE @${params.length} OR UPPER(ISNULL(${provider}.RSOC,'')) LIKE @${params.length})`,
      );
      params.push(`%${query.proveedor.trim().toUpperCase()}%`);
    }
    if (query.prov != null && query.prov > 0) {
      where.push(`TRY_CONVERT(INT,${header}.NPROV)=@${params.length}`);
      params.push(query.prov);
    }
  }

  private mapOrder(row: Record<string, unknown>, financial: boolean) {
    return {
      nped: this.text(row.NPED),
      suc: this.text(row.SUC),
      tipo: this.text(row.TIPO),
      nprov: this.toInt(row.NPROV),
      proveedor: this.text(row.ALIAS || row.RSOC),
      usr: this.text(row.USR),
      fcnp: row.FCNP ?? null,
      fcnc: row.FCNC ?? null,
      nart: this.toInt(row.NART ?? row.LINEAS),
      estatus: this.text(row.ESTATUS),
      solicitado: this.toNumber(row.SOLICITADO),
      recibido: this.toNumber(row.RECIBIDO),
      pendiente: this.toNumber(row.PENDIENTE),
      docrecActivo: this.nullText(row.DOCREC_ACTIVO),
      estatusRecepcion: this.nullText(row.ESTATUS_RECEPCION),
      ...(financial ? { impp: this.toNumber(row.IMPP) } : {}),
    };
  }

  private mapDetail(row: Record<string, unknown>, financial: boolean) {
    return {
      idped: this.text(row.IDPED),
      pos: this.toInt(row.POS),
      art: this.text(row.ART),
      upc: this.nullText(row.UPC),
      des: this.text(row.DES),
      uncom: this.text(row.UNCOM),
      solicitado: this.toNumber(row.CTDPED),
      recibido: this.toNumber(row.CTDREC),
      pendiente: this.toNumber(row.PENDIENTE),
      tipo: this.nullText(row.TIPO),
      depa: row.DEPA ?? null,
      subd: row.SUBD ?? null,
      clas: row.CLAS ?? null,
      scla: row.SCLA ?? null,
      scla2: row.SCLA2 ?? null,
      base: this.nullText(row.BASE),
      sph: row.SPH ?? null,
      cyl: row.CYL ?? null,
      adic: row.ADIC ?? null,
      jerarquiaNombre: this.text(row.JERARQUIA_NOMBRE || 'SIN JERARQUIA'),
      ...(financial ? { costo: this.toNumber(row.CTO) } : {}),
    };
  }

  private mapReceipt(row: Record<string, unknown>, financial: boolean) {
    return {
      docrec: this.text(row.DOCREC),
      nped: this.text(row.NPED),
      estatus: this.text(row.ESTATUS_REC || 'CONTABILIZADO'),
      tipoRecepcion: this.text(row.TIPO_RECEPCION),
      fechaFisica: row.FCN_FISICA ?? row.FCNC ?? null,
      fechaAutorizacion: row.FCN_AUTORIZA ?? null,
      usuarioRecepcion: this.text(row.USR_RECEPCION),
      usuarioAutoriza: this.text(row.USR_AUTORIZA),
      nart: this.toInt(row.NART),
      almacen: this.text(row.ALMACEN || '002'),
      ...(financial
        ? {
            importe: this.toNumber(row.IMPT),
            tipoDocumento: this.nullText(row.TIPO_DOC),
            folioDocumento: this.nullText(row.FOLIO_DOC),
            observaciones: this.nullText(row.OBSERVACIONES),
          }
        : {}),
    };
  }

  private mapReceiptDetail(row: Record<string, unknown>, financial: boolean) {
    return {
      idrec: this.text(row.IDREC),
      idped: this.nullText(row.IDPED),
      pos: this.toInt(row.POS),
      art: this.text(row.ART),
      upc: this.nullText(row.UPC),
      des: this.text(row.DES),
      unidad: this.text(row.UNCOM),
      cantidadSolicitada: this.toNumber(row.CTD_SOL ?? row.CTDPED),
      cantidadRecibida: this.toNumber(row.CTD),
      cantidadAceptada: this.toNumber(row.CTD_ACEP ?? row.CTD),
      calidadEstado: this.text(row.CALIDAD_ESTATUS),
      caducidad: row.CADUCIDAD ?? null,
      observaciones: this.nullText(row.OBSERVACIONES),
      calidad: this.json(row.CALIDAD_JSON),
      tipo: this.nullText(row.TIPO),
      depa: row.DEPA ?? null,
      subd: row.SUBD ?? null,
      clas: row.CLAS ?? null,
      scla: row.SCLA ?? null,
      scla2: row.SCLA2 ?? null,
      base: this.nullText(row.BASE),
      sph: row.SPH ?? null,
      cyl: row.CYL ?? null,
      adic: row.ADIC ?? null,
      jerarquiaNombre: this.text(row.JERARQUIA_NOMBRE || 'SIN JERARQUIA'),
      ...(financial
        ? { costo: this.toNumber(row.CTO), total: this.toNumber(row.CTDVTA) }
        : {}),
    };
  }

  private pagination(query: RecepcionesQueryDto) {
    const page = Math.max(1, this.toInt(query.page) || 1);
    const limit = Math.min(200, Math.max(1, this.toInt(query.limit) || 30));
    return { page, limit, skip: (page - 1) * limit };
  }
  private required(value: unknown, field: string) {
    const result = this.text(value);
    if (!result) throw new BadRequestException(`${field} es requerido.`);
    return result;
  }
  private text(value: unknown) {
    return `${value ?? ''}`.trim();
  }
  private nullText(value: unknown) {
    const result = this.text(value);
    return result || null;
  }
  private toInt(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  private toNumber(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  private json(value: unknown) {
    if (!value) return null;
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return null;
    }
  }
  private throwSqlError(error: unknown, fallback: string): never {
    const message =
      error instanceof QueryFailedError
        ? `${(error as any).driverError?.message ?? error.message}`
        : error instanceof Error
          ? error.message
          : '';
    throw new BadRequestException(
      message.replace(/^Error:\s*/i, '').trim() || fallback,
    );
  }
}
