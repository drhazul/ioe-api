import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ListOrdenesTrabajoQueryDto } from './dto/list-ordenes-trabajo-query.dto';
import {
  AssignLaboratorioBatchDto,
  AssignOrdBatchDto,
  CambioMaterialDto,
  EntregarOrdDto,
  GarantiaOrdDto,
  MermaOrdDto,
  RecibirOrdDto,
  RegresarIncidenciaBatchDto,
  SendOrdBatchDto,
  SaveOrdDetalleDto,
  ScanOrdDto,
  SendOrdDto,
  ValidateEnviarOrdDto,
} from './dto/ordenes-trabajo-actions.dto';

type SucScope = {
  isAdmin: boolean;
  requestedSuc: string | null;
  allowedSucs: string[];
  allowedSucsCsv: string | null;
};

@Injectable()
export class OrdenesTrabajoService {
  private static readonly MODULE_CODES = [
    'DAT_JAO_ORD',
    'DAT_JAO_ORD_ANULADAS',
    'DAT_JAO_ORD_ENTREGADAS',
    'DAT_JAO_ORDS',
    'DAT_JAO_TALLER',
    'DAT_JAO_BISEL',
    'PV_ORDS',
  ] as const;

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListOrdenesTrabajoQueryDto, user: JwtPayload) {
    const scope = await this.resolveSucScope(user, query.suc ?? null);
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizePageSize(query.pageSize);
    const panelMode = this.normalizePanelMode(query.panelMode);
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    const allowedActions = this.resolveAllowedActions(
      user,
      roleCode,
      panelMode,
    );
    const allowedStatusCodes = this.resolveAllowedStatusCodes(
      user,
      roleCode,
      panelMode,
    );
    const includeNullFlow = this.shouldIncludeNullFlow(
      user,
      roleCode,
      panelMode,
    );
    const flowStatusOptions = await this.resolveFlowStatusOptions(
      allowedStatusCodes,
      includeNullFlow,
    );
    const laboratorios = await this.resolveLaboratorios(scope);
    const incidenciaOptions = await this.resolveIncidenciaOptions();
    if (this.shouldDeferEntregadasPanel(query, panelMode, scope.isAdmin)) {
      return {
        ok: true,
        page,
        pageSize,
        total: 0,
        roleCode: this.isAdmin(user) ? 'ADMIN' : roleCode,
        panelMode,
        allowedActions,
        flowStatusOptions,
        incidenciaOptions,
        laboratorios,
        items: [],
      };
    }

    const rows = await this.dataSource.query(
      `
      EXEC dbo.sp_ordenes_trabajo_panel
        @IORD=@0,
        @IDFOL=@1,
        @CLIENT=@2,
        @ART=@3,
        @TIPO=@4,
        @LABOR=@5,
        @ESTATUS=@6,
        @ESTSEGU=@7,
        @FECINI=@8,
        @FECFIN=@9,
        @ASIGN=@10,
        @TIPOM=@11,
        @MOTR=@12,
        @SUC=@13,
        @SEARCH=@14,
        @PAGE=@15,
        @PAGESIZE=@16,
        @IS_ADMIN=@17,
        @ALLOWED_SUCS=@18,
        @PANEL_MODE=@19,
        @ROLE_CODE=@20
      `,
      [
        this.normalizeText(query.iord),
        this.normalizeText(query.idfol),
        this.normalizeText(query.client),
        this.normalizeText(query.art),
        this.normalizeText(query.tipo),
        this.normalizeText(query.labor),
        this.normalizeText(query.estatus),
        this.normalizeText(query.estsegu),
        this.normalizeText(query.fecIni),
        this.normalizeText(query.fecFin),
        this.normalizeText(query.asign),
        this.normalizeText(query.tipom),
        this.normalizeText(query.motr),
        scope.requestedSuc,
        this.normalizeText(query.search),
        page,
        pageSize,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        panelMode,
        roleCode,
      ],
    );

    const items = Array.isArray(rows)
      ? rows.map((row) => {
          const out = { ...(row as Record<string, unknown>) };
          delete out.TOTAL_COUNT;
          delete out.total_count;
          return out;
        })
      : [];
    items.sort((a, b) => {
      const aTime = this.toTime(a.FCNS);
      const bTime = this.toTime(b.FCNS);
      if (aTime !== bTime) return bTime - aTime;
      const aIord = this.normalizeUpper(a.IORD ?? '');
      const bIord = this.normalizeUpper(b.IORD ?? '');
      return bIord.localeCompare(aIord);
    });
    const first = this.firstRow(rows);
    const total = this.toInt(first?.TOTAL_COUNT ?? first?.total_count) ?? 0;

    return {
      ok: true,
      page,
      pageSize,
      total,
      roleCode: this.isAdmin(user) ? 'ADMIN' : roleCode,
      panelMode,
      allowedActions,
      flowStatusOptions,
      incidenciaOptions,
      laboratorios,
      items,
    };
  }

  async getByIord(iordRaw: string, user: JwtPayload) {
    const detail = await this.getDetail(iordRaw, user);
    if (!detail.header) {
      throw new NotFoundException('ORD no encontrada');
    }
    return detail.header;
  }

  async getDetail(iordRaw: string, user: JwtPayload) {
    const iord = this.requireIord(iordRaw);
    const scope = await this.resolveSucScope(user, null);
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    await this.markAsEditandoIfNeeded(iord, roleCode, scope);

    const rows = await this.dataSource.query(
      `
      EXEC dbo.sp_ordenes_trabajo_detalle
        @IORD=@0,
        @IS_ADMIN=@1,
        @ALLOWED_SUCS=@2,
        @SUC=@3
      `,
      [iord, scope.isAdmin ? 1 : 0, scope.allowedSucsCsv, scope.requestedSuc],
    );

    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException(`No existe ORD ${iord}`);
    }

    const header = this.tryParseJsonObject(row.HEADER_JSON);
    const details = this.tryParseJsonArray(row.DETAILS_JSON);

    if (!header) {
      throw new NotFoundException(`No existe ORD ${iord}`);
    }

    return {
      ok: true,
      header,
      details,
    };
  }

  async saveDetail(
    iordRaw: string,
    dto: SaveOrdDetalleDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const scope = await this.resolveSucScope(user, null);
    const actor = this.auditActor(user);
    const commentsValue = this.normalizeText(dto.comentarios);
    const laborValue =
      dto.labor == null || !Number.isFinite(Number(dto.labor))
        ? null
        : Math.trunc(Number(dto.labor));
    const rows = Array.isArray(dto.details) ? dto.details : [];

    const exists = await this.dataSource.query(
      `
      SELECT TOP 1 1 AS ok
      FROM dbo.PV_CTR_ORDS o
      WHERE o.IORD = @0
        AND (
          @1 = 1
          OR @2 IS NULL
          OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (
            SELECT UPPER(LTRIM(RTRIM(value)))
            FROM STRING_SPLIT(ISNULL(@2, ''), ',')
            WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> ''
          )
        )
        AND (@3 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@3))
      `,
      [iord, scope.isAdmin ? 1 : 0, scope.allowedSucsCsv, scope.requestedSuc],
    );

    if (!this.firstRow(exists)) {
      throw new NotFoundException(`No existe ORD ${iord} o no tiene acceso`);
    }

    await this.dataSource.query(
      `
      UPDATE dbo.PV_CTR_ORDS
      SET
        ESTSEGU = 3.1,
        ESTATUS = 2,
        LABOR = CASE WHEN @1 IS NULL THEN LABOR ELSE @1 END,
        COMAD = CASE WHEN @2 IS NULL THEN COMAD ELSE LEFT(@2, 2000) END,
        FCNMOD = GETDATE()
      WHERE IORD = @0
      `,
      [iord, laborValue, commentsValue],
    );

    if (rows.length) {
      for (const line of rows) {
        const iordp = this.normalizeText(line.iordp);
        const job = this.normalizeUpper(line.job);
        const esf = this.normalizeText(line.esf);
        const cil = this.normalizeText(line.cil);
        const eje = this.normalizeText(line.eje);
        if (!iordp && !job) continue;

        await this.dataSource.query(
          `
          UPDATE d
          SET
            d.ESF = @3,
            d.CIL = @4,
            d.EJE = @5
          FROM dbo.PV_CTR_ORDS_DET d
          WHERE d.IORD = @0
            AND (
              (@1 IS NOT NULL AND LTRIM(RTRIM(ISNULL(CAST(d.IORDP AS NVARCHAR(255)), ''))) = @1)
              OR (@1 IS NULL AND @2 <> '' AND UPPER(LTRIM(RTRIM(ISNULL(d.JOB, '')))) = @2)
            )
          `,
          [iord, iordp, job, esf, cil, eje],
        );
      }
    }

    await this.auditMutation('ORD_GUARDAR_DETALLE', user, ip, {
      iord,
      labor: laborValue,
      comentarios: commentsValue,
      rowsUpdated: rows.length,
      actor,
    });

    const refreshed = await this.getDetail(iord, user);
    return {
      ok: true,
      message: 'Detalle ORD guardado',
      data: {
        header: refreshed.header,
        details: refreshed.details,
      },
    };
  }

  async autorizar(iordRaw: string, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('AUTORIZAR', user);
    return this.executeSimpleAction(
      'sp_ordenes_trabajo_autorizar',
      iordRaw,
      [],
      user,
      ip,
      'ORD autorizada',
      'ORD_AUTORIZAR',
    );
  }

  async enviar(
    iordRaw: string,
    dto: SendOrdDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('ENVIAR', user);
    return this.executeSimpleAction(
      'sp_ordenes_trabajo_enviar',
      iordRaw,
      [this.normalizeText(dto.asign), dto.labor ?? null],
      user,
      ip,
      'ORD enviada a taller',
      'ORD_ENVIAR',
      '@ASIGN=@1,@LABOR=@2,',
    );
  }

  async validarEnviarOrd(dto: ValidateEnviarOrdDto, user: JwtPayload) {
    await this.assertActionPermission('ENVIAR', user);
    return this.validateOrdByRequiredFlow(dto.code, user, {
      requiredFlow: 3,
      requiredFlowLabel: 'NUEVA AUTORIZADA',
      okMessage: 'ORD válida para envío',
    });
  }

  async enviarLote(dto: SendOrdBatchDto, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('ENVIAR', user);
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_enviar_lote',
      auditAction: 'ORD_ENVIAR_LOTE',
      fallbackError:
        'No se pudo enviar el lote de ORDs. Verifique estado y permisos.',
      singleMessage: '1 ORD enviada a estatus 5',
      pluralMessagePrefix: 'ORDs enviadas a estatus 5',
      notFoundMessage: 'No fue posible procesar las ORDs enviadas',
    });
  }

  async listarColaboradoresAsignar(sucRaw: string, user: JwtPayload) {
    await this.assertActionPermission('ASIGNAR', user);
    const suc = this.normalizeText(sucRaw);
    if (!suc) {
      throw new BadRequestException('suc es requerida');
    }
    const scope = await this.resolveSucScope(user, suc);
    const rows = await this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(CAST(o.IDOPV AS NVARCHAR(100)), ''))) AS IDOPV,
        LTRIM(RTRIM(ISNULL(o.NOMB, ''))) AS NOMB,
        LTRIM(RTRIM(ISNULL(o.APELP, ''))) AS APELP,
        LTRIM(RTRIM(ISNULL(o.APELM, ''))) AS APELM,
        UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) AS SUC
      FROM dbo.PV_OPV o
      WHERE TRY_CONVERT(INT, o.NIVEL) = 41
        AND UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@0)
        AND (
          @1 = 1
          OR @2 IS NULL
          OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (
            SELECT UPPER(LTRIM(RTRIM(value)))
            FROM STRING_SPLIT(ISNULL(@2, ''), ',')
            WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> ''
          )
        )
      ORDER BY NOMB, APELP, APELM, IDOPV
      `,
      [suc, scope.isAdmin ? 1 : 0, scope.allowedSucsCsv],
    );

    const items = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const rec = row as Record<string, unknown>;
        const idopv = this.normalizeText(rec.IDOPV) ?? '';
        if (!idopv) return null;
        const nomb = this.normalizeText(rec.NOMB) ?? '';
        const apelp = this.normalizeText(rec.APELP) ?? '';
        const apelm = this.normalizeText(rec.APELM) ?? '';
        const label = [nomb, apelm, apelp]
          .filter((v) => v.length > 0)
          .join(' ');
        return {
          idopv,
          nomb,
          apelp,
          apelm,
          label: label.length === 0 ? idopv : label,
          suc: this.normalizeText(rec.SUC) ?? '',
        };
      })
      .filter(
        (
          item,
        ): item is {
          idopv: string;
          nomb: string;
          apelp: string;
          apelm: string;
          label: string;
          suc: string;
        } => item !== null,
      );

    return {
      ok: true,
      suc: this.normalizeUpper(suc),
      items,
    };
  }

  async validarAsignarOrd(dto: ValidateEnviarOrdDto, user: JwtPayload) {
    await this.assertActionPermission('ASIGNAR', user);
    return this.validateOrdByRequiredFlow(dto.code, user, {
      requiredFlow: 7,
      requiredFlowLabel: 'RECIBIDA A TALLER',
      okMessage: 'ORD válida para asignación',
    });
  }

  async asignarLote(
    dto: AssignOrdBatchDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('ASIGNAR', user);
    const idopv = this.normalizeText(dto.idopv);
    if (!idopv) {
      throw new BadRequestException('idopv es requerido');
    }
    return this.executeLoteActionWithParams(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_asignar_lote',
      auditAction: 'ORD_ASIGNAR_LOTE',
      fallbackError:
        'No se pudo asignar el lote de ORDs. Verifique estado, colaborador y permisos.',
      singleMessage: '1 ORD asignada a estatus 8',
      pluralMessagePrefix: 'ORDs asignadas a estatus 8',
      notFoundMessage: 'No fue posible procesar las ORDs para asignación',
      extraSqlParams: '@IDOPV=@1,',
      extraParams: [idopv],
      auditMetadataExtra: { idopv },
    });
  }

  async validarTrabajoTerminadoOrd(
    dto: ValidateEnviarOrdDto,
    user: JwtPayload,
  ) {
    await this.assertActionPermission('TRABAJO_TERMINADO', user);
    return this.validateOrdByRequiredFlow(dto.code, user, {
      requiredFlow: 8,
      requiredFlowLabel: 'ASIGNADA',
      okMessage: 'ORD válida para trabajo terminado',
    });
  }

  async trabajoTerminadoLote(
    dto: SendOrdBatchDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('TRABAJO_TERMINADO', user);
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_trabajo_terminado_lote',
      auditAction: 'ORD_TRABAJO_TERMINADO_LOTE',
      fallbackError:
        'No se pudo marcar trabajo terminado. Verifique estado y permisos.',
      singleMessage: '1 ORD cambiada a estatus 9',
      pluralMessagePrefix: 'ORDs cambiadas a estatus 9',
      notFoundMessage:
        'No fue posible procesar las ORDs para trabajo terminado',
    });
  }

  async validarRegresarIncidenciaOrd(
    dto: ValidateEnviarOrdDto,
    user: JwtPayload,
  ) {
    await this.assertActionPermission('REGRESAR_INCIDENCIA', user);
    return this.validateOrdByRequiredFlow(dto.code, user, {
      requiredFlow: 9,
      requiredFlowLabel: 'TRABAJO TERMINADO',
      okMessage: 'ORD válida para regresar por incidencia',
    });
  }

  async regresarIncidenciaLote(
    dto: RegresarIncidenciaBatchDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('REGRESAR_INCIDENCIA', user);
    const tipom = Math.trunc(Number(dto.tipom ?? 0));
    if (!Number.isFinite(tipom) || tipom <= 0) {
      throw new BadRequestException('tipom es requerido y debe ser mayor a 0');
    }
    await this.assertIncidenciaOptionExists(tipom);
    return this.executeLoteActionWithParams(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_regresar_incidencia_lote',
      auditAction: 'ORD_REGRESAR_INCIDENCIA_LOTE',
      fallbackError:
        'No se pudo regresar por incidencia. Verifique estado, motivo y permisos.',
      singleMessage: '1 ORD cambiada a estatus 9.1',
      pluralMessagePrefix: 'ORDs cambiadas a estatus 9.1',
      notFoundMessage:
        'No fue posible procesar las ORDs para regreso por incidencia',
      extraSqlParams: '@TIPOM=@1,',
      extraParams: [tipom],
      auditMetadataExtra: { tipom },
    });
  }

  async validarRegresarTiendaOrd(dto: ValidateEnviarOrdDto, user: JwtPayload) {
    await this.assertActionPermission('REGRESAR_TIENDA', user);
    return this.validateOrdByRequiredFlow(dto.code, user, {
      requiredFlow: 9,
      requiredFlowLabel: 'TRABAJO TERMINADO',
      okMessage: 'ORD válida para regresar a tienda',
    });
  }

  async regresarTiendaLote(
    dto: SendOrdBatchDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('REGRESAR_TIENDA', user);
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_regresar_tienda_lote',
      auditAction: 'ORD_REGRESAR_TIENDA_LOTE',
      fallbackError:
        'No se pudo regresar a tienda. Verifique estado y permisos.',
      singleMessage: '1 ORD cambiada a estatus 10',
      pluralMessagePrefix: 'ORDs cambiadas a estatus 10',
      notFoundMessage:
        'No fue posible procesar las ORDs para regresar a tienda',
    });
  }

  async asignarLaboratorioLote(
    dto: AssignLaboratorioBatchDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('ASIGNAR_LABORATORIO', user);
    const labor = Number(dto.labor ?? 0);
    if (!Number.isFinite(labor) || labor <= 0) {
      throw new BadRequestException('labor es requerido y debe ser mayor a 0');
    }
    return this.executeLoteActionWithParams(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_asignar_laboratorio_lote',
      auditAction: 'ORD_ASIGNAR_LABORATORIO_LOTE',
      fallbackError:
        'No se pudo asignar laboratorio en lote. Verifique datos y permisos.',
      singleMessage: '1 ORD con laboratorio asignado',
      pluralMessagePrefix: 'ORDs con laboratorio asignado',
      notFoundMessage:
        'No fue posible procesar las ORDs para asignación de laboratorio',
      extraSqlParams: '@LABOR=@1,',
      extraParams: [Math.trunc(labor)],
      auditMetadataExtra: { labor: Math.trunc(labor) },
    });
  }

  async validarRecibirOrd(dto: ValidateEnviarOrdDto, user: JwtPayload) {
    await this.assertActionPermission('SCAN_RECIBIR', user);
    return this.validateOrdByRequiredFlow(dto.code, user, {
      requiredFlow: 5,
      requiredFlowLabel: 'ENTREGADA A MAQ O BISEL',
      okMessage: 'ORD válida para recepción',
    });
  }

  async recibirLote(dto: SendOrdBatchDto, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('SCAN_RECIBIR', user);
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_recibir_lote',
      auditAction: 'ORD_RECIBIR_LOTE',
      fallbackError:
        'No se pudo recibir el lote de ORDs. Verifique estado y permisos.',
      singleMessage: '1 ORD recibida a estatus 7',
      pluralMessagePrefix: 'ORDs recibidas a estatus 7',
      notFoundMessage: 'No fue posible procesar las ORDs recibidas',
    });
  }

  async validarEntregarOrd(dto: ValidateEnviarOrdDto, user: JwtPayload) {
    await this.assertActionPermission('SCAN_ENTREGAR', user);
    return this.validateOrdByRequiredFlow(dto.code, user, {
      requiredFlow: 10,
      requiredFlowLabel: 'REGRESADO A TIENDA',
      okMessage: 'ORD válida para entrega a cliente',
    });
  }

  async entregarLote(
    dto: SendOrdBatchDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('SCAN_ENTREGAR', user);
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_entregar_lote',
      auditAction: 'ORD_ENTREGAR_LOTE',
      fallbackError:
        'No se pudo entregar el lote de ORDs al cliente. Verifique estado y permisos.',
      singleMessage: '1 ORD entregada a cliente (estatus 11)',
      pluralMessagePrefix: 'ORDs entregadas a cliente (estatus 11)',
      notFoundMessage: 'No fue posible procesar las ORDs para entrega',
    });
  }

  async recibir(
    iordRaw: string,
    _dto: RecibirOrdDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('RECIBIR', user);
    return this.executeSimpleAction(
      'sp_ordenes_trabajo_recibir',
      iordRaw,
      [],
      user,
      ip,
      'ORD recibida',
      'ORD_RECIBIR',
    );
  }

  async entregar(
    iordRaw: string,
    dto: EntregarOrdDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('ENTREGAR', user);
    return this.executeSimpleAction(
      'sp_ordenes_trabajo_entregar',
      iordRaw,
      [
        this.normalizeText(dto.observaciones),
        this.normalizeText(dto.firmaCliente),
      ],
      user,
      ip,
      'ORD entregada a cliente',
      'ORD_ENTREGAR',
      '@OBS=@1,@FIRMA_CLIENTE=@2,',
    );
  }

  async garantia(
    iordRaw: string,
    dto: GarantiaOrdDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('GARANTIA', user);
    await this.validateOrdByRequiredFlow(iordRaw, user, {
      requiredFlow: 11,
      requiredFlowLabel: 'ENTREGADA A CLIENTE',
      okMessage: 'ORD válida para garantía',
    });
    return this.executeSimpleAction(
      'sp_ordenes_trabajo_garantia',
      iordRaw,
      [this.normalizeText(dto.motivo)],
      user,
      ip,
      'Garantia registrada',
      'ORD_GARANTIA',
      '@MOTIVO=@1,',
    );
  }

  async cambioMaterial(
    iordRaw: string,
    dto: CambioMaterialDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('CAMBIO_MATERIAL', user);
    const result = await this.executeSimpleAction(
      'sp_ordenes_trabajo_cambio_material',
      iordRaw,
      [
        this.normalizeText(dto.artNuevo),
        this.normalizeText(dto.motivo),
        dto.labor ?? null,
        this.normalizeText(dto.docDif),
      ],
      user,
      ip,
      'Cambio de material aplicado',
      'ORD_CAMBIO_MATERIAL',
      '@ART_NUEVO=@1,@MOTIVO=@2,@LABOR=@3,@DOCDIF=@4,',
    );
    await this.forceEstatus2FromActionData(result.data);
    return result;
  }

  async merma(
    iordRaw: string,
    dto: MermaOrdDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('MERMA', user);
    const result = await this.executeSimpleAction(
      'sp_ordenes_trabajo_merma',
      iordRaw,
      [
        dto.cantidadMerma,
        this.normalizeText(dto.motivo),
        dto.crearNuevaOrd == null ? 1 : dto.crearNuevaOrd ? 1 : 0,
      ],
      user,
      ip,
      'Merma procesada',
      'ORD_MERMA',
      '@CANTIDAD_MERMA=@1,@MOTIVO=@2,@CREAR_NUEVA_ORD=@3,',
    );
    await this.forceEstatus2FromActionData(result.data);
    return result;
  }

  async scanRecibir(dto: ScanOrdDto, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('SCAN_RECIBIR', user);
    const scope = await this.resolveSucScope(user, null);
    const actor = this.auditActor(user);
    const code = this.normalizeText(dto.code);
    if (!code) throw new BadRequestException('code es requerido');

    let rows: unknown[] = [];
    try {
      rows = await this.dataSource.query(
        `
        EXEC dbo.sp_ordenes_trabajo_scan_recibir
          @CODE=@0,
          @USER=@1,
          @IP=@2,
          @IS_ADMIN=@3,
          @ALLOWED_SUCS=@4,
          @SUC=@5
        `,
        [
          code,
          actor,
          ip,
          scope.isAdmin ? 1 : 0,
          scope.allowedSucsCsv,
          scope.requestedSuc,
        ],
      );
    } catch (error) {
      throw this.mapError(
        error,
        'No se pudo ejecutar escaneo de recepción. Verifique estado y permisos.',
      );
    }

    const result = this.firstRow(rows);
    if (!result)
      throw new NotFoundException(
        'No se encontro ORD para el codigo escaneado',
      );

    await this.auditMutation('ORD_SCAN_RECIBIR', user, ip, {
      code,
      result,
    });

    return {
      ok: true,
      message: 'Escaneo de recepcion aplicado',
      data: result,
    };
  }

  async scanEntregar(dto: ScanOrdDto, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('SCAN_ENTREGAR', user);
    const scope = await this.resolveSucScope(user, null);
    const actor = this.auditActor(user);
    const code = this.normalizeText(dto.code);
    if (!code) throw new BadRequestException('code es requerido');

    let rows: unknown[] = [];
    try {
      rows = await this.dataSource.query(
        `
        EXEC dbo.sp_ordenes_trabajo_scan_entregar
          @CODE=@0,
          @USER=@1,
          @IP=@2,
          @IS_ADMIN=@3,
          @ALLOWED_SUCS=@4,
          @SUC=@5
        `,
        [
          code,
          actor,
          ip,
          scope.isAdmin ? 1 : 0,
          scope.allowedSucsCsv,
          scope.requestedSuc,
        ],
      );
    } catch (error) {
      throw this.mapError(
        error,
        'No se pudo ejecutar escaneo de entrega. Verifique estado y permisos.',
      );
    }

    const result = this.firstRow(rows);
    if (!result)
      throw new NotFoundException(
        'No se encontro ORD para el codigo escaneado',
      );

    await this.auditMutation('ORD_SCAN_ENTREGAR', user, ip, {
      code,
      result,
    });

    return {
      ok: true,
      message: 'Escaneo de entrega aplicado',
      data: result,
    };
  }

  private async validateOrdByRequiredFlow(
    codeRaw: string,
    user: JwtPayload,
    options: {
      requiredFlow: number;
      requiredFlowLabel: string;
      okMessage: string;
    },
  ) {
    const code = this.normalizeText(codeRaw);
    if (!code) {
      throw new BadRequestException('code es requerido');
    }

    const scope = await this.resolveSucScope(user, null);
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        o.IORD,
        o.IDFOL,
        o.SUC,
        o.CLIEN,
        o.NCLIENTE,
        o.ART,
        o.DESCART,
        TRY_CONVERT(FLOAT, o.CTD) AS CTD,
        TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
        LTRIM(RTRIM(ISNULL(e.TIPO, ''))) AS ESTSEGU_DESC
      FROM dbo.PV_CTR_ORDS o
      LEFT JOIN dbo.DAT_EST_ORD e
        ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)
      WHERE (
          UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
          OR UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) = UPPER(@0)
        )
        AND (
          @1 = 1
          OR @2 IS NULL
          OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (
            SELECT UPPER(LTRIM(RTRIM(value)))
            FROM STRING_SPLIT(ISNULL(@2, ''), ',')
            WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> ''
          )
        )
        AND (@3 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@3))
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0) THEN 0
          ELSE 1
        END,
        ISNULL(o.FCNS, ISNULL(o.FCNMOD, o.FCNM)) DESC,
        o.IORD DESC
      `,
      [code, scope.isAdmin ? 1 : 0, scope.allowedSucsCsv, scope.requestedSuc],
    );

    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException(
        `No existe ORD para el código ${code} o no tiene acceso por sucursal`,
      );
    }

    const iord = this.normalizeText(row.IORD);
    if (!iord) {
      throw new NotFoundException('La ORD encontrada no tiene IORD válido');
    }

    const flow = this.toFloat(row.ESTSEGU);
    if (flow == null || Math.abs(flow - options.requiredFlow) > 0.0001) {
      const flowLabel = this.normalizeText(row.ESTSEGU_DESC) ?? 'SIN FLUJO';
      const flowText = flow == null ? 'SIN FLUJO' : this.formatStatusCode(flow);
      throw new BadRequestException(
        `La ORD ${iord} debe estar en estatus ${this.formatStatusCode(options.requiredFlow)} (${options.requiredFlowLabel}). Estado actual: ${flowText} ${flowLabel}`.trim(),
      );
    }

    return {
      ok: true,
      message: options.okMessage,
      data: {
        IORD: iord,
        IDFOL: this.normalizeText(row.IDFOL) ?? '',
        SUC: this.normalizeText(row.SUC) ?? '',
        CLIEN: this.normalizeText(row.CLIEN) ?? '',
        NCLIENTE: this.normalizeText(row.NCLIENTE) ?? '',
        ART: this.normalizeText(row.ART) ?? '',
        DESCART: this.normalizeText(row.DESCART) ?? '',
        CTD: this.toFloat(row.CTD) ?? 0,
        ESTSEGU: this.formatStatusCode(flow),
        ESTSEGU_DESC: this.normalizeText(row.ESTSEGU_DESC) ?? '',
      },
    };
  }

  private async executeLoteAction(
    dto: SendOrdBatchDto,
    user: JwtPayload,
    ip: string | null,
    options: {
      spName: string;
      auditAction: string;
      fallbackError: string;
      singleMessage: string;
      pluralMessagePrefix: string;
      notFoundMessage: string;
    },
  ) {
    const iords = this.normalizeDistinctIords(dto.iords);
    if (!iords.length) {
      throw new BadRequestException('Debe proporcionar al menos una ORD');
    }

    const scope = await this.resolveSucScope(user, null);
    const actor = this.auditActor(user);
    let rows: unknown[] = [];
    try {
      rows = await this.dataSource.query(
        `
        EXEC dbo.${options.spName}
          @IORDS=@0,
          @USER=@1,
          @IP=@2,
          @IS_ADMIN=@3,
          @ALLOWED_SUCS=@4,
          @SUC=@5
        `,
        [
          iords.join(','),
          actor,
          ip,
          scope.isAdmin ? 1 : 0,
          scope.allowedSucsCsv,
          scope.requestedSuc,
        ],
      );
    } catch (error) {
      throw this.mapError(error, options.fallbackError);
    }

    const resultRows = Array.isArray(rows)
      ? rows.filter((row) => row && typeof row === 'object')
      : [];

    if (!resultRows.length) {
      throw new NotFoundException(options.notFoundMessage);
    }

    await this.auditMutation(options.auditAction, user, ip, {
      iords,
      total: resultRows.length,
      result: resultRows,
    });

    return {
      ok: true,
      message:
        resultRows.length === 1
          ? options.singleMessage
          : `${options.pluralMessagePrefix}: ${resultRows.length}`,
      data: {
        total: resultRows.length,
        items: resultRows,
      },
    };
  }

  private async executeLoteActionWithParams(
    dto: SendOrdBatchDto,
    user: JwtPayload,
    ip: string | null,
    options: {
      spName: string;
      auditAction: string;
      fallbackError: string;
      singleMessage: string;
      pluralMessagePrefix: string;
      notFoundMessage: string;
      extraSqlParams: string;
      extraParams: unknown[];
      auditMetadataExtra?: Record<string, unknown>;
    },
  ) {
    const iords = this.normalizeDistinctIords(dto.iords);
    if (!iords.length) {
      throw new BadRequestException('Debe proporcionar al menos una ORD');
    }

    const scope = await this.resolveSucScope(user, null);
    const actor = this.auditActor(user);
    let rows: unknown[] = [];
    try {
      const extraCount = options.extraParams.length;
      const sql = `
        EXEC dbo.${options.spName}
          @IORDS=@0,
          ${options.extraSqlParams}
          @USER=@${1 + extraCount},
          @IP=@${2 + extraCount},
          @IS_ADMIN=@${3 + extraCount},
          @ALLOWED_SUCS=@${4 + extraCount},
          @SUC=@${5 + extraCount}
      `;
      rows = await this.dataSource.query(sql, [
        iords.join(','),
        ...options.extraParams,
        actor,
        ip,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        scope.requestedSuc,
      ]);
    } catch (error) {
      throw this.mapError(error, options.fallbackError);
    }

    const resultRows = Array.isArray(rows)
      ? rows.filter((row) => row && typeof row === 'object')
      : [];

    if (!resultRows.length) {
      throw new NotFoundException(options.notFoundMessage);
    }

    await this.auditMutation(options.auditAction, user, ip, {
      iords,
      total: resultRows.length,
      result: resultRows,
      ...(options.auditMetadataExtra ?? {}),
    });

    return {
      ok: true,
      message:
        resultRows.length === 1
          ? options.singleMessage
          : `${options.pluralMessagePrefix}: ${resultRows.length}`,
      data: {
        total: resultRows.length,
        items: resultRows,
      },
    };
  }

  private async executeSimpleAction(
    spName: string,
    iordRaw: string,
    extraParams: unknown[],
    user: JwtPayload,
    ip: string | null,
    okMessage: string,
    auditAction: string,
    extraSqlParams = '',
  ) {
    const iord = this.requireIord(iordRaw);
    const scope = await this.resolveSucScope(user, null);
    const actor = this.auditActor(user);

    const sql = `
      EXEC dbo.${spName}
        @IORD=@0,
        ${extraSqlParams}
        @USER=@${1 + extraParams.length},
        @IP=@${2 + extraParams.length},
        @IS_ADMIN=@${3 + extraParams.length},
        @ALLOWED_SUCS=@${4 + extraParams.length},
        @SUC=@${5 + extraParams.length}
    `;

    const rows = await this.dataSource.query(sql, [
      iord,
      ...extraParams,
      actor,
      ip,
      scope.isAdmin ? 1 : 0,
      scope.allowedSucsCsv,
      scope.requestedSuc,
    ]);

    const result = this.firstRow(rows);
    if (!result) {
      throw new NotFoundException(`No fue posible procesar la ORD ${iord}`);
    }

    await this.auditMutation(auditAction, user, ip, {
      iord,
      spName,
      params: extraParams,
      result,
    });

    return {
      ok: true,
      message: okMessage,
      data: result,
    };
  }

  private async forceEstatus2FromActionData(data: Record<string, unknown>) {
    const raw = [data.IORD, data.IORD_ORIG, data.IORD_NUEVA];
    const iords = [
      ...new Set(raw.map((item) => this.normalizeText(item) ?? '')),
    ].filter((item) => item.length > 0);
    if (!iords.length) return;
    await this.forceEstatus2ByIords(iords);
  }

  private async forceEstatus2ByIords(iords: string[]) {
    if (!iords.length) return;
    const valuesSql = iords.map((_, idx) => `(@${idx})`).join(',');
    await this.dataSource.query(
      `
      UPDATE o
      SET o.ESTATUS = 2
      FROM dbo.PV_CTR_ORDS o
      INNER JOIN (VALUES ${valuesSql}) v(IORD) ON o.IORD = v.IORD
      WHERE TRY_CONVERT(INT, o.ESTATUS) <> 2
      `,
      iords,
    );
  }

  private requireIord(value: string) {
    const iord = this.normalizeText(value);
    if (!iord) throw new BadRequestException('iord es requerido');
    return iord;
  }

  private async resolveSucScope(
    user: JwtPayload,
    requestedSucRaw: string | null,
  ): Promise<SucScope> {
    const isAdmin = this.isAdmin(user);
    const requestedSuc = this.normalizeText(requestedSucRaw);

    if (isAdmin) {
      return {
        isAdmin,
        requestedSuc,
        allowedSucs: [],
        allowedSucsCsv: null,
      };
    }

    const username = this.normalizeText(user?.username);
    if (!username) {
      throw new ForbiddenException(
        'Usuario sin username para validar sucursal',
      );
    }

    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) AS SUC
      FROM dbo.USR_MOD_SUC
      WHERE UPPER(LTRIM(RTRIM(ISNULL(USUARIO, '')))) = UPPER(@0)
        AND ACTIVO = 1
        AND UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) IN (${OrdenesTrabajoService.MODULE_CODES.map((_, idx) => `@${idx + 1}`).join(',')})
      `,
      [username, ...OrdenesTrabajoService.MODULE_CODES],
    );

    const allowed = this.normalizeUnique(
      (rows ?? []).map((row: Record<string, unknown>) => row.SUC),
    );

    if (!allowed.length) {
      const fallbackSuc = this.normalizeText(user?.suc);
      if (!fallbackSuc) {
        throw new ForbiddenException(
          'Usuario sin sucursal autorizada para modulo de ordenes de trabajo',
        );
      }
      allowed.push(this.normalizeUpper(fallbackSuc));
    }

    if (requestedSuc && !allowed.includes(this.normalizeUpper(requestedSuc))) {
      throw new ForbiddenException(
        'Sucursal no autorizada para ordenes de trabajo',
      );
    }

    return {
      isAdmin,
      requestedSuc,
      allowedSucs: allowed,
      allowedSucsCsv: allowed.join(','),
    };
  }

  private async assertActionPermission(action: string, user: JwtPayload) {
    if (this.isAdmin(user)) return;

    const roleCode = await this.resolveRoleCode(user);
    if (!roleCode) return;

    const allowedByAction: Record<string, string[]> = {
      AUTORIZAR: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      ENVIAR: [
        'JEF_TALLER',
        'TALLER',
        'ANALISTA_ORD',
        'ANALISTA',
        'ENC_MAQUILA',
        'ENCARGADO_MAQUILA',
        'ENC_BISEL',
        'ENCARGADO_BISELADO',
      ],
      ASIGNAR: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      TRABAJO_TERMINADO: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      REGRESAR_INCIDENCIA: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      REGRESAR_TIENDA: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      ASIGNAR_LABORATORIO: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      RECIBIR: [
        'JEF_TALLER',
        'ENC_MAQUILA',
        'ENCARGADO_MAQUILA',
        'ENC_BISEL',
        'ENCARGADO_BISELADO',
      ],
      ENTREGAR: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      GARANTIA: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      CAMBIO_MATERIAL: [
        'JEF_TALLER',
        'TALLER',
        'ANALISTA_ORD',
        'ANALISTA',
        'ENC_MAQUILA',
        'ENCARGADO_MAQUILA',
        'ENC_BISEL',
        'ENCARGADO_BISELADO',
      ],
      MERMA: [
        'JEF_TALLER',
        'TALLER',
        'ANALISTA_ORD',
        'ANALISTA',
        'ENC_MAQUILA',
        'ENCARGADO_MAQUILA',
        'ENC_BISEL',
        'ENCARGADO_BISELADO',
      ],
      SCAN_RECIBIR: [
        'JEF_TALLER',
        'ENC_MAQUILA',
        'ENCARGADO_MAQUILA',
        'ENC_BISEL',
        'ENCARGADO_BISELADO',
      ],
      SCAN_ENTREGAR: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
    };

    const allowedRoles = allowedByAction[action] ?? [];
    if (!allowedRoles.length) return;
    if (!allowedRoles.includes(roleCode)) {
      throw new ForbiddenException(
        `Rol ${roleCode} no autorizado para accion ${action}`,
      );
    }
  }

  private async resolveRoleCode(user: JwtPayload) {
    const userId = Number(user?.sub ?? 0);
    if (!Number.isFinite(userId) || userId <= 0) return '';

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 UPPER(LTRIM(RTRIM(ISNULL(r.CODIGO, '')))) AS CODIGO
      FROM dbo.USUARIO u
      LEFT JOIN dbo.ROL r ON r.IDROL = u.IDROL
      WHERE u.IDUSUARIO = @0
      `,
      [userId],
    );

    return this.normalizeUpper(this.firstRow(rows)?.CODIGO);
  }

  private isAdmin(user?: JwtPayload | null) {
    const roleId = Number(user?.roleId ?? 0);
    if (roleId === 1) return true;

    const username = this.normalizeUpper(user?.username ?? '');
    if (username === 'ADMIN') return true;

    const adminRoleIds = this.normalizeUnique(
      String(
        this.config.get('ADMIN_ROLE_IDS') ??
          this.config.get('ADMIN_ROLE_ID') ??
          '',
      )
        .split(',')
        .map((item) => item.trim()),
    )
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));

    if (adminRoleIds.includes(roleId)) return true;

    const nivel = Number(
      (user as Record<string, unknown> | undefined)?.['nivel'] ?? 0,
    );
    const adminNiveles = this.normalizeUnique(
      String(
        this.config.get('ADMIN_NIVELES') ??
          this.config.get('ADMIN_NIVEL') ??
          '',
      )
        .split(',')
        .map((item) => item.trim()),
    )
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));

    return adminNiveles.includes(nivel);
  }

  private normalizePanelMode(
    value?: string,
  ): 'operativo' | 'anulados' | 'entregadas' {
    const raw = this.normalizeUpper(value ?? '');
    if (raw === 'ANULADOS') return 'anulados';
    if (raw === 'ENTREGADAS') return 'entregadas';
    return 'operativo';
  }

  private shouldDeferEntregadasPanel(
    query: ListOrdenesTrabajoQueryDto,
    panelMode: 'operativo' | 'anulados' | 'entregadas',
    isAdmin: boolean,
  ) {
    if (panelMode !== 'entregadas') return false;
    const hasManualCriteria =
      this.normalizeText(query.iord) != null ||
      this.normalizeText(query.idfol) != null ||
      this.normalizeText(query.client) != null ||
      this.normalizeText(query.art) != null ||
      this.normalizeText(query.tipo) != null ||
      this.normalizeText(query.labor) != null ||
      this.normalizeText(query.estatus) != null ||
      this.normalizeText(query.estsegu) != null ||
      this.normalizeText(query.fecIni) != null ||
      this.normalizeText(query.fecFin) != null ||
      this.normalizeText(query.asign) != null ||
      this.normalizeText(query.tipom) != null ||
      this.normalizeText(query.motr) != null ||
      this.normalizeText(query.search) != null ||
      (isAdmin && this.normalizeText(query.suc) != null);
    return !hasManualCriteria;
  }

  private resolveAllowedStatusCodes(
    user: JwtPayload,
    roleCodeRaw: string,
    panelMode: 'operativo' | 'anulados' | 'entregadas',
  ) {
    if (this.isAdmin(user)) {
      if (panelMode === 'anulados') return [4];
      if (panelMode === 'entregadas') return [11];
      return [2, 3, 3.1, 5, 6, 7, 8, 9, 9.1, 9.2, 10, 12];
    }

    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (panelMode === 'anulados') {
      return roleCode === 'JEF_TALLER' || roleCode === 'TALLER' ? [4] : [];
    }
    if (panelMode === 'entregadas') {
      return roleCode === 'JEF_TALLER' || roleCode === 'TALLER' ? [11] : [];
    }

    if (roleCode === 'JEF_TALLER' || roleCode === 'TALLER') {
      return [2, 3, 3.1, 5, 6, 7, 8, 9, 9.1, 9.2, 10, 12];
    }
    if (roleCode === 'ANALISTA_ORD' || roleCode === 'ANALISTA') {
      return [2, 3, 3.1, 6, 9.1, 9.2, 10, 12];
    }
    if (
      roleCode === 'ENC_MAQUILA' ||
      roleCode === 'ENCARGADO_MAQUILA' ||
      roleCode === 'ENC_BISEL' ||
      roleCode === 'ENCARGADO_BISELADO'
    ) {
      return [5, 7, 8, 9];
    }
    return [];
  }

  private async resolveFlowStatusOptions(
    codes: number[],
    includeNullFlow = false,
  ) {
    if (!codes.length) {
      return includeNullFlow ? [{ value: 'NULL', label: 'SIN FLUJO' }] : [];
    }
    const placeholders = codes.map((_, idx) => `@${idx}`).join(',');
    const rows = await this.dataSource.query(
      `
      SELECT
        TRY_CONVERT(FLOAT, ESTA) AS ESTA,
        LTRIM(RTRIM(ISNULL(TIPO, ''))) AS TIPO
      FROM dbo.DAT_EST_ORD
      WHERE TRY_CONVERT(FLOAT, ESTA) IN (${placeholders})
      ORDER BY TRY_CONVERT(FLOAT, ESTA)
      `,
      codes,
    );

    const options = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const value = Number((row as Record<string, unknown>)['ESTA']);
        if (!Number.isFinite(value)) return null;
        const label =
          this.normalizeText((row as Record<string, unknown>)['TIPO']) ?? '';
        return {
          value: this.formatStatusCode(value),
          label,
        };
      })
      .filter(
        (item): item is { value: string; label: string } => item !== null,
      );

    const known = new Set(options.map((item) => item.value));
    for (const code of codes) {
      const codeText = this.formatStatusCode(code);
      if (!known.has(codeText)) {
        options.push({ value: codeText, label: '' });
      }
    }

    options.sort((a, b) => Number(a.value) - Number(b.value));
    if (includeNullFlow) {
      options.push({ value: 'NULL', label: 'SIN FLUJO' });
    }
    return options;
  }

  private shouldIncludeNullFlow(
    user: JwtPayload,
    roleCodeRaw: string,
    panelMode: 'operativo' | 'anulados' | 'entregadas',
  ) {
    if (panelMode !== 'operativo') return false;
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return (
      roleCode === 'JEF_TALLER' ||
      roleCode === 'TALLER' ||
      roleCode === 'ANALISTA_ORD' ||
      roleCode === 'ANALISTA'
    );
  }

  private async resolveIncidenciaOptions() {
    const fallback = [
      { id: 1, label: 'CAMBIO DE ARTICULO' },
      { id: 2, label: 'MERMA DE ART Y CAMBIO' },
    ] as Array<{ id: number; label: string }>;

    const tableExists = await this.dataSource.query(`
      SELECT 1
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'DAT_ORD_TMOV'
    `);
    if (!Array.isArray(tableExists) || tableExists.length == 0) {
      return fallback;
    }

    const rows = await this.dataSource.query(`
      SELECT
        TRY_CONVERT(INT, IDT) AS IDT,
        LTRIM(RTRIM(ISNULL(TIPOM, ''))) AS TIPOM
      FROM dbo.DAT_ORD_TMOV
      ORDER BY TRY_CONVERT(INT, IDT), LTRIM(RTRIM(ISNULL(TIPOM, '')))
    `);

    const items = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const data = row as Record<string, unknown>;
        const id = this.toInt(data['IDT']) ?? 0;
        const label = this.normalizeText(data['TIPOM']) ?? '';
        if (id <= 0 || !label) return null;
        return { id, label };
      })
      .filter((item): item is { id: number; label: string } => item !== null);

    return items.length === 0 ? fallback : items;
  }

  private async assertIncidenciaOptionExists(tipom: number) {
    const options = await this.resolveIncidenciaOptions();
    if (options.some((item) => item.id === tipom)) return;
    throw new BadRequestException(
      `El motivo de incidencia ${tipom} no existe en DAT_ORD_TMOV`,
    );
  }

  private async resolveLaboratorios(scope: SucScope) {
    if (
      !(
        await this.dataSource.query(`
        SELECT 1
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'DAT_LAB'
      `)
      ).length
    ) {
      return [];
    }

    const rows = await this.dataSource.query(
      `
      WITH raw AS (
        SELECT
          TRY_CONVERT(INT, l.ID) AS ID,
          LTRIM(RTRIM(ISNULL(l.LAB, ''))) AS LAB,
          LTRIM(RTRIM(ISNULL(l.TIPOLAB, ''))) AS TIPOLAB,
          LTRIM(RTRIM(ISNULL(l.SUC, ''))) AS SUC,
          ROW_NUMBER() OVER (
            PARTITION BY TRY_CONVERT(INT, l.ID)
            ORDER BY
              CASE
                WHEN @0 IS NOT NULL
                  AND UPPER(LTRIM(RTRIM(ISNULL(l.SUC, '')))) = UPPER(@0)
                  THEN 0
                WHEN LTRIM(RTRIM(ISNULL(l.SUC, ''))) = '' THEN 1
                ELSE 2
              END,
              UPPER(LTRIM(RTRIM(ISNULL(l.LAB, ''))))
          ) AS RN
        FROM dbo.DAT_LAB l
        WHERE ISNULL(l.BLOQ, 0) = 0
      )
      SELECT ID, LAB, TIPOLAB, SUC
      FROM raw
      WHERE RN = 1
      ORDER BY UPPER(LTRIM(RTRIM(ISNULL(LAB, '')))), ID
      `,
      [scope.requestedSuc],
    );

    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const id = this.toInt((row as Record<string, unknown>)['ID']) ?? 0;
        const lab =
          this.normalizeText((row as Record<string, unknown>)['LAB']) ?? '';
        const tipoLab =
          this.normalizeText((row as Record<string, unknown>)['TIPOLAB']) ?? '';
        const suc =
          this.normalizeText((row as Record<string, unknown>)['SUC']) ?? '';
        if (id <= 0 || !lab) return null;
        return { id, lab, tipoLab, suc };
      })
      .filter(
        (
          item,
        ): item is { id: number; lab: string; tipoLab: string; suc: string } =>
          item !== null,
      );
  }

  private formatStatusCode(value: number) {
    const rounded = Math.round(value * 1000) / 1000;
    const text = rounded.toString();
    return text.endsWith('.0') ? text.slice(0, -2) : text;
  }

  private resolveAllowedActions(
    user: JwtPayload,
    roleCodeRaw: string,
    panelMode: 'operativo' | 'anulados' | 'entregadas',
  ) {
    const operationalActions = [
      'VER_DETALLE',
      'AUTORIZAR',
      'ENVIAR',
      'ASIGNAR',
      'TRABAJO_TERMINADO',
      'REGRESAR_INCIDENCIA',
      'REGRESAR_TIENDA',
      'ASIGNAR_LABORATORIO',
      'RECIBIR',
      'ENTREGAR',
      'CAMBIO_MATERIAL',
      'MERMA',
      'SCAN_RECIBIR',
      'SCAN_ENTREGAR',
    ];

    if (this.isAdmin(user)) {
      if (panelMode === 'anulados') return ['VER_DETALLE'];
      if (panelMode === 'entregadas') return ['VER_DETALLE', 'GARANTIA'];
      return operationalActions;
    }

    const roleCode = this.normalizeUpper(roleCodeRaw);
    const byRole: Record<string, string[]> = {
      JEF_TALLER: operationalActions,
      TALLER: [
        'VER_DETALLE',
        'AUTORIZAR',
        'ENVIAR',
        'ASIGNAR',
        'TRABAJO_TERMINADO',
        'REGRESAR_INCIDENCIA',
        'REGRESAR_TIENDA',
        'ASIGNAR_LABORATORIO',
        'ENTREGAR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_ENTREGAR',
      ],
      ANALISTA_ORD: [
        'VER_DETALLE',
        'AUTORIZAR',
        'ENVIAR',
        'ASIGNAR',
        'TRABAJO_TERMINADO',
        'REGRESAR_INCIDENCIA',
        'REGRESAR_TIENDA',
        'ASIGNAR_LABORATORIO',
        'ENTREGAR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_ENTREGAR',
      ],
      ANALISTA: [
        'VER_DETALLE',
        'AUTORIZAR',
        'ENVIAR',
        'ASIGNAR',
        'TRABAJO_TERMINADO',
        'REGRESAR_INCIDENCIA',
        'REGRESAR_TIENDA',
        'ASIGNAR_LABORATORIO',
        'ENTREGAR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_ENTREGAR',
      ],
      ENC_MAQUILA: [
        'VER_DETALLE',
        'ENVIAR',
        'RECIBIR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_RECIBIR',
      ],
      ENCARGADO_MAQUILA: [
        'VER_DETALLE',
        'ENVIAR',
        'RECIBIR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_RECIBIR',
      ],
      ENC_BISEL: [
        'VER_DETALLE',
        'ENVIAR',
        'RECIBIR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_RECIBIR',
      ],
      ENCARGADO_BISELADO: [
        'VER_DETALLE',
        'ENVIAR',
        'RECIBIR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_RECIBIR',
      ],
    };

    const allowed = byRole[roleCode] ?? [];
    if (panelMode === 'anulados') {
      if (roleCode === 'JEF_TALLER' || roleCode === 'TALLER')
        return ['VER_DETALLE'];
      return [];
    }
    if (panelMode === 'entregadas') {
      if (roleCode === 'JEF_TALLER' || roleCode === 'TALLER')
        return ['VER_DETALLE', 'GARANTIA'];
      return [];
    }
    return allowed;
  }

  private async markAsEditandoIfNeeded(
    iord: string,
    roleCodeRaw: string,
    scope: SucScope,
  ) {
    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (roleCode !== 'ANALISTA_ORD' && roleCode !== 'ANALISTA') return;

    await this.dataSource.query(
      `
      UPDATE o
      SET
        o.ESTSEGU = 3.1,
        o.ESTATUS = 2,
        o.FCNMOD = GETDATE()
      FROM dbo.PV_CTR_ORDS o
      WHERE o.IORD = @0
        AND TRY_CONVERT(FLOAT, o.ESTSEGU) = 3
        AND TRY_CONVERT(INT, o.ESTATUS) = 2
        AND (
          @1 = 1
          OR @2 IS NULL
          OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (
            SELECT UPPER(LTRIM(RTRIM(value)))
            FROM STRING_SPLIT(ISNULL(@2, ''), ',')
            WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> ''
          )
        )
        AND (@3 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@3))
      `,
      [iord, scope.isAdmin ? 1 : 0, scope.allowedSucsCsv, scope.requestedSuc],
    );
  }

  private normalizePage(value?: number) {
    const parsed = Number(value ?? 1);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.trunc(parsed);
  }

  private normalizePageSize(value?: number) {
    const parsed = Number(value ?? 25);
    if (!Number.isFinite(parsed) || parsed < 1) return 25;
    return Math.min(Math.trunc(parsed), 25);
  }

  private normalizeUnique(values: unknown[]) {
    const set = new Set<string>();
    for (const value of values) {
      const normalized = this.normalizeUpper(value);
      if (!normalized) continue;
      set.add(normalized);
    }
    return [...set];
  }

  private normalizeDistinctIords(values: unknown[]) {
    const set = new Set<string>();
    for (const value of values) {
      const iord = this.normalizeUpper(value);
      if (!iord) continue;
      set.add(iord);
    }
    return [...set];
  }

  private normalizeText(value: unknown) {
    const text = String(value ?? '').trim();
    return text.length ? text : null;
  }

  private normalizeUpper(value: unknown) {
    const text = String(value ?? '')
      .trim()
      .toUpperCase();
    return text.length ? text : '';
  }

  private auditActor(user: JwtPayload) {
    const username = this.normalizeText(user?.username);
    if (username) return username;
    const sub = Number(user?.sub ?? 0);
    if (Number.isFinite(sub) && sub > 0) {
      return String(sub);
    }
    return 'system';
  }

  private async auditMutation(
    action: string,
    user: JwtPayload,
    ip: string | null,
    metadata: Record<string, unknown>,
  ) {
    const idusuario = Number(user?.sub ?? 0);
    await this.audit.log({
      IDUSUARIO: Number.isFinite(idusuario) && idusuario > 0 ? idusuario : null,
      ACTION: action,
      MODULO: 'ordenes-trabajo',
      ENTIDAD: 'PV_CTR_ORDS',
      ENTIDAD_ID: this.normalizeText(metadata['iord']) ?? null,
      SUC: this.normalizeText(user?.suc),
      IP: ip,
      METADATA_JSON: JSON.stringify(metadata),
    });
  }

  private firstRow(rows: unknown): Record<string, unknown> | null {
    if (!Array.isArray(rows) || !rows.length) return null;
    const row = rows[0];
    if (!row || typeof row !== 'object') return null;
    return row as Record<string, unknown>;
  }

  private toInt(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  }

  private toFloat(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  private mapError(error: unknown, fallback: string): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      return error;
    }

    if (error instanceof QueryFailedError) {
      const message = this.extractSqlMessage(error);
      return new BadRequestException(message || fallback);
    }

    if (error instanceof Error) {
      return new BadRequestException(error.message || fallback);
    }

    return new BadRequestException(fallback);
  }

  private extractSqlMessage(error: QueryFailedError) {
    const errAny = error as any;
    const driver = errAny?.driverError ?? errAny?.originalError ?? null;
    const driverMessage = this.normalizeText(driver?.message) ?? '';
    const baseMessage = this.normalizeText(errAny?.message) ?? '';
    const raw = driverMessage || baseMessage;
    if (!raw) return '';

    return raw
      .replace(/^QueryFailedError:\s*/i, '')
      .replace(/^RequestError:\s*/i, '')
      .replace(/\s+\bat line \d+\b/i, '')
      .trim();
  }

  private toTime(value: unknown) {
    if (value instanceof Date) {
      const ms = value.getTime();
      return Number.isFinite(ms) ? ms : 0;
    }
    const text = String(value ?? '').trim();
    if (!text) return 0;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private tryParseJsonObject(value: unknown): Record<string, unknown> | null {
    const text = String(value ?? '').trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private tryParseJsonArray(value: unknown): Record<string, unknown>[] {
    const text = String(value ?? '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => item as Record<string, unknown>);
    } catch {
      return [];
    }
  }
}
