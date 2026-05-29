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
  AplicarMermaCambioDto,
  ActualizarArticuloCambioMermaDto,
  AssignLaboratorioBatchDto,
  AssignOrdBatchDto,
  CambioMaterialDto,
  CambioMermaContextDto,
  CrearCambioMermaDto,
  EntregarOrdDto,
  GarantiaOrdDto,
  MermaOrdDto,
  PrepararCambioMermaDto,
  RecibirOrdDto,
  RegresarIncidenciaBatchDto,
  SolicitarAutorizacionCambioMermaDto,
  SendOrdBatchDto,
  SaveOrdDetalleDto,
  ScanOrdDto,
  SendOrdDto,
  ValidateEnviarOrdDto,
} from './dto/ordenes-trabajo-actions.dto';

type SucScope = {
  isAdmin: boolean;
  homeSuc: string | null;
  requestedSuc: string | null;
  allowedSucs: string[];
  allowedSucsCsv: string | null;
};

type CambioMermaFinance = {
  subtotal: number;
  iva: number;
  total: number;
};

type CambioMermaOriginalContext = {
  row: Record<string, unknown>;
  scope: SucScope;
  roleCode: string;
};

type OrdFlowVisibilityRule = {
  estsegu: number;
  onlyExternalLab: boolean;
};

@Injectable()
export class OrdenesTrabajoService {
  private static readonly MODULE_CODES = [
    'DAT_JAO_ORD',
    'DAT_JAO_ORD_ESTADO',
    'DAT_JAO_ORD_ANULADAS',
    'DAT_JAO_ORD_ENTREGADAS',
    'DAT_JAO_ORD_GARANTIA',
    'DAT_JAO_ORD_GARANTIAS',
    'DAT_JAO_ORD_TRABAJO_TERMINADO',
    'DAT_JAO_ORD_TERMINADO',
    'DAT_JAO_ORD_FINALIZAR',
    'DAT_JAO_ORDS',
    'DAT_JAO_TALLER',
    'DAT_JAO_BISEL',
    'PV_ORDS',
  ] as const;
  private static readonly MODULE_CODES_INV_SCOPE = ['DAT_JAA_ALM'] as const;
  private flowVisibilityTableExists: boolean | null = null;
  private readonly flowVisibilityPanelConfigCache = new Map<string, boolean>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private buildOrdLaboratorioJoinSql(ordAlias: string, labAlias: string) {
    return `
      LEFT JOIN dbo.DAT_LAB ${labAlias}
        ON TRY_CONVERT(INT, ${labAlias}.ID) = TRY_CONVERT(INT, ${ordAlias}.LABOR)
    `;
  }

  private buildOrdAllowedSucSql(
    ordAlias: string,
    _labAlias: string,
    isAdminParam: string,
    allowedSucsParam: string,
    _roleCodeParam: string,
    _homeSucParam: string,
    requestedSucParam = 'NULL',
  ) {
    return `
      (
        ${isAdminParam} = 1
        OR (
          (
            ${allowedSucsParam} IS NULL
            OR UPPER(LTRIM(RTRIM(ISNULL(${ordAlias}.SUC, '')))) IN (
              SELECT UPPER(LTRIM(RTRIM(value)))
              FROM STRING_SPLIT(ISNULL(${allowedSucsParam}, ''), ',')
              WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> ''
            )
          )
          AND (
            ${requestedSucParam} IS NULL
            OR UPPER(LTRIM(RTRIM(ISNULL(${ordAlias}.SUC, '')))) = UPPER(${requestedSucParam})
          )
        )
      )
    `;
  }

  private buildOrdRequestedSucSql(ordAlias: string, requestedSucParam: string) {
    return `
      (
        ${requestedSucParam} IS NULL
        OR UPPER(LTRIM(RTRIM(ISNULL(${ordAlias}.SUC, '')))) = UPPER(${requestedSucParam})
      )
    `;
  }

  async list(query: ListOrdenesTrabajoQueryDto, user: JwtPayload) {
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    const scope = await this.resolveSucScope(
      user,
      query.suc ?? null,
      roleCode,
    );
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizePageSize(query.pageSize);
    const panelMode = this.normalizePanelMode(query.panelMode);
    const allowedActions = this.resolveAllowedActions(
      user,
      roleCode,
      panelMode,
    );
    const allowedStatusCodes = await this.resolveAllowedStatusCodes(
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
    if (this.shouldDeferPanel(query, panelMode, scope.isAdmin)) {
      return {
        ok: true,
        page,
        pageSize,
        total: 0,
        roleCode: this.isAdmin(user) ? 'ADMIN' : roleCode,
        panelMode,
        allowedSucs: scope.allowedSucs,
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
        @HOME_SUC=@19,
        @PANEL_MODE=@20,
        @ROLE_CODE=@21
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
        scope.homeSuc,
        panelMode,
        roleCode,
      ],
    );

    const rawItems = Array.isArray(rows)
      ? rows.map((row) => {
          const out = { ...(row as Record<string, unknown>) };
          delete out.TOTAL_COUNT;
          delete out.total_count;
          return out;
        })
      : [];
    const itemsByAllowedStatus = this.applyAllowedStatusFilterToItems(
      rawItems,
      allowedStatusCodes,
      includeNullFlow,
    );
    const visibilityRules = await this.resolveFlowVisibilityRules(
      user,
      roleCode,
      panelMode,
    );
    const itemsAfterVisibility = await this.applyFlowVisibilityRulesToItems(
      itemsByAllowedStatus,
      visibilityRules,
      scope,
      roleCode,
    );
    const asignLabels = await this.resolveOpvLabels(
      itemsAfterVisibility.map((item) => item.ASIGN),
    );
    const opvLabels = await this.resolveUsuarioLabels(
      itemsAfterVisibility.map((item) => item.OPV_ID ?? item.OPV),
    );
    const items = itemsAfterVisibility.map((item) => {
      const asignId = this.normalizeText(item.ASIGN);
      const asignLabel = asignId == null ? null : asignLabels.get(asignId);
      const opvId = this.normalizeText(item.OPV_ID ?? item.OPV);
      const opvLabel = opvId == null ? null : opvLabels.get(opvId);
      if (asignLabel == null && opvLabel == null) return item;
      return {
        ...item,
        ...(asignId == null ? {} : { ASIGN_ID: asignId }),
        ...(asignLabel == null
          ? {}
          : { ASIGN_LABEL: asignLabel, ASIGN: asignLabel }),
        ...(opvId == null ? {} : { OPV_ID: opvId }),
        ...(opvLabel == null ? {} : { OPV_LABEL: opvLabel, OPV: opvLabel }),
      };
    });
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
      allowedSucs: scope.allowedSucs,
      allowedActions,
      flowStatusOptions,
      incidenciaOptions,
      laboratorios,
      items,
    };
  }

  async listMotivosMovimiento(tipoRaw: string | undefined, user: JwtPayload) {
    const tipo = this.toInt(tipoRaw);
    if (tipo != null && tipo !== 1 && tipo !== 2) {
      throw new BadRequestException(
        'tipo debe ser 1 (CAMBIO MATERIAL) o 2 (MERMA)',
      );
    }
    if (tipo == 1) {
      await this.assertActionPermission('CAMBIO_MATERIAL', user);
    } else if (tipo == 2) {
      await this.assertActionPermission('MERMA', user);
    } else {
      await this.assertAnyActionPermission(
        ['CAMBIO_MATERIAL', 'MERMA'],
        user,
        'Rol no autorizado para consultar motivos de cambio/merma',
      );
    }
    const items = await this.resolveMovimientoMotivos(tipo ?? null);
    return {
      ok: true,
      tipo,
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
    await this.assertOrdTypeAccessByIord(iord, user, scope);

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
    const details = this.sortOrdDetails(
      this.tryParseJsonArray(row.DETAILS_JSON),
    );

    if (!header) {
      throw new NotFoundException(`No existe ORD ${iord}`);
    }

    return {
      ok: true,
      header,
      details,
    };
  }

  async getCambioMermaContext(
    iordRaw: string,
    query: CambioMermaContextDto,
    user: JwtPayload,
  ) {
    const iord = this.requireIord(iordRaw);
    const tipo = this.normalizeCambioMermaTipo(query.tipo);
    await this.assertCambioMermaContextPermission(tipo, user);

    let staging = await this.fetchCambioMermaStagingIfAny(iord, tipo);
    const original = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
      { allowFinalized: true },
    );
    if (staging) {
      const actor = this.auditActor(user);
      const finalIord =
        this.normalizeText(original.row.REEORD) ??
        this.normalizeText(original.row.REOORD) ??
        '';
      const estsegu = this.toFloat(original.row.ESTSEGU) ?? 0;
      const isFinalizedFlow = Math.abs(estsegu - 4) <= 0.0001;
      const finalIordExists = finalIord
        ? await this.hasOrdHeader(finalIord)
        : false;

      // Cuando la ORD ya está finalizada, staging debe reflejar la IORD real creada
      // y nunca regenerar una nueva reserva para evitar "fantasmas" en contexto.
      if (isFinalizedFlow && finalIordExists) {
        const stagedIord = this.normalizeText(staging.NVA_IORD) ?? '';
        if (this.normalizeUpper(stagedIord) !== this.normalizeUpper(finalIord)) {
          await this.markCambioMermaStagingCreated(
            iord,
            tipo,
            finalIord,
            this.toFloat(staging.DIFERENCIA_ECONOMICA),
            actor,
          );
          staging = await this.fetchCambioMermaStaging(iord, tipo);
        }
      } else {
        const ensuredIord = await this.resolveCambioMermaReservedIord(
          this.normalizeText(original.row.SUC) ?? '',
          staging,
          {
            iord,
            tipo,
            actor,
          },
        );
        if (ensuredIord !== (this.normalizeText(staging.NVA_IORD) ?? '')) {
          staging = await this.fetchCambioMermaStaging(iord, tipo);
        }
      }
    }
    return this.buildCambioMermaContextResponse(iord, tipo, original.row, staging);
  }

  async prepararCambioMerma(
    iordRaw: string,
    dto: PrepararCambioMermaDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const tipo = this.normalizeCambioMermaTipo(dto.tipo);
    await this.assertActionPermission(
      tipo === 1 ? 'CAMBIO_MATERIAL' : 'MERMA',
      user,
    );
    await this.assertCambioMermaStagingTable();

    const original = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const stagingBefore = await this.fetchCambioMermaStagingIfAny(iord, tipo);
    await this.assertCambioMermaStagingUnlocked(iord, stagingBefore);
    const selCtrlOrd = this.toInt(original.row.selCtrlOrd);
    if (!this.isSelCtrlOrdEditable(selCtrlOrd)) {
      throw new BadRequestException(
        `La ORD ${iord} está bloqueada para edición (selCtrlOrd=${selCtrlOrd ?? 'NULL'}).`,
      );
    }

    const ctdOriginal = this.toFloat(original.row.CTD) ?? 0;
    const ctdCM = this.resolveCtdCM(
      dto.ctdCM,
      original.row.CTD_C_M,
      ctdOriginal,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal);
    const motivo = await this.resolveMovimientoMotrAndLabel(
      tipo,
      dto.motivo,
      this.toInt(dto.motr) ?? this.toInt(original.row.MOTR) ?? undefined,
    );
    const pvtaOriginal = await this.resolveCambioMermaOriginalUnitPrice(
      iord,
      original.row,
    );
    const nvaIord = await this.resolveCambioMermaReservedIord(
      this.normalizeText(original.row.SUC) ?? '',
      stagingBefore,
      {
        iord,
        tipo,
        actor: this.auditActor(user),
      },
    );

    await this.upsertCambioMermaStaging(
      iord,
      tipo,
      {
        artNuevo: this.normalizeText(original.row.ART),
        motr: motivo.id,
        motivo: motivo.label,
        labor: this.toInt(original.row.LABOR),
        docDif: this.normalizeText(original.row.DOCDIF),
        ctdCM,
        crearNuevaOrd: true,
        pvtaNuevo: pvtaOriginal,
        diferenciaEconomica: null,
        nvaIord,
      },
      this.auditActor(user),
    );

    await this.updateCambioMermaOriginalState(iord, 13, ctdCM, motivo.id);

    await this.auditMutation('ORD_CAMBIO_MERMA_PREPARAR', user, ip, {
      iord,
      tipo,
      selCtrlOrd: 13,
      ctdCM,
    });

    const updatedOriginal = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const staging = await this.fetchCambioMermaStaging(iord, tipo);
    const context = await this.buildCambioMermaContextResponse(
      iord,
      tipo,
      updatedOriginal.row,
      staging,
    );
    await this.syncCambioMermaStagingDiferencia(
      iord,
      tipo,
      this.toFloat(context.diferenciaEconomica),
      this.auditActor(user),
    );
    return {
      ...context,
      message: 'Nueva ORD en edición/captura',
    };
  }

  async actualizarArticuloCambioMerma(
    iordRaw: string,
    dto: ActualizarArticuloCambioMermaDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const tipo = this.normalizeCambioMermaTipo(dto.tipo);
    await this.assertActionPermission(
      tipo === 1 ? 'CAMBIO_MATERIAL' : 'MERMA',
      user,
    );
    await this.assertCambioMermaStagingTable();

    const original = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const staging = await this.fetchCambioMermaStaging(iord, tipo);
    if (!staging) {
      throw new BadRequestException(
        `La ORD ${iord} no tiene registro temporal para actualizar artículo.`,
      );
    }
    await this.assertCambioMermaStagingUnlocked(iord, staging);
    const selCtrlOrd = this.toInt(original.row.selCtrlOrd);
    if (!this.isSelCtrlOrdEditable(selCtrlOrd)) {
      throw new BadRequestException(
        `La ORD ${iord} no admite reemplazo de artículo en selCtrlOrd=${selCtrlOrd ?? 'NULL'}.`,
      );
    }

    const artOriginal = this.normalizeText(original.row.ART) ?? '';
    const artNuevo = this.normalizeText(dto.artNuevo);
    if (!artNuevo) {
      throw new BadRequestException(
        'Debe seleccionar un artículo válido para la nueva ORD.',
      );
    }
    if (
      tipo === 1 &&
      artNuevo &&
      this.normalizeUpper(artNuevo) === this.normalizeUpper(artOriginal)
    ) {
      throw new BadRequestException(
        'El artículo nuevo debe ser distinto al artículo original.',
      );
    }

    const suc = this.normalizeText(original.row.SUC) ?? '';
    let pvtaNuevo = this.toFloat(dto.pvtaNuevo);
    if (pvtaNuevo == null) {
      const artInfo = await this.resolveArticuloDatArt(suc, artNuevo);
      pvtaNuevo = this.toFloat(artInfo?.pvta);
    }
    if (pvtaNuevo == null) {
      pvtaNuevo = await this.resolveCambioMermaOriginalUnitPrice(
        iord,
        original.row,
      );
    }
    if (pvtaNuevo == null || !Number.isFinite(pvtaNuevo) || pvtaNuevo < 0) {
      throw new BadRequestException('pvtaNuevo inválido para cambio/merma.');
    }
    pvtaNuevo = this.roundMoney(pvtaNuevo);

    const ctdOriginal = this.toFloat(original.row.CTD) ?? 0;
    const ctdCM = this.resolveCtdCM(
      staging.CTD_C_M,
      original.row.CTD_C_M,
      ctdOriginal,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal);

    const nvaIord = await this.resolveCambioMermaReservedIord(suc, staging, {
      iord,
      tipo,
      actor: this.auditActor(user),
    });

    await this.upsertCambioMermaStaging(
      iord,
      tipo,
      {
        artNuevo,
        pvtaNuevo,
        diferenciaEconomica: null,
        motr: this.toInt(staging.MOTR) ?? this.toInt(original.row.MOTR),
        motivo:
          this.normalizeText(staging.MOTIVO) ??
          this.normalizeText(original.row.MOTR),
        labor: this.toInt(staging.LABOR) ?? this.toInt(original.row.LABOR),
        docDif:
          this.normalizeText(staging.DOCDIF) ??
          this.normalizeText(original.row.DOCDIF),
        ctdCM,
        crearNuevaOrd:
          (this.toInt(staging.CREAR_NUEVA_ORD) ?? 1) !== 0,
        nvaIord,
      },
      this.auditActor(user),
    );

    await this.auditMutation('ORD_CAMBIO_MERMA_ACTUALIZAR_ART', user, ip, {
      iord,
      tipo,
      artNuevo,
      pvtaNuevo,
    });

    const refreshedStaging = await this.fetchCambioMermaStaging(iord, tipo);
    const context = await this.buildCambioMermaContextResponse(
      iord,
      tipo,
      original.row,
      refreshedStaging,
    );
    await this.syncCambioMermaStagingDiferencia(
      iord,
      tipo,
      this.toFloat(context.diferenciaEconomica),
      this.auditActor(user),
    );
    return {
      ...context,
      message: 'Artículo actualizado en captura temporal.',
    };
  }

  async solicitarAutorizacionCambioMerma(
    iordRaw: string,
    dto: SolicitarAutorizacionCambioMermaDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const tipo = this.normalizeCambioMermaTipo(dto.tipo);
    await this.assertActionPermission(
      tipo === 1 ? 'CAMBIO_MATERIAL' : 'MERMA',
      user,
    );
    await this.assertCambioMermaStagingTable();

    const original = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const stagingBefore = await this.fetchCambioMermaStagingIfAny(iord, tipo);
    await this.assertCambioMermaStagingUnlocked(iord, stagingBefore);
    const selCtrlOrd = this.toInt(original.row.selCtrlOrd);
    if (!this.isSelCtrlOrdEditable(selCtrlOrd)) {
      throw new BadRequestException(
        `La ORD ${iord} no admite captura en selCtrlOrd=${selCtrlOrd ?? 'NULL'}.`,
      );
    }

    const ctdOriginal = this.toFloat(original.row.CTD) ?? 0;
    const ctdCM = this.resolveCtdCM(
      dto.ctdCM,
      original.row.CTD_C_M,
      ctdOriginal,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal);

    const artOriginal = this.normalizeText(original.row.ART) ?? '';
    const artNuevo = this.normalizeText(dto.artNuevo) ?? artOriginal;
    if (tipo === 1 && !artNuevo) {
      throw new BadRequestException(
        'Debe seleccionar un artículo nuevo para cambio material.',
      );
    }
    if (
      tipo === 1 &&
      artNuevo &&
      this.normalizeUpper(artNuevo) === this.normalizeUpper(artOriginal)
    ) {
      throw new BadRequestException(
        'El artículo nuevo debe ser distinto al artículo original.',
      );
    }

    const motivo = await this.resolveMovimientoMotrAndLabel(
      tipo,
      dto.motivo,
      dto.motr,
    );

    const labor =
      dto.labor == null ? this.toInt(original.row.LABOR) : this.toInt(dto.labor);
    const crearNuevaOrd = true;
    const suc = this.normalizeText(original.row.SUC) ?? '';
    let pvtaNuevo = this.toFloat(dto.pvtaNuevo);
    if (pvtaNuevo == null && tipo === 1 && artNuevo) {
      const artInfo = await this.resolveArticuloDatArt(suc, artNuevo);
      pvtaNuevo = this.toFloat(artInfo?.pvta);
    }
    if (pvtaNuevo == null) {
      pvtaNuevo = await this.resolveCambioMermaOriginalUnitPrice(iord, original.row);
    }
    if (pvtaNuevo == null || !Number.isFinite(pvtaNuevo) || pvtaNuevo < 0) {
      throw new BadRequestException('pvtaNuevo inválido para cambio/merma.');
    }
    pvtaNuevo = this.roundMoney(pvtaNuevo);
    const nvaIord = await this.resolveCambioMermaReservedIord(
      suc,
      stagingBefore,
      {
        iord,
        tipo,
        actor: this.auditActor(user),
      },
    );

    await this.upsertCambioMermaStaging(
      iord,
      tipo,
      {
        artNuevo,
        motr: motivo.id,
        motivo: motivo.label,
        labor,
        docDif:
          this.normalizeText(dto.docDif) ?? this.normalizeText(original.row.DOCDIF),
        ctdCM,
        crearNuevaOrd,
        pvtaNuevo,
        diferenciaEconomica: null,
        nvaIord,
      },
      this.auditActor(user),
    );

    const nextSelCtrlOrd = 14;
    await this.updateCambioMermaOriginalState(
      iord,
      nextSelCtrlOrd,
      ctdCM,
      motivo.id,
    );

    await this.auditMutation('ORD_CAMBIO_MERMA_SOLICITAR_AUT', user, ip, {
      iord,
      tipo,
      selCtrlOrd: nextSelCtrlOrd,
      ctdCM,
      motr: motivo.id,
    });

    const updatedOriginal = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const staging = await this.fetchCambioMermaStaging(iord, tipo);
    const context = await this.buildCambioMermaContextResponse(
      iord,
      tipo,
      updatedOriginal.row,
      staging,
    );
    await this.syncCambioMermaStagingDiferencia(
      iord,
      tipo,
      this.toFloat(context.diferenciaEconomica),
      this.auditActor(user),
    );
    return {
      ...context,
      message: 'Autorización solicitada. Captura enviada a revisión.',
    };
  }

  async autorizarCambioMerma(
    iordRaw: string,
    query: CambioMermaContextDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const tipo = this.normalizeCambioMermaTipo(query.tipo);
    const finalized = await this.executeCambioMermaFinalization(
      iord,
      tipo,
      user,
      ip,
      {
        requireSelCtrlOrd14: true,
        auditAction: 'ORD_CAMBIO_MERMA_AUTORIZAR_FINAL',
        okMessage:
          'Cambio/merma autorizado. Nueva ORD creada y ORD original anulada.',
      },
    );
    return {
      ...finalized.context,
      message:
        finalized.context.message.trim().length > 0
          ? finalized.context.message
          : 'Cambio/merma autorizado. Nueva ORD creada y ORD original anulada.',
    };
  }

  async retrabajoCambioMerma(
    iordRaw: string,
    query: CambioMermaContextDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const tipo = this.normalizeCambioMermaTipo(query.tipo);
    await this.assertCambioMermaAuthorizationPermission(user);
    await this.assertCambioMermaStagingTable();

    const original = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const staging = await this.fetchCambioMermaStagingIfAny(iord, tipo);
    if (!staging) {
      throw new BadRequestException(
        `La ORD ${iord} no tiene captura temporal para retrabajo.`,
      );
    }

    const nvaIord = this.normalizeText(staging.NVA_IORD) ?? '';
    if (nvaIord && (await this.hasOrdHeader(nvaIord))) {
      throw new BadRequestException(
        `La ORD ${iord} ya creó la nueva ORD (${nvaIord}) y no admite retrabajo.`,
      );
    }

    const selCtrlOrd = this.toInt(original.row.selCtrlOrd);
    if (selCtrlOrd !== 14) {
      throw new BadRequestException(
        `La ORD ${iord} debe estar en selCtrlOrd=14 para retrabajo (actual=${selCtrlOrd ?? 'NULL'}).`,
      );
    }

    const ctdOriginal = this.toFloat(original.row.CTD) ?? 0;
    const ctdCM = this.resolveCtdCM(
      staging.CTD_C_M,
      original.row.CTD_C_M,
      ctdOriginal,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal);
    const motr = this.toInt(staging.MOTR) ?? this.toInt(original.row.MOTR);

    await this.updateCambioMermaOriginalState(iord, 15, ctdCM, motr);
    await this.auditMutation('ORD_CAMBIO_MERMA_RETRABAJO', user, ip, {
      iord,
      tipo,
      selCtrlOrd: 15,
      ctdCM,
      motr,
    });

    const updatedOriginal = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const refreshedStaging = await this.fetchCambioMermaStaging(iord, tipo);
    const context = await this.buildCambioMermaContextResponse(
      iord,
      tipo,
      updatedOriginal.row,
      refreshedStaging,
    );

    return {
      ...context,
      message: 'Captura devuelta a retrabajo editable.',
    };
  }

  async crearCambioMerma(
    iordRaw: string,
    dto: CrearCambioMermaDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const tipo = this.normalizeCambioMermaTipo(dto.tipo);
    const finalized = await this.executeCambioMermaFinalization(
      iord,
      tipo,
      user,
      ip,
      {
        requireSelCtrlOrd14: false,
        allowLegacySelCtrlOrd16: true,
        auditAction: 'ORD_CAMBIO_MERMA_CREAR_LEGACY',
        okMessage:
          'Compatibilidad aplicada: la nueva ORD se creó desde el flujo final de autorización.',
      },
    );
    return finalized.result;
  }

  async saveDetail(
    iordRaw: string,
    dto: SaveOrdDetalleDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const scope = await this.resolveSucScope(user, dto.suc ?? null);
    const roleCode = await this.resolveRoleCode(user);
    if (!this.canEditOrdDetail(user, roleCode)) {
      throw new ForbiddenException(
        'Tu usuario no tiene permiso para editar laboratorio, comentario o detalle de la ORD',
      );
    }
    await this.assertOrdTypeAccessByIord(iord, user, scope);
    const actor = this.auditActor(user);
    const commentsValue = this.normalizeText(dto.comentarios);
    const hrEntValue = this.normalizeHourMinute(dto.hrEnt);
    const tipoValueRaw = this.normalizeUpper(dto.tipo);
    const tipoValue = tipoValueRaw ? this.normalizeOrdTipo(tipoValueRaw) : '';
    if (tipoValueRaw && !tipoValue) {
      throw new BadRequestException(
        'El tipo de ORD debe ser TALLADO o BISELADO',
      );
    }
    if (tipoValue && !this.canManageOrdTipoAndPrint(user, roleCode)) {
      throw new ForbiddenException(
        'Tu usuario no tiene permiso para cambiar el tipo o imprimir la etiqueta de la ORD',
      );
    }
    const laborValue =
      dto.labor == null || !Number.isFinite(Number(dto.labor))
        ? null
        : Math.trunc(Number(dto.labor));
    if (laborValue != null && laborValue > 0) {
      await this.assertLaboratorioDisponibleParaOrd(
        iord,
        laborValue,
        user,
        scope,
        tipoValue || null,
      );
    }
    const rows = Array.isArray(dto.details) ? dto.details : [];

    const exists = await this.dataSource.query(
      `
      SELECT TOP 1 1 AS ok
      FROM dbo.PV_CTR_ORDS o
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE o.IORD = @0
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4', '@5')}
        AND ${this.buildOrdRequestedSucSql('o', '@5')}
      `,
      [
        iord,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCode),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );

    if (!this.firstRow(exists)) {
      throw new NotFoundException(`No existe ORD ${iord} o no tiene acceso`);
    }

    await this.dataSource.query(
      `
      UPDATE dbo.PV_CTR_ORDS
      SET
        ESTSEGU = CASE
          WHEN TRY_CONVERT(FLOAT, ESTSEGU) IS NULL THEN 3.1
          ELSE ESTSEGU
        END,
        ESTATUS = 2,
        LABOR = CASE WHEN @1 IS NULL THEN LABOR ELSE @1 END,
        COMAD = CASE WHEN @2 IS NULL THEN COMAD ELSE LEFT(@2, 2000) END,
        TIPO = CASE WHEN @3 IS NULL THEN TIPO ELSE @3 END,
        HR_ENT = CASE
          WHEN @4 IS NULL THEN HR_ENT
          ELSE TRY_CONVERT(
            DATETIME,
            CONVERT(
              VARCHAR(10),
              COALESCE(
                TRY_CONVERT(DATE, HR_ENT),
                TRY_CONVERT(DATE, FCNEN),
                TRY_CONVERT(DATE, FCNM),
                CONVERT(DATE, GETDATE())
              ),
              23
            ) + ' ' + @4 + ':00',
            120
          )
        END,
        FCNMOD = GETDATE()
      WHERE IORD = @0
      `,
      [iord, laborValue, commentsValue, tipoValue || null, hrEntValue],
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
      tipo: tipoValue || null,
      hrEnt: hrEntValue,
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
    const iord = this.requireIord(iordRaw);
    const scope = await this.resolveSucScope(user, null);
    await this.assertOrdTypeAccessByIord(iord, user, scope);
    await this.assertBatchLaboratorioAsignado([iord], scope, user);
    return this.executeSimpleAction(
      'sp_ordenes_trabajo_autorizar',
      iord,
      [],
      user,
      ip,
      'ORD autorizada',
      'ORD_AUTORIZAR',
    );
  }

  async anularLote(dto: SendOrdBatchDto, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('ANULAR', user);
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_anular_lote',
      auditAction: 'ORD_ANULAR_LOTE',
      fallbackError:
        'No se pudo anular el lote de ORDs. Verifique estado y permisos.',
      singleMessage: '1 ORD anulada a estatus 4',
      pluralMessagePrefix: 'ORDs anuladas a estatus 4',
      notFoundMessage: 'No fue posible procesar las ORDs para anulación',
    });
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
    return this.validateOrdByRequiredFlow(
      dto.code,
      user,
      {
        requiredFlow: 3,
        requiredFlowLabel: 'NUEVA AUTORIZADA',
        okMessage: 'ORD válida para envío',
        requireLaboratorio: true,
      },
      dto.suc ?? null,
    );
  }

  async enviarLote(dto: SendOrdBatchDto, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('ENVIAR', user);
    const iords = this.normalizeDistinctIords(dto.iords);
    if (!iords.length) {
      throw new BadRequestException('Debe proporcionar al menos una ORD');
    }
    const scope = await this.resolveSucScope(user, null);
    await this.assertBatchOrdTypeAccess(iords, user, scope);
    await this.assertBatchLaboratorioAsignado(iords, scope, user);
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_enviar_lote',
      auditAction: 'ORD_ENVIAR_LOTE',
      fallbackError:
        'No se pudo enviar el lote de ORDs. Verifique estado, laboratorio y permisos.',
      singleMessage: '1 ORD enviada (5 interno / 9 laboratorio externo)',
      pluralMessagePrefix: 'ORDs enviadas (5 interno / 9 laboratorio externo)',
      notFoundMessage: 'No fue posible procesar las ORDs enviadas',
    });
  }

  async listarColaboradoresAsignar(sucRaw: string, user: JwtPayload) {
    const suc = this.normalizeText(sucRaw);
    if (!suc) {
      throw new BadRequestException('suc es requerida');
    }
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    if (!this.canAccessAsignadoOptions(user, roleCode)) {
      throw new ForbiddenException(
        'Rol no autorizado para consultar asignados del panel',
      );
    }
    const scope = await this.resolveSucScope(user, suc);
    const allowedDeptos = this.resolveAsignadoDeptos(user, roleCode);
    if (!allowedDeptos.length) {
      return {
        ok: true,
        suc: this.normalizeUpper(suc),
        items: [],
      };
    }
    const deptPlaceholders = allowedDeptos
      .map((_, idx) => `@${3 + idx}`)
      .join(',');
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
        AND UPPER(LTRIM(RTRIM(ISNULL(o.DEPTO, '')))) IN (${deptPlaceholders})
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
      [suc, scope.isAdmin ? 1 : 0, scope.allowedSucsCsv, ...allowedDeptos],
    );

    const items = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const rec = row as Record<string, unknown>;
        const idopv = this.normalizeText(rec.IDOPV) ?? '';
        if (!idopv) return null;
        const nomb = this.normalizeText(rec.NOMB) ?? '';
        const apelp = this.normalizeText(rec.APELP) ?? '';
        const apelm = this.normalizeText(rec.APELM) ?? '';
        const label = this.composeOpvLabel({ idopv, nomb, apelp, apelm });
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
    return this.validateOrdByRequiredFlow(
      dto.code,
      user,
      {
        requiredFlow: 7,
        requiredFlowLabel: 'RECIBIDA A TALLER',
        okMessage: 'ORD válida para asignación',
      },
      dto.suc ?? null,
    );
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
    return this.validateOrdByRequiredFlow(
      dto.code,
      user,
      {
        requiredFlow: 8,
        requiredFlowLabel: 'ASIGNADA',
        okMessage: 'ORD válida para trabajo terminado',
      },
      dto.suc ?? null,
    );
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
    return this.validateOrdByRequiredFlow(
      dto.code,
      user,
      {
        requiredFlow: 8,
        requiredFlowLabel: 'ASIGNADA',
        okMessage: 'ORD válida para regresar por incidencia',
        requireAsignado: true,
      },
      dto.suc ?? null,
    );
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
    const iords = this.normalizeDistinctIords(dto.iords);
    if (!iords.length) {
      throw new BadRequestException('Debe proporcionar al menos una ORD');
    }
    const scope = await this.resolveSucScope(user, null);
    await this.assertBatchOrdTypeAccess(iords, user, scope);
    await this.assertBatchFlowAndAsignadoForIncidencia(iords, scope, user);
    return this.executeLoteActionWithParams(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_regresar_incidencia_lote',
      auditAction: 'ORD_REGRESAR_INCIDENCIA_LOTE',
      fallbackError:
        'No se pudo regresar por incidencia. Verifique estado, colaborador asignado, motivo y permisos.',
      singleMessage: '1 ORD actualizada con incidencia (estatus 9)',
      pluralMessagePrefix: 'ORDs actualizadas con incidencia (estatus 9)',
      notFoundMessage:
        'No fue posible procesar las ORDs para regreso por incidencia',
      extraSqlParams: '@TIPOM=@1,',
      extraParams: [tipom],
      auditMetadataExtra: { tipom },
    });
  }

  async validarRegresarTiendaOrd(dto: ValidateEnviarOrdDto, user: JwtPayload) {
    await this.assertActionPermission('REGRESAR_TIENDA', user);
    return this.validateOrdByRequiredFlow(
      dto.code,
      user,
      {
        requiredFlow: 9,
        requiredFlowLabel: 'TRABAJO TERMINADO',
        okMessage: 'ORD válida para regresar a tienda',
      },
      dto.suc ?? null,
    );
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
      singleMessage:
        '1 ORD recibida en tienda (TIPOM=1 -> 9.1, TIPOM=2 -> 9.2; ORDs derivadas o sin incidencia -> 10)',
      pluralMessagePrefix:
        'ORDs recibidas en tienda (TIPOM=1 -> 9.1, TIPOM=2 -> 9.2; ORDs derivadas o sin incidencia -> 10)',
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
    const iords = this.normalizeDistinctIords(dto.iords);
    if (!iords.length) {
      throw new BadRequestException('Debe proporcionar al menos una ORD');
    }
    const scope = await this.resolveSucScope(user, null);
    await this.assertBatchOrdTypeAccess(iords, user, scope);
    await this.assertLaboratorioDisponibleParaLote(
      iords,
      Math.trunc(labor),
      user,
      scope,
    );
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
    const roleCode = await this.resolveRoleCode(user);
    const isAnalista = this.isAnalistaRoleForRecepcionExterna(roleCode);
    return this.validateOrdByRequiredFlow(
      dto.code,
      user,
      {
        requiredFlow: isAnalista ? 9 : 5,
        requiredFlowLabel: isAnalista
          ? 'PENDIENTE RECIBIR EN ANALISTA'
          : 'ENTREGADA A MAQ O BISEL',
        okMessage: 'ORD válida para recepción',
        requireExternalLaboratorioForAnalyst: isAnalista,
      },
      dto.suc ?? null,
    );
  }

  async recibirLote(dto: SendOrdBatchDto, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('SCAN_RECIBIR', user);
    const iords = this.normalizeDistinctIords(dto.iords);
    if (!iords.length) {
      throw new BadRequestException('Debe proporcionar al menos una ORD');
    }
    const scope = await this.resolveSucScope(user, null);
    const roleCode = await this.resolveRoleCode(user);
    await this.assertBatchExternalLaboratorioForAnalyst(iords, scope, roleCode);
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_recibir_lote',
      auditAction: 'ORD_RECIBIR_LOTE',
      fallbackError:
        'No se pudo recibir el lote de ORDs. Verifique estado y permisos.',
      singleMessage:
        '1 ORD recibida (5->7 interno / 9->10 externo)',
      pluralMessagePrefix:
        'ORDs recibidas (5->7 interno / 9->10 externo)',
      notFoundMessage: 'No fue posible procesar las ORDs recibidas',
    });
  }

  async validarEntregarOrd(dto: ValidateEnviarOrdDto, user: JwtPayload) {
    await this.assertActionPermission('SCAN_ENTREGAR', user);
    return this.validateOrdByRequiredFlow(
      dto.code,
      user,
      {
        requiredFlow: 10,
        requiredFlowLabel: 'REGRESADO A TIENDA',
        okMessage: 'ORD válida para entrega a cliente',
      },
      dto.suc ?? null,
    );
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
    const motivo =
      this.normalizeText(dto.motivo) ?? 'Garantía registrada (flujo 9.3)';
    return this.executeSimpleAction(
      'sp_ordenes_trabajo_garantia',
      iordRaw,
      [motivo],
      user,
      ip,
      'Garantía registrada',
      'ORD_GARANTIA',
      '@MOTIVO=@1,',
    );
  }

  async aplicarMermaCambio(
    iordRaw: string,
    dto: AplicarMermaCambioDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const tipom = Math.trunc(Number(dto.tipom ?? 0));
    if (tipom !== 1 && tipom !== 2) {
      throw new BadRequestException(
        'tipom debe ser 1 (CAMBIO DE ARTICULO) o 2 (MERMA DE ART Y CAMBIO)',
      );
    }
    if (tipom === 1) {
      await this.assertActionPermission('CAMBIO_MATERIAL', user);
    } else {
      await this.assertActionPermission('MERMA', user);
    }
    await this.validateOrdByRequiredFlow(iordRaw, user, {
      requiredFlow: 9.3,
      requiredFlowLabel: 'GARANTÍA APLICADA',
      okMessage: 'ORD válida para aplicar merma o cambio',
    });
    const motivo = await this.resolveMovimientoMotrAndLabel(
      tipom,
      undefined,
      dto.motr,
    );
    const tipomLabel =
      tipom === 1 ? 'CAMBIO DE ARTICULO' : 'MERMA DE ART Y CAMBIO';
    const obs = `Aplicar merma/cambio (TIPOM=${tipom} ${tipomLabel}, MOTR=${motivo.id} ${motivo.label})`;
    return this.executeSimpleAction(
      'sp_ordenes_trabajo_aplicar_merma_cambio',
      iordRaw,
      [tipom, motivo.id, obs],
      user,
      ip,
      tipom === 1
        ? 'Flujo 9.1 listo para cambio material'
        : 'Flujo 9.2 listo para merma',
      'ORD_APLICAR_MERMA_CAMBIO',
      '@TIPOM=@1,@MOTR=@2,@OBS=@3,',
    );
  }

  async cambioMaterial(
    iordRaw: string,
    dto: CambioMaterialDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('CAMBIO_MATERIAL', user);
    await this.assertOrdReadyForCambioMerma(iordRaw, user, {
      requiredFlow: 9.1,
      requiredFlowLabel: 'REGRESADO PARA CAMBIO',
      requiredTipom: 1,
      requiredTipomLabel: 'CAMBIO DE ARTICULO',
    });
    const motivo = await this.resolveMovimientoMotrAndLabel(
      1,
      dto.motivo,
      dto.motr,
    );
    const ctdCM = this.normalizeStrictCtdCM(dto.ctdCM, 1);
    const result = await this.executeSimpleAction(
      'sp_ordenes_trabajo_cambio_material',
      iordRaw,
      [
        this.normalizeText(dto.artNuevo),
        motivo.label,
        dto.labor ?? null,
        this.normalizeText(dto.docDif),
        motivo.id,
        ctdCM,
      ],
      user,
      ip,
      'Cambio de material aplicado',
      'ORD_CAMBIO_MATERIAL',
      '@ART_NUEVO=@1,@MOTIVO=@2,@LABOR=@3,@DOCDIF=@4,@MOTR=@5,@CTD_C_M=@6,',
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
    await this.assertOrdReadyForCambioMerma(iordRaw, user, {
      requiredFlow: 9.2,
      requiredFlowLabel: 'REGRESADO PARA MERMA',
      requiredTipom: 2,
      requiredTipomLabel: 'MERMA DE ART Y CAMBIO',
    });
    const motivo = await this.resolveMovimientoMotrAndLabel(
      2,
      dto.motivo,
      dto.motr,
    );
    const ctdCM = this.normalizeStrictCtdCM(dto.ctdCM ?? dto.cantidadMerma);
    const result = await this.executeSimpleAction(
      'sp_ordenes_trabajo_merma',
      iordRaw,
      [
        ctdCM,
        motivo.label,
        dto.crearNuevaOrd == null ? 1 : dto.crearNuevaOrd ? 1 : 0,
        motivo.id,
        this.normalizeText(dto.artNuevo),
        ctdCM,
      ],
      user,
      ip,
      'Merma procesada',
      'ORD_MERMA',
      '@CANTIDAD_MERMA=@1,@MOTIVO=@2,@CREAR_NUEVA_ORD=@3,@MOTR=@4,@ART_NUEVO=@5,@CTD_C_M=@6,',
    );
    await this.forceEstatus2FromActionData(result.data);
    return result;
  }

  async scanRecibir(dto: ScanOrdDto, user: JwtPayload, ip: string | null) {
    await this.assertActionPermission('SCAN_RECIBIR', user);
    const scope = await this.resolveSucScope(user, dto.suc ?? null);
    const actor = this.auditActor(user);
    const code = this.normalizeText(dto.code);
    if (!code) throw new BadRequestException('code es requerido');
    await this.assertOrdTypeAccessByCode(code, user, scope);

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
    const scope = await this.resolveSucScope(user, dto.suc ?? null);
    const actor = this.auditActor(user);
    const code = this.normalizeText(dto.code);
    if (!code) throw new BadRequestException('code es requerido');
    await this.assertOrdTypeAccessByCode(code, user, scope);

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
      requireLaboratorio?: boolean;
      requireAsignado?: boolean;
      requireExternalLaboratorioForAnalyst?: boolean;
    },
    requestedSucRaw?: string | null,
  ) {
    const code = this.normalizeText(codeRaw);
    if (!code) {
      throw new BadRequestException('code es requerido');
    }

    const scope = await this.resolveSucScope(user, requestedSucRaw ?? null);
    const roleCode = await this.resolveRoleCode(user);
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        o.IORD,
        o.IDFOL,
        o.SUC,
        o.TIPO,
        o.CLIEN,
        o.NCLIENTE,
        o.ART,
        o.DESCART,
        TRY_CONVERT(FLOAT, o.CTD) AS CTD,
        TRY_CONVERT(INT, o.LABOR) AS LABOR,
        LTRIM(RTRIM(ISNULL(lab.LAB, ''))) AS LAB_DESC,
        UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '')))) AS LAB_TIPOLAB,
        UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '')))) AS LAB_UBILAB,
        UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) AS LAB_SUC,
        LTRIM(RTRIM(ISNULL(CAST(o.ASIGN AS NVARCHAR(100)), ''))) AS ASIGN,
        TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
        LTRIM(RTRIM(ISNULL(e.TIPO, ''))) AS ESTSEGU_DESC
      FROM dbo.PV_CTR_ORDS o
      LEFT JOIN dbo.DAT_EST_ORD e
        ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE (
          UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
          OR UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) = UPPER(@0)
        )
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4', '@5')}
        AND ${this.buildOrdRequestedSucSql('o', '@5')}
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0) THEN 0
          ELSE 1
        END,
        ISNULL(o.FCNS, ISNULL(o.FCNMOD, o.FCNM)) DESC,
        o.IORD DESC
      `,
      [
        code,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCode),
        scope.homeSuc,
        scope.requestedSuc,
      ],
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
    this.assertOrdTipoMatchesRole(
      roleCode,
      row.TIPO,
      iord,
    );

    const flow = this.toFloat(row.ESTSEGU);
    if (flow == null || Math.abs(flow - options.requiredFlow) > 0.0001) {
      const flowLabel = this.normalizeText(row.ESTSEGU_DESC) ?? 'SIN FLUJO';
      const flowText = flow == null ? 'SIN FLUJO' : this.formatStatusCode(flow);
      throw new BadRequestException(
        `La ORD ${iord} debe estar en estatus ${this.formatStatusCode(options.requiredFlow)} (${options.requiredFlowLabel}). Estado actual: ${flowText} ${flowLabel}`.trim(),
      );
    }
    if (options.requireLaboratorio) {
      const labor = this.toInt(row.LABOR) ?? 0;
      if (labor <= 0) {
        throw new BadRequestException(
          `La ORD ${iord} debe tener laboratorio asignado para continuar.`,
        );
      }
    }
    if (options.requireAsignado) {
      const asignado = this.normalizeText(row.ASIGN);
      if (!asignado) {
        throw new BadRequestException(
          `La ORD ${iord} debe tener colaborador asignado para continuar.`,
        );
      }
    }
    if (
      options.requireExternalLaboratorioForAnalyst &&
      this.isAnalistaRoleForRecepcionExterna(roleCode) &&
      !this.isLaboratorioExterno(row)
    ) {
      throw new BadRequestException(
        `La ORD ${iord} pertenece a laboratorio interno y debe continuar flujo de asignación/trabajo terminado antes de entrega a cliente.`,
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
    await this.assertBatchOrdTypeAccess(iords, user, scope);
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
    await this.assertBatchOrdTypeAccess(iords, user, scope);
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
    await this.assertOrdTypeAccessByIord(iord, user, scope);
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
    roleCodeHint?: string | null,
  ): Promise<SucScope> {
    const isAdmin = this.isAdmin(user);
    const requestedSuc = this.normalizeText(requestedSucRaw);

    if (isAdmin) {
      return {
        isAdmin,
        homeSuc: this.normalizeUpper(user?.suc) || null,
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

    const roleCode =
      this.normalizeUpper(roleCodeHint) ||
      this.normalizeUpper(await this.resolveRoleCode(user));
    const moduleCodes = this.resolveScopeModuleCodes(roleCode);

    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) AS SUC
      FROM dbo.USR_MOD_SUC
      WHERE UPPER(LTRIM(RTRIM(ISNULL(USUARIO, '')))) = UPPER(@0)
        AND ACTIVO = 1
        AND UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) IN (${moduleCodes.map((_, idx) => `@${idx + 1}`).join(',')})
      `,
      [username, ...moduleCodes],
    );

    const ownSuc = this.normalizeUpper(user?.suc);
    const allowed = this.normalizeUnique([
      ownSuc,
      ...(rows ?? []).map((row: Record<string, unknown>) => row.SUC),
    ]);
    const homeSuc = ownSuc || allowed[0] || null;

    if (!allowed.length) {
      if (!homeSuc) {
        throw new ForbiddenException(
          'Usuario sin sucursal autorizada para modulo de ordenes de trabajo',
        );
      }
      allowed.push(homeSuc);
    }

    if (requestedSuc && !allowed.includes(this.normalizeUpper(requestedSuc))) {
      throw new ForbiddenException(
        'Sucursal no autorizada para ordenes de trabajo',
      );
    }

    return {
      isAdmin,
      homeSuc,
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
      AUTORIZAR: ['JEF_TALLER', 'ANALISTA_ORD'],
      ANULAR: ['JEF_TALLER'],
      ENVIAR: ['JEF_TALLER', 'ANALISTA_ORD'],
      ASIGNAR: [
        'JEF_TALLER',
        'ENC_MAQUILA',
        'ENC_BISEL',
      ],
      TRABAJO_TERMINADO: [
        'JEF_TALLER',
        'ENC_MAQUILA',
        'ENC_BISEL',
      ],
      REGRESAR_INCIDENCIA: [
        'JEF_TALLER',
        'ENC_MAQUILA',
        'ENC_BISEL',
      ],
      REGRESAR_TIENDA: ['JEF_TALLER', 'ANALISTA_ORD'],
      ASIGNAR_LABORATORIO: ['JEF_TALLER', 'ANALISTA_ORD'],
      RECIBIR: [
        'JEF_TALLER',
        'ENC_MAQUILA',
        'ENC_BISEL',
      ],
      ENTREGAR: ['JEF_TALLER', 'ANALISTA_ORD'],
      GARANTIA: ['JEF_TALLER'],
      CAMBIO_MATERIAL: [
        'JEF_TALLER',
        'ANALISTA_ORD',
        'ENC_MAQUILA',
        'ENC_BISEL',
      ],
      MERMA: [
        'JEF_TALLER',
        'ANALISTA_ORD',
        'ENC_MAQUILA',
        'ENC_BISEL',
      ],
      SCAN_RECIBIR: [
        'JEF_TALLER',
        'ANALISTA_ORD',
        'ENC_MAQUILA',
        'ENC_BISEL',
      ],
      SCAN_ENTREGAR: ['JEF_TALLER', 'ANALISTA_ORD'],
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

  private resolveScopeModuleCodes(roleCodeRaw: string) {
    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (roleCode === 'INVJEF' || roleCode === 'ANALISTA_INV') {
      return [
        ...OrdenesTrabajoService.MODULE_CODES,
        ...OrdenesTrabajoService.MODULE_CODES_INV_SCOPE,
      ];
    }
    return [...OrdenesTrabajoService.MODULE_CODES];
  }

  private resolveAsignadoDeptos(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) {
      return ['TALLER', 'BISELADO'];
    }
    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (roleCode === 'ENC_MAQUILA') {
      return ['TALLER'];
    }
    if (roleCode === 'ENC_BISEL') {
      return ['BISELADO'];
    }
    return ['TALLER', 'BISELADO'];
  }

  private canAccessAsignadoOptions(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return [
      'JEF_TALLER',
      'ANALISTA_ORD',
      'ANALISTA_INV',
      'INVJEF',
      'ENC_MAQUILA',
      'ENC_BISEL',
    ].includes(roleCode);
  }

  private composeOpvLabel(values: {
    idopv?: string | null;
    nomb?: string | null;
    apelp?: string | null;
    apelm?: string | null;
  }) {
    const parts = [
      this.normalizeText(values.nomb),
      this.normalizeText(values.apelp),
      this.normalizeText(values.apelm),
    ].filter((item): item is string => item != null && item.length > 0);
    return parts.join(' ').trim() || (this.normalizeText(values.idopv) ?? '');
  }

  private async resolveOpvLabels(idsRaw: unknown[]) {
    const ids = [
      ...new Set(idsRaw.map((item) => this.normalizeText(item) ?? '')),
    ].filter((item) => item.length > 0);
    if (!ids.length) {
      return new Map<string, string>();
    }
    const placeholders = ids.map((_, idx) => `@${idx}`).join(',');
    const rows = await this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(CAST(o.IDOPV AS NVARCHAR(100)), ''))) AS IDOPV,
        LTRIM(RTRIM(ISNULL(o.NOMB, ''))) AS NOMB,
        LTRIM(RTRIM(ISNULL(o.APELP, ''))) AS APELP,
        LTRIM(RTRIM(ISNULL(o.APELM, ''))) AS APELM
      FROM dbo.PV_OPV o
      WHERE LTRIM(RTRIM(ISNULL(CAST(o.IDOPV AS NVARCHAR(100)), ''))) IN (${placeholders})
      `,
      ids,
    );
    const out = new Map<string, string>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const rec = row as Record<string, unknown>;
      const idopv = this.normalizeText(rec.IDOPV);
      if (!idopv) continue;
      const label = this.composeOpvLabel({
        idopv,
        nomb: this.normalizeText(rec.NOMB),
        apelp: this.normalizeText(rec.APELP),
        apelm: this.normalizeText(rec.APELM),
      });
      if (label) {
        out.set(idopv, label);
      }
    }
    return out;
  }

  private async resolveUsuarioLabels(idsRaw: unknown[]) {
    const ids = [
      ...new Set(idsRaw.map((item) => this.normalizeText(item) ?? '')),
    ].filter((item) => item.length > 0);
    if (!ids.length) {
      return new Map<string, string>();
    }
    const placeholders = ids.map((_, idx) => `@${idx}`).join(',');
    const rows = await this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(CAST(u.IDUSUARIO AS NVARCHAR(100)), ''))) AS IDUSUARIO,
        LTRIM(RTRIM(ISNULL(u.NOMBRE, ''))) AS NOMBRE,
        LTRIM(RTRIM(ISNULL(u.APELLIDOS, ''))) AS APELLIDOS
      FROM dbo.USUARIO u
      WHERE LTRIM(RTRIM(ISNULL(CAST(u.IDUSUARIO AS NVARCHAR(100)), ''))) IN (${placeholders})
      `,
      ids,
    );
    const out = new Map<string, string>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const rec = row as Record<string, unknown>;
      const idusuario = this.normalizeText(rec.IDUSUARIO);
      if (!idusuario) continue;
      const nombre = this.composeUsuarioLabel({
        nombre: this.normalizeText(rec.NOMBRE),
        apellidos: this.normalizeText(rec.APELLIDOS),
      });
      if (!nombre) continue;
      out.set(idusuario, nombre);
    }
    const missingIds = ids.filter((id) => !out.has(id));
    if (missingIds.length) {
      const usernamePlaceholders = missingIds.map((_, idx) => `@${idx}`).join(',');
      const usernameRows = await this.dataSource.query(
        `
        SELECT
          LTRIM(RTRIM(ISNULL(u.USERNAME, ''))) AS USERNAME,
          LTRIM(RTRIM(ISNULL(u.NOMBRE, ''))) AS NOMBRE,
          LTRIM(RTRIM(ISNULL(u.APELLIDOS, ''))) AS APELLIDOS
        FROM dbo.USUARIO u
        WHERE LTRIM(RTRIM(ISNULL(u.USERNAME, ''))) IN (${usernamePlaceholders})
        `,
        missingIds,
      );
      for (const row of Array.isArray(usernameRows) ? usernameRows : []) {
        const rec = row as Record<string, unknown>;
        const username = this.normalizeText(rec.USERNAME);
        if (!username || out.has(username)) continue;
        const nombre = this.composeUsuarioLabel({
          nombre: this.normalizeText(rec.NOMBRE),
          apellidos: this.normalizeText(rec.APELLIDOS),
        });
        if (!nombre) continue;
        out.set(username, nombre);
      }
    }
    const missingAfterUsername = ids.filter((id) => !out.has(id));
    if (!missingAfterUsername.length) {
      return out;
    }
    const fallbackPlaceholders = missingAfterUsername
      .map((_, idx) => `@${idx}`)
      .join(',');
    const fallbackRows = await this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(CAST(o.IDOPV AS NVARCHAR(100)), ''))) AS IDOPV,
        LTRIM(RTRIM(ISNULL(o.NOMB, ''))) AS NOMB,
        LTRIM(RTRIM(ISNULL(o.APELP, ''))) AS APELP,
        LTRIM(RTRIM(ISNULL(o.APELM, ''))) AS APELM
      FROM dbo.PV_OPV o
      WHERE LTRIM(RTRIM(ISNULL(CAST(o.IDOPV AS NVARCHAR(100)), ''))) IN (${fallbackPlaceholders})
      `,
      missingAfterUsername,
    );
    for (const row of Array.isArray(fallbackRows) ? fallbackRows : []) {
      const rec = row as Record<string, unknown>;
      const idopv = this.normalizeText(rec.IDOPV);
      if (!idopv || out.has(idopv)) continue;
      const label = this.composeOpvLabel({
        idopv,
        nomb: this.normalizeText(rec.NOMB),
        apelp: this.normalizeText(rec.APELP),
        apelm: this.normalizeText(rec.APELM),
      });
      if (label) {
        out.set(idopv, label);
      }
    }
    return out;
  }

  private composeUsuarioLabel(values: {
    nombre?: string | null;
    apellidos?: string | null;
  }) {
    const parts = [
      this.normalizeText(values.nombre),
      this.normalizeText(values.apellidos),
    ].filter((item): item is string => item != null && item.length > 0);
    return parts.join(' ').trim();
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
  ): 'operativo' | 'estado' | 'anulados' | 'entregadas' {
    const raw = this.normalizeUpper(value ?? '');
    if (raw === 'ESTADO') return 'estado';
    if (raw === 'ANULADOS') return 'anulados';
    if (raw === 'ENTREGADAS') return 'entregadas';
    return 'operativo';
  }

  private shouldDeferPanel(
    query: ListOrdenesTrabajoQueryDto,
    panelMode: 'operativo' | 'estado' | 'anulados' | 'entregadas',
    isAdmin: boolean,
  ) {
    if (panelMode !== 'entregadas' && panelMode !== 'estado') return false;
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

  private async resolveAllowedStatusCodes(
    user: JwtPayload,
    roleCodeRaw: string,
    panelMode: 'operativo' | 'estado' | 'anulados' | 'entregadas',
  ) {
    const tableExists = await this.hasFlowVisibilityTable();
    const configuredRules = await this.resolveFlowVisibilityRules(
      user,
      roleCodeRaw,
      panelMode,
    );
    if (configuredRules.length) {
      const configuredCodes = new Set<number>();
      for (const rule of configuredRules) {
        configuredCodes.add(rule.estsegu);
      }
      return [...configuredCodes].sort((a, b) => a - b);
    }

    if (tableExists) {
      const panelConfigured = await this.hasFlowVisibilityPanelConfig(panelMode);
      if (panelConfigured) {
        return [];
      }
    }

    if (this.isAdmin(user)) {
      if (panelMode === 'estado') return this.resolveAllFlowStatusCodes();
      if (panelMode === 'anulados') return [4];
      if (panelMode === 'entregadas') return [11];
      return [2, 3, 3.1, 5, 7, 8, 9, 9.1, 9.2, 9.3, 10, 12];
    }

    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (panelMode === 'estado') {
      return roleCode === 'JEF_TALLER' || roleCode === 'ANALISTA_ORD'
        ? this.resolveAllFlowStatusCodes()
        : [];
    }
    if (panelMode === 'anulados') {
      return roleCode === 'JEF_TALLER' ? [4] : [];
    }
    if (panelMode === 'entregadas') {
      return roleCode === 'JEF_TALLER' ? [11] : [];
    }

    if (roleCode === 'JEF_TALLER') {
      return [2, 3, 3.1, 5, 7, 8, 9, 9.1, 9.2, 9.3, 10, 12];
    }
    if (roleCode === 'ANALISTA_ORD') {
      return [2, 3, 3.1, 5, 9, 9.1, 9.2, 9.3, 10, 12];
    }
    if (roleCode === 'ANALISTA_INV' || roleCode === 'INVJEF') {
      return [9.1, 9.2, 9.3];
    }
    if (
      roleCode === 'ENC_MAQUILA' ||
      roleCode === 'ENC_BISEL'
    ) {
      return [7, 8, 9, 9.1, 9.2, 9.3];
    }
    return [];
  }

  private async resolveAllFlowStatusCodes() {
    const rows = await this.dataSource.query(`
      SELECT DISTINCT TRY_CONVERT(FLOAT, ESTA) AS ESTA
      FROM dbo.DAT_EST_ORD
      WHERE TRY_CONVERT(FLOAT, ESTA) IS NOT NULL
      ORDER BY TRY_CONVERT(FLOAT, ESTA)
    `);
    const set = new Set<number>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const value = this.toFloat((row as Record<string, unknown>).ESTA);
      if (value != null) {
        set.add(value);
      }
    }
    return [...set].sort((a, b) => a - b);
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

  private applyAllowedStatusFilterToItems(
    items: Record<string, unknown>[],
    allowedStatusCodes: number[],
    includeNullFlow: boolean,
  ) {
    if (!items.length) return items;
    const allowed = new Set(
      allowedStatusCodes.map((code) => this.formatStatusCode(code)),
    );
    return items.filter((item) => {
      const flow = this.toFloat(item.ESTSEGU);
      if (flow == null) return includeNullFlow;
      return allowed.has(this.formatStatusCode(flow));
    });
  }

  private shouldIncludeNullFlow(
    user: JwtPayload,
    roleCodeRaw: string,
    panelMode: 'operativo' | 'estado' | 'anulados' | 'entregadas',
  ) {
    if (panelMode !== 'operativo') return false;
    if (this.isAdmin(user)) return true;

    const roleCode = this.normalizeUpper(roleCodeRaw);
    return (
      roleCode === 'JEF_TALLER' || roleCode === 'ANALISTA_ORD'
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

  private async resolveMovimientoMotivos(tipo: number | null) {
    const fallback = [
      { id: 1, label: 'CAMBIO DE BASE', tipo: 1, responsable: 'TALLER' },
      {
        id: 2,
        label: 'CAMBIO POR FALTA DE MOLDE',
        tipo: 1,
        responsable: 'TALLER',
      },
      { id: 3, label: 'MICA RAYADA', tipo: 2, responsable: 'LABORATORIO' },
      { id: 4, label: 'MICA ABERRADA', tipo: 2, responsable: 'LABORATORIO' },
      {
        id: 5,
        label: 'MICA QUEBRADA POR MAQUINA',
        tipo: 2,
        responsable: 'MAQUILA',
      },
      {
        id: 6,
        label: 'MICA RAYADA POR LABORATORIO',
        tipo: 2,
        responsable: 'LABORATORIO',
      },
      {
        id: 7,
        label: 'MICA MAL ELABORADA POR LABORATORIO',
        tipo: 2,
        responsable: 'LABORATORIO',
      },
      {
        id: 8,
        label: 'MICA MAL CAPTURADA POR AUX TALLER',
        tipo: 2,
        responsable: 'TALLER',
      },
      { id: 9, label: 'MICA AMARILLA', tipo: 2, responsable: 'LABORATORIO' },
      {
        id: 10,
        label: 'MICA ABERRADA POR MAQUINA',
        tipo: 2,
        responsable: 'MAQUILA',
      },
      {
        id: 11,
        label: 'MICA MAL ELABORADA POR BISELADOR',
        tipo: 2,
        responsable: 'BISELADO',
      },
      {
        id: 12,
        label: 'MICA QUEBRADA AL DESBLOQUEAR',
        tipo: 2,
        responsable: 'TALLER',
      },
    ].filter((item) => tipo == null || item.tipo == tipo);

    if (!(await this.hasTable('DAT_ORD_MOTM'))) {
      return fallback;
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        TRY_CONVERT(INT, IDM) AS IDM,
        LTRIM(RTRIM(ISNULL(MOTM, ''))) AS MOTM,
        TRY_CONVERT(INT, TIPO) AS TIPO,
        LTRIM(RTRIM(ISNULL(RESPONSABLE, ''))) AS RESPONSABLE
      FROM dbo.DAT_ORD_MOTM
      WHERE (@0 IS NULL OR TRY_CONVERT(INT, TIPO) = @0)
      ORDER BY TRY_CONVERT(INT, TIPO), TRY_CONVERT(INT, IDM), LTRIM(RTRIM(ISNULL(MOTM, '')))
      `,
      [tipo],
    );

    const out = (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const data = row as Record<string, unknown>;
        const id = this.toInt(data['IDM']) ?? 0;
        const label = this.normalizeText(data['MOTM']) ?? '';
        const tipoValue = this.toInt(data['TIPO']) ?? 0;
        const responsable = this.normalizeText(data['RESPONSABLE']) ?? '';
        if (id <= 0 || !label || tipoValue <= 0) return null;
        return {
          id,
          label,
          tipo: tipoValue,
          responsable,
        };
      })
      .filter(
        (item): item is {
          id: number;
          label: string;
          tipo: number;
          responsable: string;
        } => item !== null,
      );

    return out.length ? out : fallback;
  }

  private async resolveMovimientoMotrAndLabel(
    tipo: number,
    motivoRaw: string | undefined,
    motrRaw: number | undefined,
  ) {
    const motivos = await this.resolveMovimientoMotivos(tipo);
    const motivo = this.normalizeText(motivoRaw);
    const motrFromDto = this.toInt(motrRaw);
    const motrFromText = motivo ? this.toInt(motivo) : null;
    const motr = motrFromDto ?? motrFromText;
    const motivoUpper = this.normalizeUpper(motivo);

    const selected =
      (motr == null
        ? null
        : motivos.find((item) => item.id === motr && item.tipo === tipo)) ??
      (motivoUpper == null
        ? null
        : motivos.find(
            (item) =>
              item.tipo === tipo && this.normalizeUpper(item.label) === motivoUpper,
          ));

    if (selected) {
      return { id: selected.id, label: selected.label };
    }

    if (motivos.length > 0) {
      throw new BadRequestException(
        `Debe seleccionar un motivo válido de DAT_ORD_MOTM para tipo ${tipo}.`,
      );
    }
    if (!motivo) {
      throw new BadRequestException('motivo es requerido');
    }
    return { id: motr ?? null, label: motivo };
  }

  private async assertAnyActionPermission(
    actions: string[],
    user: JwtPayload,
    fallbackMessage: string,
  ) {
    for (const action of actions) {
      try {
        await this.assertActionPermission(action, user);
        return;
      } catch (error) {
        if (!(error instanceof ForbiddenException)) {
          throw error;
        }
      }
    }
    throw new ForbiddenException(fallbackMessage);
  }

  private async assertOrdReadyForCambioMerma(
    iordRaw: string,
    user: JwtPayload,
    options: {
      requiredFlow: number;
      requiredFlowLabel: string;
      requiredTipom: number;
      requiredTipomLabel: string;
    },
  ) {
    const iord = this.requireIord(iordRaw);
    const scope = await this.resolveSucScope(user, null);
    const roleCode = await this.resolveRoleCode(user);
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        o.IORD,
        o.TIPO,
        TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
        LTRIM(RTRIM(ISNULL(e.TIPO, ''))) AS ESTSEGU_DESC,
        TRY_CONVERT(INT, o.TIPOM) AS TIPOM
      FROM dbo.PV_CTR_ORDS o
      LEFT JOIN dbo.DAT_EST_ORD e
        ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4', '@5')}
        AND ${this.buildOrdRequestedSucSql('o', '@5')}
      `,
      [
        iord,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCode),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );

    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException(
        `No existe la ORD ${iord} o no tiene acceso por sucursal`,
      );
    }
    this.assertOrdTipoMatchesRole(roleCode, row.TIPO, iord);

    const flow = this.toFloat(row.ESTSEGU);
    if (flow == null || Math.abs(flow - options.requiredFlow) > 0.0001) {
      const flowLabel = this.normalizeText(row.ESTSEGU_DESC) ?? 'SIN FLUJO';
      const flowText = flow == null ? 'SIN FLUJO' : this.formatStatusCode(flow);
      throw new BadRequestException(
        `La ORD ${iord} debe estar en estatus ${this.formatStatusCode(options.requiredFlow)} (${options.requiredFlowLabel}). Estado actual: ${flowText} ${flowLabel}`.trim(),
      );
    }

    const tipom = this.toInt(row.TIPOM) ?? 0;
    if (tipom != options.requiredTipom) {
      throw new BadRequestException(
        `La ORD ${iord} debe tener TIPOM ${options.requiredTipom} (${options.requiredTipomLabel}) para continuar.`,
      );
    }
  }

  private async fetchCambioMermaOriginalContext(
    iordRaw: string,
    user: JwtPayload,
    tipo: number,
    options: {
      allowFinalized?: boolean;
    } = {},
  ): Promise<CambioMermaOriginalContext> {
    const iord = this.requireIord(iordRaw);
    const scope = await this.resolveSucScope(user, null);
    const roleCode = await this.resolveRoleCode(user);
    const hasFolioRqfac = await this.hasColumn('PV_CTR_FOL_ASVR', 'RQFAC');
    const rqfacFolioSql = hasFolioRqfac
      ? `COALESCE(
            TRY_CONVERT(INT, f.REQF),
            TRY_CONVERT(INT, f.RQFAC)
          ) AS REQF_FOLIO,
          TRY_CONVERT(INT, f.RQFAC) AS RQFAC_FOLIO`
      : `TRY_CONVERT(INT, f.REQF) AS REQF_FOLIO,
          CAST(NULL AS INT) AS RQFAC_FOLIO`;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        o.*,
        LTRIM(RTRIM(ISNULL(deFlujo.TIPO, ''))) AS DESCFLUJO,
        LTRIM(RTRIM(ISNULL(deAuto.TIPO, ''))) AS DESAUTO,
        LTRIM(RTRIM(ISNULL(fol.AUT_FOLIO, ''))) AS AUT_FOLIO,
        TRY_CONVERT(INT, fol.REQF_FOLIO) AS REQF_FOLIO,
        TRY_CONVERT(INT, fol.RQFAC_FOLIO) AS RQFAC_FOLIO,
        TRY_CONVERT(INT, ds.IVA_INTEGRADO) AS IVA_INTEGRADO
      FROM dbo.PV_CTR_ORDS o
      LEFT JOIN dbo.DAT_EST_ORD deFlujo
        ON TRY_CONVERT(FLOAT, deFlujo.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)
      LEFT JOIN dbo.DAT_EST_ORD deAuto
        ON TRY_CONVERT(FLOAT, deAuto.ESTA) = TRY_CONVERT(FLOAT, o.selCtrlOrd)
      OUTER APPLY (
        SELECT TOP 1
          LTRIM(RTRIM(ISNULL(f.AUT, ''))) AS AUT_FOLIO,
          ${rqfacFolioSql}
        FROM dbo.PV_CTR_FOL_ASVR f
        WHERE UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, ''))))
        ORDER BY ISNULL(f.FCNM, f.FCN) DESC
      ) fol
      LEFT JOIN dbo.DAT_SUC ds
        ON UPPER(LTRIM(RTRIM(ISNULL(ds.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.SUC, ''))))
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4', '@5')}
        AND ${this.buildOrdRequestedSucSql('o', '@5')}
      `,
      [
        iord,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCode),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );

    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException(
        `No existe la ORD ${iord} o no tiene acceso por sucursal`,
      );
    }

    this.assertOrdTipoMatchesRole(roleCode, row.TIPO, iord);

    const requiredFlow = tipo === 1 ? 9.1 : 9.2;
    const requiredFlowLabel =
      tipo === 1 ? 'REGRESADO PARA CAMBIO' : 'REGRESADO PARA MERMA';
    const requiredTipomLabel =
      tipo === 1 ? 'CAMBIO DE ARTICULO' : 'MERMA DE ART Y CAMBIO';

    const flow = this.toFloat(row.ESTSEGU);
    const reeord =
      this.normalizeText(row.REEORD) ?? this.normalizeText(row.REOORD) ?? '';
    const allowFinalized =
      options.allowFinalized === true &&
      flow != null &&
      Math.abs(flow - 4) <= 0.0001 &&
      reeord.length > 0;
    if ((flow == null || Math.abs(flow - requiredFlow) > 0.0001) && !allowFinalized) {
      const flowLabel = this.normalizeText(row.DESCFLUJO) ?? 'SIN FLUJO';
      const flowText = flow == null ? 'SIN FLUJO' : this.formatStatusCode(flow);
      throw new BadRequestException(
        `La ORD ${iord} debe estar en estatus ${this.formatStatusCode(requiredFlow)} (${requiredFlowLabel}). Estado actual: ${flowText} ${flowLabel}`.trim(),
      );
    }

    const tipom = this.toInt(row.TIPOM) ?? this.toInt(row.TPOM) ?? 0;
    if (tipom !== tipo) {
      throw new BadRequestException(
        `La ORD ${iord} debe tener TIPOM ${tipo} (${requiredTipomLabel}) para continuar.`,
      );
    }

    return { row, scope, roleCode };
  }

  private async fetchCambioMermaStagingIfAny(iord: string, tipo: number) {
    if (!(await this.hasTable('PV_ORD_CAMBIO_MERMA_TMP'))) {
      return null;
    }
    return this.fetchCambioMermaStaging(iord, tipo);
  }

  private async fetchCambioMermaStaging(iord: string, tipo: number) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        t.IORD,
        t.TIPOM,
        t.NVA_IORD,
        t.ART_NUEVO,
        TRY_CONVERT(FLOAT, t.PVTA_NUEVO) AS PVTA_NUEVO,
        TRY_CONVERT(FLOAT, t.DIFERENCIA_ECONOMICA) AS DIFERENCIA_ECONOMICA,
        t.MOTR,
        t.MOTIVO,
        t.LABOR,
        t.DOCDIF,
        t.CTD_C_M,
        t.CREAR_NUEVA_ORD,
        t.USER_MOD,
        t.FCN_ALT,
        t.FCN_MOD
      FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
      WHERE UPPER(LTRIM(RTRIM(ISNULL(t.IORD, '')))) = UPPER(@0)
        AND TRY_CONVERT(INT, t.TIPOM) = @1
      `,
      [iord, tipo],
    );
    return this.firstRow(rows);
  }

  private async buildCambioMermaContextResponse(
    iord: string,
    tipo: number,
    originalRow: Record<string, unknown>,
    stagingRow: Record<string, unknown> | null,
  ) {
    const suc = this.normalizeText(originalRow.SUC) ?? '';
    const idfol = this.normalizeText(originalRow.IDFOL) ?? '';
    const artOriginal = this.normalizeText(originalRow.ART) ?? '';
    const ctdOriginal = this.toFloat(originalRow.CTD) ?? 0;
    const ctdCMStored = this.toFloat(originalRow.CTD_C_M);
    const ctdCM = this.resolveCtdCM(
      stagingRow?.CTD_C_M,
      originalRow.CTD_C_M,
      ctdOriginal,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal);

    const artNuevo =
      this.normalizeText(stagingRow?.ART_NUEVO) ??
      this.normalizeText(originalRow.ART) ??
      '';

    const originalArtInfo = await this.resolveArticuloDatArt(suc, artOriginal);
    const nuevoArtInfo = await this.resolveArticuloDatArt(suc, artNuevo);

    const precioOriginal = await this.resolveTicketLogUnitPrice(
      iord,
      idfol,
      artOriginal,
      originalArtInfo?.pvta ?? 0,
    );
    const precioNuevoDefault = nuevoArtInfo?.pvta ?? precioOriginal;
    const precioNuevo = this.roundMoney(
      this.toFloat(stagingRow?.PVTA_NUEVO) ?? precioNuevoDefault,
    );

    const tipoTran = this.resolveCambioMermaTipoTran(
      originalRow.TIPOTRAN ??
        originalRow.TIPO_TRAN ??
        originalRow.TIPTRAN ??
        originalRow.TIPO_TRANSACCION ??
        originalRow.ORIGEN_AUT ??
        originalRow.AUT_FOLIO ??
        originalRow.AUT,
    );
    const rqfac = this.resolveCambioMermaRqfac(originalRow);
    const ivaIntegrado = this.toInt(originalRow.IVA_INTEGRADO);
    const ctdCalculoOrd = ctdOriginal > 0 ? ctdOriginal : ctdCM;
    const ctdCalculoContable = ctdCM > 0 ? ctdCM : ctdCalculoOrd;
    const originalBase = this.roundMoney(precioOriginal * ctdCalculoOrd);
    const nuevoBase = this.roundMoney(precioNuevo * ctdCalculoOrd);
    const originalBaseContable = this.roundMoney(
      precioOriginal * ctdCalculoContable,
    );
    const nuevoBaseContable = this.roundMoney(
      precioNuevo * ctdCalculoContable,
    );

    const montosOriginal = this.calculateFinanceByIva(originalBase, {
      tipoTran,
      ivaIntegrado,
      rqfac,
    });
    const montosNuevo = this.calculateFinanceByIva(nuevoBase, {
      tipoTran,
      ivaIntegrado,
      rqfac,
    });
    const montosOriginalContable = this.calculateFinanceByIva(
      originalBaseContable,
      {
        tipoTran,
        ivaIntegrado,
        rqfac,
      },
    );
    const montosNuevoContable = this.calculateFinanceByIva(nuevoBaseContable, {
      tipoTran,
      ivaIntegrado,
      rqfac,
    });
    const diferenciaEconomicaCalculada = this.roundMoney(
      montosNuevoContable.total - montosOriginalContable.total,
    );
    const diferenciaEconomica = this.roundMoney(
      this.toFloat(stagingRow?.DIFERENCIA_ECONOMICA) ??
        diferenciaEconomicaCalculada,
    );
    const generaAfectacionContable = Math.abs(diferenciaEconomica) >= 0.009;

    const selCtrlOrd = this.toInt(originalRow.selCtrlOrd);
    const editable = this.isSelCtrlOrdEditable(selCtrlOrd);

    const motr = this.toInt(stagingRow?.MOTR) ?? this.toInt(originalRow.MOTR);
    const motivo =
      this.normalizeText(stagingRow?.MOTIVO) ??
      this.normalizeText(originalRow.MOTR) ??
      '';
    const labor =
      this.toInt(stagingRow?.LABOR) ?? this.toInt(originalRow.LABOR) ?? 0;
    const docDif =
      this.normalizeText(stagingRow?.DOCDIF) ??
      this.normalizeText(originalRow.DOCDIF) ??
      '';
    const crearNuevaOrd = true;
    const hasStagingRecord = stagingRow != null;
    const nvaIord = this.normalizeText(stagingRow?.NVA_IORD) ?? '';
    const hasCreatedOrd = await this.hasOrdHeader(nvaIord);
    const finalized =
      hasCreatedOrd &&
      Math.abs((this.toFloat(originalRow.ESTSEGU) ?? 0) - 4) <= 0.0001;

    return {
      ok: true,
      tipo,
      selCtrlOrd,
      hasStagingRecord,
      hasCreatedOrd,
      finalized,
      editable: editable && !hasCreatedOrd,
      blockedByAuthorization: selCtrlOrd === 14,
      canCreateNewOrd: false,
      canPrintFormato: hasCreatedOrd,
      canPrintSaldo: hasCreatedOrd && generaAfectacionContable,
      subtotalOriginal: montosOriginal.subtotal,
      ivaOriginal: montosOriginal.iva,
      totalOriginal: montosOriginal.total,
      subtotalNuevo: montosNuevo.subtotal,
      ivaNuevo: montosNuevo.iva,
      totalNuevo: montosNuevo.total,
      diferenciaEconomica,
      generaAfectacionContable,
      original: {
        ...originalRow,
        DESCFLUJO:
          this.normalizeText(originalRow.DESCFLUJO) ??
          this.normalizeText(originalRow.ESTSEGU_DESC) ??
          '',
        DESAUTO: this.normalizeText(originalRow.DESAUTO) ?? '',
        UPC: originalArtInfo?.upc ?? null,
        DES:
          originalArtInfo?.des ??
          this.normalizeText(originalRow.DESCART) ??
          this.normalizeText(originalRow.DESCRT) ??
          null,
        CTD: ctdOriginal,
        PVTAT_BASE: precioOriginal,
        CTD_C_M: ctdCMStored,
        CTD_C_M_CALCULADO: ctdCM,
        SUBTOTAL: montosOriginal.subtotal,
        IVA: montosOriginal.iva,
        TOTAL: montosOriginal.total,
        SUBTOTAL_CONTABLE: montosOriginalContable.subtotal,
        IVA_CONTABLE: montosOriginalContable.iva,
        TOTAL_CONTABLE: montosOriginalContable.total,
        USR_AUT_CYM: this.normalizeText(originalRow.USR_AUT_CYM) ?? null,
        FCN_AUT_CYM: originalRow.FCN_AUT_CYM ?? null,
      },
      draft: {
        IORD_ORIGINAL: iord,
        IDFOL: idfol,
        NCLIENTE:
          this.normalizeText(originalRow.NCLIENTE) ??
          this.normalizeText(originalRow.CLIEN) ??
          '',
        ART: artNuevo,
        UPC: nuevoArtInfo?.upc ?? '',
        DES:
          nuevoArtInfo?.des ??
          this.normalizeText(originalRow.DESCART) ??
          this.normalizeText(originalRow.DESCRT) ??
          '',
        CTD: ctdCalculoOrd,
        PVTA: precioNuevo,
        PVTAR: precioNuevo,
        TIPO: this.normalizeText(originalRow.TIPO) ?? '',
        TIPOM: tipo,
        MOTR: motr,
        MOTIVO: motivo,
        LABOR: labor,
        REEORD:
          this.normalizeText(originalRow.REEORD) ??
          this.normalizeText(originalRow.REOORD) ??
          iord,
        ASIGN: this.normalizeText(originalRow.ASIGN) ?? '',
        MAT: this.normalizeText(originalRow.MAT) ?? '',
        ESTSEGU: this.toFloat(originalRow.ESTSEGU) ?? 0,
        TIPO_PGO: this.normalizeText(originalRow.TIPO_PGO) ?? '',
        DAT_EST_ORD_TIPO:
          this.normalizeText(originalRow.DESCFLUJO) ??
          this.normalizeText(originalRow.ESTSEGU_DESC) ??
          '',
        DOCDIF: docDif,
        CTD_C_M: ctdCM,
        NVA_IORD: nvaIord,
        CREAR_NUEVA_ORD: crearNuevaOrd ? 1 : 0,
        SUBTOTAL: montosNuevo.subtotal,
        IVA: montosNuevo.iva,
        TOTAL: montosNuevo.total,
        SUBTOTAL_CONTABLE: montosNuevoContable.subtotal,
        IVA_CONTABLE: montosNuevoContable.iva,
        TOTAL_CONTABLE: montosNuevoContable.total,
        DIFERENCIA_ECONOMICA: diferenciaEconomica,
        FINALIZADA: finalized ? 1 : 0,
      },
    };
  }

  private async executeCambioMermaFinalization(
    iord: string,
    tipo: number,
    user: JwtPayload,
    ip: string | null,
    options: {
      requireSelCtrlOrd14: boolean;
      allowLegacySelCtrlOrd16?: boolean;
      auditAction: string;
      okMessage: string;
    },
  ) {
    await this.assertCambioMermaAuthorizationPermission(user);
    await this.assertCambioMermaStagingTable();

    const original = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const staging = await this.fetchCambioMermaStaging(iord, tipo);
    if (!staging) {
      throw new BadRequestException(
        `No existe captura temporal para la ORD ${iord}.`,
      );
    }
    const actor = this.auditActor(user);

    const allowedSelCtrlOrd = options.allowLegacySelCtrlOrd16
      ? new Set([14, 16])
      : new Set([14]);
    const selCtrlOrd = this.toInt(original.row.selCtrlOrd);
    if (!allowedSelCtrlOrd.has(selCtrlOrd ?? -1)) {
      throw new BadRequestException(
        `La ORD ${iord} debe estar en selCtrlOrd=${options.requireSelCtrlOrd14 ? '14' : '14 o 16'} para cerrar el proceso.`,
      );
    }

    const ctdOriginal = this.toFloat(original.row.CTD) ?? 0;
    const ctdCM = this.resolveCtdCM(staging.CTD_C_M, original.row.CTD_C_M, ctdOriginal);
    this.assertCtdCMCompatible(ctdCM, ctdOriginal);

    const suc = this.normalizeText(original.row.SUC) ?? '';
    const artOriginal = this.normalizeText(original.row.ART) ?? '';
    const artNuevo = this.normalizeText(staging.ART_NUEVO) ?? artOriginal;
    if (tipo === 1) {
      if (!artNuevo) {
        throw new BadRequestException(
          'Debe existir artículo nuevo en la captura para cambio material.',
        );
      }
      if (this.normalizeUpper(artNuevo) === this.normalizeUpper(artOriginal)) {
        throw new BadRequestException(
          'El artículo nuevo debe ser distinto al artículo original.',
        );
      }
    }

    const motivo = await this.resolveMovimientoMotrAndLabel(
      tipo,
      this.normalizeText(staging.MOTIVO) ?? undefined,
      this.toInt(staging.MOTR) ?? undefined,
    );
    const labor = this.toInt(staging.LABOR) ?? this.toInt(original.row.LABOR);
    if (labor != null && labor > 0) {
      await this.assertLaboratorioDisponibleParaOrd(
        iord,
        labor,
        user,
        original.scope,
        this.normalizeText(original.row.TIPO) ?? null,
      );
    }

    let pvtaNuevo = this.toFloat(staging.PVTA_NUEVO);
    if (pvtaNuevo == null && tipo === 1 && artNuevo) {
      const artInfo = await this.resolveArticuloDatArt(suc, artNuevo);
      pvtaNuevo = this.toFloat(artInfo?.pvta);
    }
    if (pvtaNuevo == null) {
      pvtaNuevo = await this.resolveCambioMermaOriginalUnitPrice(iord, original.row);
    }
    if (pvtaNuevo == null || !Number.isFinite(pvtaNuevo) || pvtaNuevo < 0) {
      throw new BadRequestException('pvtaNuevo inválido para cambio/merma.');
    }
    pvtaNuevo = this.roundMoney(pvtaNuevo);

    const nvaIord = await this.ensureCambioMermaReservedIordAvailable(
      iord,
      tipo,
      suc,
      staging,
      actor,
    );

    await this.upsertCambioMermaStaging(
      iord,
      tipo,
      {
        artNuevo,
        pvtaNuevo,
        diferenciaEconomica: this.toFloat(staging.DIFERENCIA_ECONOMICA),
        motr: motivo.id,
        motivo: motivo.label,
        labor,
        docDif:
          this.normalizeText(staging.DOCDIF) ??
          this.normalizeText(original.row.DOCDIF),
        ctdCM,
        crearNuevaOrd: true,
        nvaIord,
      },
      actor,
    );

    const stagedForSeal = await this.fetchCambioMermaStaging(iord, tipo);
    if (!stagedForSeal) {
      throw new BadRequestException(
        `No existe captura temporal sellada para la ORD ${iord}.`,
      );
    }
    const previewContext = await this.buildCambioMermaContextResponse(
      iord,
      tipo,
      original.row,
      stagedForSeal,
    );
    const sealedDiff =
      this.toFloat(previewContext.diferenciaEconomica) ??
      this.toFloat(stagedForSeal.DIFERENCIA_ECONOMICA);
    await this.syncCambioMermaStagingDiferencia(iord, tipo, sealedDiff, actor);

    let result: {
      ok: boolean;
      message: string;
      data: Record<string, unknown>;
    };

    if (tipo === 1) {
      result = await this.executeSimpleAction(
        'sp_ordenes_trabajo_cambio_material',
        iord,
        [
          artNuevo,
          motivo.label,
          labor,
          this.normalizeText(stagedForSeal.DOCDIF),
          motivo.id,
          ctdCM,
          pvtaNuevo,
          nvaIord,
        ],
        user,
        ip,
        'Cambio de material aplicado',
        'ORD_CAMBIO_MATERIAL',
        '@ART_NUEVO=@1,@MOTIVO=@2,@LABOR=@3,@DOCDIF=@4,@MOTR=@5,@CTD_C_M=@6,@PVTA_NUEVO=@7,@IORD_NUEVA=@8,',
      );
    } else {
      result = await this.executeSimpleAction(
        'sp_ordenes_trabajo_merma',
        iord,
        [
          ctdCM,
          motivo.label,
          1,
          motivo.id,
          artNuevo,
          ctdCM,
          pvtaNuevo,
          nvaIord,
        ],
        user,
        ip,
        'Merma procesada',
        'ORD_MERMA',
        '@CANTIDAD_MERMA=@1,@MOTIVO=@2,@CREAR_NUEVA_ORD=@3,@MOTR=@4,@ART_NUEVO=@5,@CTD_C_M=@6,@PVTA_NUEVO=@7,@IORD_NUEVA=@8,',
      );
    }

    const finalNewIord = this.normalizeText(result.data.IORD_NUEVA) ?? nvaIord;
    const finalDiff =
      this.toFloat(result.data.DIFERENCIA_ECONOMICA) ?? sealedDiff ?? 0;

    await this.forceEstatus2FromActionData(result.data);
    await this.finalizeCambioMermaOriginalAfterAuthorize(
      iord,
      finalNewIord,
      ctdOriginal,
      ctdCM,
      motivo.id,
      actor,
    );
    await this.markCambioMermaStagingCreated(
      iord,
      tipo,
      finalNewIord,
      finalDiff,
      actor,
    );
    await this.resetSelCtrlOrdByIords([finalNewIord]);

    await this.auditMutation(options.auditAction, user, ip, {
      iord,
      tipo,
      nvaIord: finalNewIord,
      ctdCM,
      pvtaNuevo,
      diferenciaEconomica: finalDiff,
      result: result.data,
    });

    const updatedOriginal = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
      { allowFinalized: true },
    );
    const refreshedStaging = await this.fetchCambioMermaStaging(iord, tipo);
    const context = await this.buildCambioMermaContextResponse(
      iord,
      tipo,
      updatedOriginal.row,
      refreshedStaging,
    );

    return {
      result: {
        ...result,
        message: options.okMessage,
      },
      context: {
        ...context,
        message: options.okMessage,
      },
    };
  }

  private async resolveArticuloDatArt(sucRaw: string, artRaw: string) {
    const suc = this.normalizeText(sucRaw);
    const art = this.normalizeText(artRaw);
    if (!suc || !art || !(await this.hasTable('DAT_ART'))) return null;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(a.ART, ''))) AS ART,
        LTRIM(RTRIM(ISNULL(a.UPC, ''))) AS UPC,
        LTRIM(RTRIM(ISNULL(a.DES, ''))) AS DES,
        TRY_CONVERT(FLOAT, a.PVTA) AS PVTA
      FROM dbo.DAT_ART a
      WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(@0)
        AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(@1)
      ORDER BY TRY_CONVERT(INT, ISNULL(a.BLOQ, 0)) ASC
      `,
      [suc, art],
    );
    const row = this.firstRow(rows);
    if (!row) return null;
    return {
      art: this.normalizeText(row.ART) ?? art,
      upc: this.normalizeText(row.UPC) ?? '',
      des: this.normalizeText(row.DES) ?? '',
      pvta: this.toFloat(row.PVTA) ?? 0,
    };
  }

  private async resolveTicketLogUnitPrice(
    iordRaw: string,
    idfolRaw: string,
    artRaw: string,
    fallback: number,
  ) {
    if (!(await this.hasTable('PV_TICKET_LOG'))) {
      return this.roundMoney(fallback);
    }
    const iord = this.normalizeText(iordRaw) ?? '';
    const idfol = this.normalizeText(idfolRaw) ?? '';
    const art = this.normalizeText(artRaw) ?? '';
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        TRY_CONVERT(FLOAT, t.PVTAT) AS PVTAT,
        TRY_CONVERT(FLOAT, t.PVTA) AS PVTA
      FROM dbo.PV_TICKET_LOG t
      WHERE (
          UPPER(LTRIM(RTRIM(ISNULL(t.ORD, '')))) = UPPER(@0)
          OR (
            UPPER(LTRIM(RTRIM(ISNULL(t.IDFOL, '')))) = UPPER(@1)
            AND UPPER(LTRIM(RTRIM(ISNULL(t.ART, '')))) = UPPER(@2)
          )
        )
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(t.ORD, '')))) = UPPER(@0) THEN 0
          ELSE 1
        END,
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(t.ART, '')))) = UPPER(@2) THEN 0
          ELSE 1
        END,
        ISNULL(t.updated_at, CONVERT(DATETIME, '19000101', 112)) DESC,
        LTRIM(RTRIM(ISNULL(t.ID, ''))) DESC
      `,
      [iord, idfol, art],
    );
    const row = this.firstRow(rows);
    const value = this.toFloat(row?.PVTAT) ?? this.toFloat(row?.PVTA) ?? fallback;
    return this.roundMoney(value);
  }

  private async resolveCambioMermaOriginalUnitPrice(
    iord: string,
    originalRow: Record<string, unknown>,
  ) {
    const suc = this.normalizeText(originalRow.SUC) ?? '';
    const idfol = this.normalizeText(originalRow.IDFOL) ?? '';
    const artOriginal = this.normalizeText(originalRow.ART) ?? '';
    const originalArtInfo = await this.resolveArticuloDatArt(suc, artOriginal);
    return this.resolveTicketLogUnitPrice(
      iord,
      idfol,
      artOriginal,
      originalArtInfo?.pvta ?? 0,
    );
  }

  private async syncCambioMermaStagingDiferencia(
    iord: string,
    tipo: number,
    diferenciaEconomica: number | null,
    actor: string,
  ) {
    if (!(await this.hasColumn('PV_ORD_CAMBIO_MERMA_TMP', 'DIFERENCIA_ECONOMICA'))) {
      return;
    }
    await this.dataSource.query(
      `
      UPDATE t
      SET
        DIFERENCIA_ECONOMICA = @2,
        USER_MOD = @3,
        FCN_MOD = GETDATE()
      FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
      WHERE UPPER(LTRIM(RTRIM(ISNULL(t.IORD, '')))) = UPPER(@0)
        AND TRY_CONVERT(INT, t.TIPOM) = @1
      `,
      [
        iord,
        tipo,
        diferenciaEconomica,
        actor,
      ],
    );
  }

  private async assertCambioMermaStagingUnlocked(
    iord: string,
    stagingRow: Record<string, unknown> | null,
  ) {
    const nvaIord = this.normalizeText(stagingRow?.NVA_IORD);
    if (await this.hasOrdHeader(nvaIord)) {
      throw new BadRequestException(
        `La ORD ${iord} ya tiene nueva ORD creada (${nvaIord}). CTD_C_M y MOTR quedan bloqueados.`,
      );
    }
  }

  private async hasOrdHeader(iordRaw: unknown) {
    const iord = this.normalizeText(iordRaw);
    if (!iord) return false;
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 IORD
      FROM dbo.PV_CTR_ORDS
      WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0)
      `,
      [iord],
    );
    return this.firstRow(rows) != null;
  }

  private async reserveCambioMermaNvaIord(sucRaw: string) {
    const suc = this.normalizeText(sucRaw);
    if (!suc) {
      throw new BadRequestException(
        'No se pudo determinar la sucursal para generar NVA_IORD.',
      );
    }
    const rows = await this.dataSource.query(
      `
      DECLARE @IORD_OUT NVARCHAR(255);
      DECLARE @FCN DATETIME = GETDATE();
      EXEC dbo.sp_pv_ctr_ords_generate_iord
        @SUC = @0,
        @FCN = @FCN,
        @IORD_OUT = @IORD_OUT OUTPUT;
      SELECT @IORD_OUT AS IORD;
      `,
      [suc],
    );
    const iord = this.normalizeText(this.firstRow(rows)?.IORD);
    if (!iord) {
      throw new BadRequestException('No se pudo generar NVA_IORD para la captura.');
    }
    return iord;
  }

  private async resolveCambioMermaReservedIord(
    sucRaw: string,
    stagingRow: Record<string, unknown> | null,
    options?: {
      iord?: string;
      tipo?: number;
      actor?: string;
    },
  ) {
    const reserved = this.normalizeText(stagingRow?.NVA_IORD);
    if (reserved && !(await this.hasOrdHeader(reserved))) {
      return reserved;
    }
    const regenerated = await this.reserveCambioMermaNvaIord(sucRaw);
    if (
      options?.iord &&
      options.tipo != null &&
      options.actor &&
      stagingRow != null
    ) {
      await this.dataSource.query(
        `
        UPDATE dbo.PV_ORD_CAMBIO_MERMA_TMP
        SET
          NVA_IORD = @2,
          USER_MOD = @3,
          FCN_MOD = GETDATE()
        WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0)
          AND TRY_CONVERT(INT, TIPOM) = @1
        `,
        [options.iord, options.tipo, regenerated, options.actor],
      );
    }
    return regenerated;
  }

  private async ensureCambioMermaReservedIordAvailable(
    iord: string,
    tipo: number,
    sucRaw: string,
    stagingRow: Record<string, unknown> | null,
    actor: string,
  ) {
    const reserved = this.normalizeText(stagingRow?.NVA_IORD);
    if (reserved && !(await this.hasOrdHeader(reserved))) {
      return reserved;
    }
    const regenerated = await this.reserveCambioMermaNvaIord(sucRaw);
    await this.dataSource.query(
      `
      UPDATE dbo.PV_ORD_CAMBIO_MERMA_TMP
      SET
        NVA_IORD = @2,
        USER_MOD = @3,
        FCN_MOD = GETDATE()
      WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0)
        AND TRY_CONVERT(INT, TIPOM) = @1
      `,
      [iord, tipo, regenerated, actor],
    );
    return regenerated;
  }

  private normalizeCambioMermaTipo(value: unknown) {
    const tipo = this.toInt(value);
    if (tipo !== 1 && tipo !== 2) {
      throw new BadRequestException('tipo debe ser 1 (cambio material) o 2 (merma)');
    }
    return tipo;
  }

  private resolveCtdCM(
    primary: unknown,
    secondary: unknown,
    ctdOriginal: number,
  ) {
    const fromPrimary = this.toFloat(primary);
    if (fromPrimary != null) {
      if (Math.abs(fromPrimary - 1) <= 0.0001) return 1;
      if (Math.abs(fromPrimary - 0.5) <= 0.0001) return 0.5;
    }
    const fromSecondary = this.toFloat(secondary);
    if (fromSecondary != null) {
      if (Math.abs(fromSecondary - 1) <= 0.0001) return 1;
      if (Math.abs(fromSecondary - 0.5) <= 0.0001) return 0.5;
    }
    return ctdOriginal >= 1 ? 1 : 0.5;
  }

  private normalizeStrictCtdCM(value: unknown, fallback?: number) {
    const parsed = this.toFloat(value);
    if (parsed != null) {
      if (Math.abs(parsed - 1) <= 0.0001) return 1;
      if (Math.abs(parsed - 0.5) <= 0.0001) return 0.5;
    }
    const fallbackParsed = this.toFloat(fallback);
    if (fallbackParsed != null) {
      if (Math.abs(fallbackParsed - 1) <= 0.0001) return 1;
      if (Math.abs(fallbackParsed - 0.5) <= 0.0001) return 0.5;
    }
    throw new BadRequestException('CTD_C_M solo permite valores 1 o 0.5.');
  }

  private assertCtdCMCompatible(ctdCM: number, ctdOriginal: number) {
    if (ctdOriginal <= 0) {
      throw new BadRequestException(
        'La ORD no tiene cantidad válida para procesar cambio/merma.',
      );
    }
    if (ctdCM - ctdOriginal > 0.0001) {
      throw new BadRequestException(
        'CTD_C_M no puede exceder la cantidad disponible de la ORD origen.',
      );
    }
  }

  private isSelCtrlOrdEditable(selCtrlOrd: number | null) {
    return (
      selCtrlOrd == null ||
      selCtrlOrd === 0 ||
      selCtrlOrd === 13 ||
      selCtrlOrd === 15
    );
  }

  private async assertCambioMermaStagingTable() {
    if (!(await this.hasTable('PV_ORD_CAMBIO_MERMA_TMP'))) {
      throw new BadRequestException(
        'No existe tabla de staging PV_ORD_CAMBIO_MERMA_TMP. Ejecuta el script SQL de cambio/merma actualizado.',
      );
    }
  }

  private async upsertCambioMermaStaging(
    iord: string,
    tipo: number,
    draft: {
      artNuevo: string | null;
      pvtaNuevo: number | null;
      diferenciaEconomica: number | null;
      motr: number | null;
      motivo: string | null;
      labor: number | null;
      docDif: string | null;
      ctdCM: number;
      crearNuevaOrd: boolean;
      nvaIord?: string | null;
    },
    actor: string,
  ) {
    await this.dataSource.query(
      `
      MERGE dbo.PV_ORD_CAMBIO_MERMA_TMP AS tgt
      USING (SELECT @0 AS IORD, @1 AS TIPOM) AS src
        ON UPPER(LTRIM(RTRIM(ISNULL(tgt.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(src.IORD, ''))))
       AND TRY_CONVERT(INT, tgt.TIPOM) = TRY_CONVERT(INT, src.TIPOM)
      WHEN MATCHED THEN
        UPDATE SET
          ART_NUEVO = @2,
          PVTA_NUEVO = @3,
          DIFERENCIA_ECONOMICA = @4,
          MOTR = @5,
          MOTIVO = @6,
          LABOR = @7,
          DOCDIF = @8,
          CTD_C_M = @9,
          CREAR_NUEVA_ORD = @10,
          NVA_IORD = @11,
          USER_MOD = @12,
          FCN_MOD = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (
          IORD,
          TIPOM,
          ART_NUEVO,
          PVTA_NUEVO,
          DIFERENCIA_ECONOMICA,
          MOTR,
          MOTIVO,
          LABOR,
          DOCDIF,
          CTD_C_M,
          CREAR_NUEVA_ORD,
          NVA_IORD,
          USER_MOD,
          FCN_ALT,
          FCN_MOD
        )
        VALUES (
          @0,
          @1,
          @2,
          @3,
          @4,
          @5,
          @6,
          @7,
          @8,
          @9,
          @10,
          @11,
          @12,
          GETDATE(),
          GETDATE()
        );
      `,
      [
        iord,
        tipo,
        draft.artNuevo,
        draft.pvtaNuevo,
        draft.diferenciaEconomica,
        draft.motr,
        draft.motivo,
        draft.labor,
        draft.docDif,
        draft.ctdCM,
        draft.crearNuevaOrd ? 1 : 0,
        draft.nvaIord ?? null,
        actor,
      ],
    );
  }

  private async markCambioMermaStagingCreated(
    iord: string,
    tipo: number,
    nvaIord: string | null,
    diferenciaEconomica: number | null,
    actor: string,
  ) {
    if (!(await this.hasColumn('PV_ORD_CAMBIO_MERMA_TMP', 'NVA_IORD'))) {
      return;
    }
    await this.dataSource.query(
      `
      UPDATE t
      SET
        NVA_IORD = @2,
        DIFERENCIA_ECONOMICA = COALESCE(@3, t.DIFERENCIA_ECONOMICA),
        USER_MOD = @4,
        FCN_MOD = GETDATE()
      FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
      WHERE UPPER(LTRIM(RTRIM(ISNULL(t.IORD, '')))) = UPPER(@0)
        AND TRY_CONVERT(INT, t.TIPOM) = @1
      `,
      [iord, tipo, nvaIord, diferenciaEconomica, actor],
    );
  }

  private async updateCambioMermaOriginalState(
    iord: string,
    selCtrlOrd: number,
    ctdCM: number,
    motr?: number | null,
  ) {
    await this.dataSource.query(
      `
      UPDATE dbo.PV_CTR_ORDS
      SET
        selCtrlOrd = @1,
        CTD_C_M = @2,
        MOTR = COALESCE(@3, MOTR),
        FCNMOD = GETDATE()
      WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0)
      `,
      [iord, selCtrlOrd, ctdCM, motr ?? null],
    );
  }

  private async finalizeCambioMermaOriginalAfterAuthorize(
    iord: string,
    newIord: string,
    ctdOriginal: number,
    ctdCM: number,
    motr: number | null,
    actor: string,
  ) {
    const hasUsrAut = await this.hasColumn('PV_CTR_ORDS', 'USR_AUT_CYM');
    const hasFcnAut = await this.hasColumn('PV_CTR_ORDS', 'FCN_AUT_CYM');

    await this.dataSource.query(
      `
      UPDATE dbo.PV_CTR_ORDS
      SET
        CTD = @2,
        CTD_C_M = @3,
        MOTR = COALESCE(@4, MOTR),
        REEORD = @1,
        selCtrlOrd = NULL,
        ESTSEGU = 4,
        ESTATUS = 2,
        ${hasUsrAut ? 'USR_AUT_CYM = @5,' : ''}
        ${hasFcnAut ? 'FCN_AUT_CYM = GETDATE(),' : ''}
        FCNMOD = GETDATE()
      WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0)
      `,
      [iord, newIord, ctdOriginal, ctdCM, motr ?? null, actor],
    );
  }

  private async clearCambioMermaStaging(iord: string, tipo: number) {
    await this.dataSource.query(
      `
      DELETE FROM dbo.PV_ORD_CAMBIO_MERMA_TMP
      WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0)
        AND TRY_CONVERT(INT, TIPOM) = @1
      `,
      [iord, tipo],
    );
  }

  private async resetSelCtrlOrdByIords(values: Array<string | null | undefined>) {
    const iords = [...new Set(values.map((item) => this.normalizeText(item) ?? ''))]
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (!iords.length) return;
    const valuesSql = iords.map((_, idx) => `(@${idx})`).join(',');
    await this.dataSource.query(
      `
      UPDATE o
      SET
        o.selCtrlOrd = NULL,
        o.FCNMOD = GETDATE()
      FROM dbo.PV_CTR_ORDS o
      INNER JOIN (VALUES ${valuesSql}) AS v(IORD)
        ON UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(v.IORD, ''))))
      `,
      iords,
    );
  }

  private async assertCambioMermaContextPermission(
    tipo: number,
    user: JwtPayload,
  ) {
    try {
      await this.assertActionPermission(
        tipo === 1 ? 'CAMBIO_MATERIAL' : 'MERMA',
        user,
      );
      return;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }

    await this.assertCambioMermaAuthorizationPermission(user);
  }

  private async assertCambioMermaAuthorizationPermission(user: JwtPayload) {
    if (this.isAdmin(user)) return;
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    if (roleCode === 'ANALISTA_INV' || roleCode === 'INVJEF') {
      return;
    }
    throw new ForbiddenException(
      'Rol no autorizado para aprobar cambio material/merma.',
    );
  }

  private resolveCambioMermaTipoTran(value: unknown) {
    const tipoTran = this.normalizeUpper(value);
    if (tipoTran === 'CA') return 'CA';
    if (tipoTran === 'VF') return 'VF';
    if (['DCA', 'DC', 'DG', 'CP', 'PS'].includes(tipoTran)) return 'CA';
    if (tipoTran === 'DVF') return 'VF';
    return 'VF';
  }

  private resolveCambioMermaRqfac(row: Record<string, unknown>) {
    return (
      this.toInt(row.REQF_FOLIO) ??
      this.toInt(row.RQFAC_FOLIO) ??
      this.toInt(row.REQF) ??
      this.toInt(row.RQFAC)
    );
  }

  private calculateFinanceByIva(
    totalBase: number,
    options: { tipoTran: string; ivaIntegrado: number | null; rqfac: number | null },
  ): CambioMermaFinance {
    const base = this.roundMoney(totalBase);
    if (base <= 0) {
      return { subtotal: 0, iva: 0, total: 0 };
    }

    if (this.normalizeUpper(options.tipoTran) === 'CA') {
      return { subtotal: base, iva: 0, total: base };
    }

    const ivaIntegrado = this.toInt(options.ivaIntegrado) ?? 0;
    const rqfac = this.toInt(options.rqfac) ?? 0;

    if (ivaIntegrado === -1) {
      const total = base;
      const subtotal = this.roundMoney(total / 1.16);
      const iva = this.roundMoney(total - subtotal);
      return { subtotal, iva, total };
    }

    if (rqfac === 1) {
      const subtotal = base;
      const iva = this.roundMoney(subtotal * 0.16);
      const total = this.roundMoney(subtotal + iva);
      return { subtotal, iva, total };
    }

    const total = base;
    const subtotal = this.roundMoney(total / 1.16);
    const iva = this.roundMoney(total - subtotal);
    return { subtotal, iva, total };
  }

  private roundMoney(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async resolveLaboratorios(
    scope: SucScope,
    sucOverride?: string | null,
  ) {
    if (!(await this.hasTable('DAT_LAB'))) {
      return [];
    }
    if (await this.hasTable('DAT_LAB_ACCESO')) {
      return this.resolveLaboratoriosFromAcceso(scope, sucOverride);
    }
    return this.resolveLaboratoriosLegacy(sucOverride ?? scope.requestedSuc);
  }

  private async hasTable(tableName: string) {
    if (!tableName.trim()) return false;
    return (
      (
        await this.dataSource.query(
          `
        SELECT 1
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @0
        `,
          [tableName.trim()],
        )
      ).length > 0
    );
  }

  private async hasColumn(tableName: string, columnName: string) {
    if (!tableName.trim() || !columnName.trim()) return false;
    return (
      (
        await this.dataSource.query(
          `
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = @0
          AND COLUMN_NAME = @1
        `,
          [tableName.trim(), columnName.trim()],
        )
      ).length > 0
    );
  }

  private async resolveLaboratoriosFromAcceso(
    scope: SucScope,
    sucOverride?: string | null,
  ) {
    const requestedSucRaw = this.normalizeText(sucOverride ?? scope.requestedSuc);
    const requestedSuc = requestedSucRaw ? requestedSucRaw.toUpperCase() : null;
    const rows = await this.dataSource.query(
      `
      WITH raw AS (
        SELECT
          TRY_CONVERT(INT, a.LAB_ACCESO) AS ID,
          LTRIM(RTRIM(ISNULL(l.LAB, ''))) AS LAB,
          UPPER(
            LTRIM(
              RTRIM(
                ISNULL(
                  NULLIF(a.TIPO, ''),
                  ISNULL(l.TIPOLAB, '')
                )
              )
            )
          ) AS TIPOLAB,
          UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) AS SUC,
          UPPER(LTRIM(RTRIM(ISNULL(l.SUC, '')))) AS LAB_SUC,
          ROW_NUMBER() OVER (
            PARTITION BY
              UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))),
              TRY_CONVERT(INT, a.LAB_ACCESO),
              UPPER(
                LTRIM(
                  RTRIM(
                    ISNULL(
                      NULLIF(a.TIPO, ''),
                      ISNULL(l.TIPOLAB, '')
                    )
                  )
                )
              )
            ORDER BY
              UPPER(LTRIM(RTRIM(ISNULL(l.LAB, '')))),
              TRY_CONVERT(INT, a.ID)
          ) AS RN
        FROM dbo.DAT_LAB_ACCESO a
        INNER JOIN dbo.DAT_LAB l
          ON TRY_CONVERT(INT, l.ID) = TRY_CONVERT(INT, a.LAB_ACCESO)
        WHERE ISNULL(a.ESTADO, 0) = 1
          AND ISNULL(l.BLOQ, 0) = 0
          AND (
            @0 = 1
            OR @1 IS NULL
            OR UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) IN (
              SELECT UPPER(LTRIM(RTRIM(value)))
              FROM STRING_SPLIT(ISNULL(@1, ''), ',')
              WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> ''
            )
          )
          AND (
            @2 IS NULL
            OR UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(@2)
          )
      )
      SELECT ID, LAB, TIPOLAB, SUC, LAB_SUC
      FROM raw
      WHERE RN = 1
      ORDER BY
        UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))),
        UPPER(LTRIM(RTRIM(ISNULL(LAB, '')))),
        ID
      `,
      [scope.isAdmin ? 1 : 0, scope.allowedSucsCsv, requestedSuc],
    );
    return this.mapLaboratorios(rows);
  }

  private async resolveLaboratoriosLegacy(sucOverride?: string | null) {
    const requestedSucRaw = this.normalizeText(sucOverride);
    const requestedSuc = requestedSucRaw ? requestedSucRaw.toUpperCase() : null;
    const rows = await this.dataSource.query(
      `
      WITH raw AS (
        SELECT
          TRY_CONVERT(INT, l.ID) AS ID,
          LTRIM(RTRIM(ISNULL(l.LAB, ''))) AS LAB,
          UPPER(LTRIM(RTRIM(ISNULL(l.TIPOLAB, '')))) AS TIPOLAB,
          UPPER(LTRIM(RTRIM(ISNULL(l.SUC, '')))) AS SUC,
          UPPER(LTRIM(RTRIM(ISNULL(l.SUC, '')))) AS LAB_SUC,
          ROW_NUMBER() OVER (
            PARTITION BY TRY_CONVERT(INT, l.ID)
            ORDER BY
              CASE
                WHEN @0 IS NOT NULL
                  AND UPPER(LTRIM(RTRIM(ISNULL(l.SUC, '')))) = @0
                  THEN 0
                WHEN LTRIM(RTRIM(ISNULL(l.SUC, ''))) = '' THEN 1
                ELSE 2
              END,
              UPPER(LTRIM(RTRIM(ISNULL(l.LAB, ''))))
          ) AS RN
        FROM dbo.DAT_LAB l
        WHERE ISNULL(l.BLOQ, 0) = 0
      )
      SELECT ID, LAB, TIPOLAB, SUC, LAB_SUC
      FROM raw
      WHERE RN = 1
      ORDER BY UPPER(LTRIM(RTRIM(ISNULL(LAB, '')))), ID
      `,
      [requestedSuc],
    );
    return this.mapLaboratorios(rows);
  }

  private mapLaboratorios(rows: unknown[]) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const id = this.toInt((row as Record<string, unknown>)['ID']) ?? 0;
        const lab =
          this.normalizeText((row as Record<string, unknown>)['LAB']) ?? '';
        const tipoLabRaw =
          this.normalizeText((row as Record<string, unknown>)['TIPOLAB']) ?? '';
        const tipoLab =
          this.normalizeOrdTipo(tipoLabRaw) ||
          this.normalizeUpper(tipoLabRaw) ||
          '';
        const suc =
          this.normalizeText((row as Record<string, unknown>)['SUC']) ?? '';
        const labSuc =
          this.normalizeText((row as Record<string, unknown>)['LAB_SUC']) ?? suc;
        if (id <= 0 || !lab) return null;
        return { id, lab, tipoLab, suc, labSuc };
      })
      .filter(
        (
          item,
        ): item is {
          id: number;
          lab: string;
          tipoLab: string;
          suc: string;
          labSuc: string;
        } =>
          item !== null,
      );
  }

  private async assertLaboratorioDisponibleParaOrd(
    iord: string,
    labor: number,
    user: JwtPayload,
    scope: SucScope,
    ordTipoOverride?: string | null,
  ) {
    const roleCode = await this.resolveRoleCode(user);
    const ord = await this.fetchOrdLaboratorioContext(iord, scope, roleCode);
    const effectiveTipo =
      this.normalizeOrdTipo(ordTipoOverride) || this.normalizeOrdTipo(ord.tipo);
    this.assertOrdTipoMatchesRole(roleCode, effectiveTipo || ord.tipo, iord);
    const laboratorios = await this.resolveLaboratorios(scope, ord.suc);
    if (this.isLaboratorioDisponible(laboratorios, labor, effectiveTipo)) return;
    throw new BadRequestException(
      `El laboratorio ${labor} no está habilitado para la sucursal ${ord.suc || 'N/D'} y tipo ${effectiveTipo || ord.tipo || 'N/D'} de la ORD ${iord}.`,
    );
  }

  private async assertLaboratorioDisponibleParaLote(
    iords: string[],
    labor: number,
    user: JwtPayload,
    scope: SucScope,
  ) {
    const roleCode = await this.resolveRoleCode(user);
    const ords = await this.fetchBatchOrdLaboratorioContext(
      iords,
      scope,
      roleCode,
    );
    const cache = new Map<
      string,
      Array<{ id: number; lab: string; tipoLab: string; suc: string }>
    >();
    const invalid: string[] = [];

    for (const ord of ords) {
      this.assertOrdTipoMatchesRole(roleCode, ord.tipo, ord.iord);
      let laboratorios = cache.get(ord.suc);
      if (!laboratorios) {
        laboratorios = await this.resolveLaboratorios(scope, ord.suc);
        cache.set(ord.suc, laboratorios);
      }
      if (this.isLaboratorioDisponible(laboratorios, labor, ord.tipo)) {
        continue;
      }
      invalid.push(ord.iord);
    }

    if (!invalid.length) return;
    throw new BadRequestException(
      `El laboratorio ${labor} no está habilitado en DAT_LAB_ACCESO para las ORDs: ${invalid.join(', ')}`,
    );
  }

  private isLaboratorioDisponible(
    laboratorios: Array<{
      id: number;
      lab: string;
      tipoLab: string;
      suc: string;
    }>,
    labor: number,
    tipoRaw: string,
  ) {
    const tipo = this.normalizeOrdTipo(tipoRaw);
    return laboratorios.some(
      (item) =>
        item.id === labor &&
        (!tipo ||
          !this.normalizeOrdTipo(item.tipoLab) ||
          this.normalizeOrdTipo(item.tipoLab) === tipo),
    );
  }

  private async fetchOrdLaboratorioContext(
    iord: string,
    scope: SucScope,
    roleCodeRaw: string,
  ) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
        UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) AS SUC,
        UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) AS TIPO
      FROM dbo.PV_CTR_ORDS o
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4', '@5')}
        AND ${this.buildOrdRequestedSucSql('o', '@5')}
      `,
      [
        iord,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCodeRaw),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );
    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException(`No existe ORD ${iord} o no tiene acceso`);
    }
    return {
      iord: this.normalizeUpper(row.IORD ?? iord),
      suc: this.normalizeUpper(row.SUC ?? ''),
      tipo:
        this.normalizeOrdTipo(row.TIPO ?? '') ||
        this.normalizeUpper(row.TIPO ?? ''),
    };
  }

  private async fetchBatchOrdLaboratorioContext(
    iords: string[],
    scope: SucScope,
    roleCodeRaw: string,
  ) {
    if (!iords.length) return [];
    const placeholders = iords.map((_, idx) => `@${idx}`).join(',');
    const rows = await this.dataSource.query(
      `
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
        UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) AS SUC,
        UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) AS TIPO
      FROM dbo.PV_CTR_ORDS o
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) IN (${placeholders})
        AND ${this.buildOrdAllowedSucSql('o', 'lab', `@${iords.length}`, `@${iords.length + 1}`, `@${iords.length + 2}`, `@${iords.length + 3}`, `@${iords.length + 4}`)}
        AND ${this.buildOrdRequestedSucSql('o', `@${iords.length + 4}`)}
      `,
      [
        ...iords,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCodeRaw),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );

    const records = (Array.isArray(rows) ? rows : []).map(
      (row) => row as Record<string, unknown>,
    );
    const visibleIords = new Set(
      records
        .map((row) => this.normalizeUpper(row.IORD ?? ''))
        .filter((value) => value.length > 0),
    );
    const missing = iords.filter(
      (iordItem) => !visibleIords.has(this.normalizeUpper(iordItem)),
    );
    if (missing.length) {
      throw new NotFoundException(
        `ORD no encontrada o sin acceso por sucursal: ${missing.join(', ')}`,
      );
    }

    return records.map((row) => ({
      iord: this.normalizeUpper(row.IORD ?? ''),
      suc: this.normalizeUpper(row.SUC ?? ''),
      tipo:
        this.normalizeOrdTipo(row.TIPO ?? '') ||
        this.normalizeUpper(row.TIPO ?? ''),
    }));
  }

  private formatStatusCode(value: number) {
    const rounded = Math.round(value * 1000) / 1000;
    const text = rounded.toString();
    return text.endsWith('.0') ? text.slice(0, -2) : text;
  }

  private sortOrdDetails(details: Record<string, unknown>[]) {
    const jobOrder = new Map<string, number>([
      ['OD', 0],
      ['OI', 1],
      ['ADD', 2],
    ]);
    return [...details].sort((a, b) => {
      const aJob = this.normalizeUpper(a?.JOB ?? '');
      const bJob = this.normalizeUpper(b?.JOB ?? '');
      const aWeight = jobOrder.get(aJob) ?? jobOrder.size;
      const bWeight = jobOrder.get(bJob) ?? jobOrder.size;
      if (aWeight !== bWeight) return aWeight - bWeight;
      const aIordp = this.toInt(a?.IORDP) ?? Number.MAX_SAFE_INTEGER;
      const bIordp = this.toInt(b?.IORDP) ?? Number.MAX_SAFE_INTEGER;
      if (aIordp !== bIordp) return aIordp - bIordp;
      return aJob.localeCompare(bJob);
    });
  }

  private resolveAllowedActions(
    user: JwtPayload,
    roleCodeRaw: string,
    panelMode: 'operativo' | 'estado' | 'anulados' | 'entregadas',
  ) {
    const operationalActions = [
      'VER_DETALLE',
      'AUTORIZAR',
      'ANULAR',
      'ENVIAR',
      'ASIGNAR',
      'TRABAJO_TERMINADO',
      'REGRESAR_INCIDENCIA',
      'REGRESAR_TIENDA',
      'ASIGNAR_LABORATORIO',
      'RECIBIR',
      'ENTREGAR',
      'IMPRIMIR_ETIQUETA',
      'CAMBIO_MATERIAL',
      'MERMA',
      'SCAN_RECIBIR',
      'SCAN_ENTREGAR',
    ];

    if (this.isAdmin(user)) {
      if (panelMode === 'estado') return ['VER_DETALLE'];
      if (panelMode === 'anulados') return ['VER_DETALLE'];
      if (panelMode === 'entregadas') return ['VER_DETALLE', 'GARANTIA'];
      return operationalActions;
    }

    const roleCode = this.normalizeUpper(roleCodeRaw);
    const byRole: Record<string, string[]> = {
      JEF_TALLER: operationalActions,
      ANALISTA_ORD: [
        'VER_DETALLE',
        'AUTORIZAR',
        'ENVIAR',
        'REGRESAR_TIENDA',
        'ASIGNAR_LABORATORIO',
        'SCAN_RECIBIR',
        'ENTREGAR',
        'IMPRIMIR_ETIQUETA',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_ENTREGAR',
      ],
      ANALISTA_INV: ['VER_DETALLE', 'CAMBIO_MATERIAL', 'MERMA'],
      INVJEF: ['VER_DETALLE', 'CAMBIO_MATERIAL', 'MERMA'],
      ENC_MAQUILA: [
        'VER_DETALLE',
        'ASIGNAR',
        'TRABAJO_TERMINADO',
        'REGRESAR_INCIDENCIA',
        'RECIBIR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_RECIBIR',
      ],
      ENC_BISEL: [
        'VER_DETALLE',
        'ASIGNAR',
        'TRABAJO_TERMINADO',
        'REGRESAR_INCIDENCIA',
        'RECIBIR',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_RECIBIR',
      ],
    };

    const allowed = byRole[roleCode] ?? [];
    if (panelMode === 'estado') {
      return roleCode === 'JEF_TALLER' || roleCode === 'ANALISTA_ORD'
        ? ['VER_DETALLE']
        : [];
    }
    if (panelMode === 'anulados') {
      if (roleCode === 'JEF_TALLER') return ['VER_DETALLE'];
      return [];
    }
    if (panelMode === 'entregadas') {
      if (roleCode === 'JEF_TALLER') return ['VER_DETALLE', 'GARANTIA'];
      return [];
    }
    return allowed;
  }

  private canEditOrdDetail(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return (
      roleCode === 'JEF_TALLER' ||
      roleCode === 'ANALISTA_ORD'
    );
  }

  private canManageOrdTipoAndPrint(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return (
      roleCode === 'JEF_TALLER' || roleCode === 'ANALISTA_ORD'
    );
  }

  private normalizeOrdTipo(value: unknown) {
    const tipo = this.normalizeUpper(value);
    if (!tipo) return '';
    if (tipo === 'TALLADO' || tipo === 'TALLER') return 'TALLADO';
    if (tipo === 'BISELADO' || tipo === 'BISEL') return 'BISELADO';
    return '';
  }

  private resolveOrdTipoScope(roleCodeRaw: string) {
    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (roleCode === 'ENC_MAQUILA') {
      return 'TALLADO';
    }
    if (roleCode === 'ENC_BISEL') {
      return 'BISELADO';
    }
    return null;
  }

  private async assertOrdTypeAccessByIord(
    iord: string,
    user: JwtPayload,
    scope: SucScope,
  ) {
    if (scope.isAdmin) return;
    const roleCode = await this.resolveRoleCode(user);
    const requiredTipo = this.resolveOrdTipoScope(roleCode);
    if (!requiredTipo) return;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
        UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) AS TIPO
      FROM dbo.PV_CTR_ORDS o
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4', '@5')}
        AND ${this.buildOrdRequestedSucSql('o', '@5')}
      `,
      [
        iord,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCode),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );

    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException(`No existe ORD ${iord} o no tiene acceso`);
    }
    const actualTipo =
      this.normalizeOrdTipo(row.TIPO ?? '') ||
      this.normalizeUpper(row.TIPO ?? '');
    if (actualTipo === requiredTipo) return;

    throw new ForbiddenException(
      `La ORD ${iord} pertenece a ${actualTipo || 'OTRO TALLER'} y tu rol solo puede operar ORDs ${requiredTipo}.`,
    );
  }

  private async assertOrdTypeAccessByCode(
    code: string,
    user: JwtPayload,
    scope: SucScope,
  ) {
    if (scope.isAdmin) return;
    const roleCode = await this.resolveRoleCode(user);
    const requiredTipo = this.resolveOrdTipoScope(roleCode);
    if (!requiredTipo) return;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
        UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) AS TIPO
      FROM dbo.PV_CTR_ORDS o
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE (
          UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
          OR UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) = UPPER(@0)
        )
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4', '@5')}
        AND ${this.buildOrdRequestedSucSql('o', '@5')}
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0) THEN 0
          ELSE 1
        END,
        ISNULL(o.FCNS, ISNULL(o.FCNMOD, o.FCNM)) DESC,
        o.IORD DESC
      `,
      [
        code,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCode),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );

    const row = this.firstRow(rows);
    if (!row) {
      throw new NotFoundException(
        `No existe ORD para el código ${code} o no tiene acceso por sucursal`,
      );
    }
    this.assertOrdTipoMatchesRole(
      roleCode,
      row.TIPO,
      this.normalizeText(row.IORD) ?? code,
    );
  }

  private assertOrdTipoMatchesRole(
    roleCodeRaw: string,
    ordTipoRaw: unknown,
    iord: string,
  ) {
    const requiredTipo = this.resolveOrdTipoScope(roleCodeRaw);
    if (!requiredTipo) return;
    const actualTipo = this.normalizeOrdTipo(ordTipoRaw);
    if (actualTipo === requiredTipo) return;

    throw new ForbiddenException(
      `La ORD ${iord} pertenece a ${actualTipo || 'OTRO TALLER'} y tu rol solo puede operar ORDs ${requiredTipo}.`,
    );
  }

  private async assertBatchOrdTypeAccess(
    iords: string[],
    user: JwtPayload,
    scope: SucScope,
  ) {
    if (scope.isAdmin || !iords.length) return;
    const roleCode = await this.resolveRoleCode(user);
    const requiredTipo = this.resolveOrdTipoScope(roleCode);
    if (!requiredTipo) return;

    const placeholders = iords.map((_, idx) => `@${idx}`).join(',');
    const rows = await this.dataSource.query(
      `
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
        UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) AS TIPO
      FROM dbo.PV_CTR_ORDS o
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) IN (${placeholders})
        AND ${this.buildOrdAllowedSucSql('o', 'lab', `@${iords.length}`, `@${iords.length + 1}`, `@${iords.length + 2}`, `@${iords.length + 3}`, `@${iords.length + 4}`)}
        AND ${this.buildOrdRequestedSucSql('o', `@${iords.length + 4}`)}
      `,
      [
        ...iords,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCode),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );

    const records = (Array.isArray(rows) ? rows : []).map(
      (row) => row as Record<string, unknown>,
    );
    const visibleIords = new Set(
      records
        .map((row) => this.normalizeUpper(row.IORD ?? ''))
        .filter((value) => value.length > 0),
    );
    const missing = iords.filter(
      (iord) => !visibleIords.has(this.normalizeUpper(iord)),
    );
    if (missing.length) {
      throw new NotFoundException(
        `ORD no encontrada o sin acceso por sucursal: ${missing.join(', ')}`,
      );
    }

    const invalid = records
      .filter((row) => this.normalizeOrdTipo(row.TIPO ?? '') !== requiredTipo)
      .map((row) => this.normalizeUpper(row.IORD ?? ''))
      .filter((value) => value.length > 0);
    if (!invalid.length) return;

    throw new ForbiddenException(
      `Las siguientes ORDs no corresponden a tu taller ${requiredTipo}: ${invalid.join(', ')}`,
    );
  }

  private async assertBatchLaboratorioAsignado(
    iords: string[],
    scope: SucScope,
    user: JwtPayload,
  ) {
    const roleCode = await this.resolveRoleCode(user);
    const rows = await this.fetchBatchOrdOperationalContext(
      iords,
      scope,
      roleCode,
    );
    const invalid = rows
      .filter((row) => (this.toInt(row.LABOR) ?? 0) <= 0)
      .map((row) => this.normalizeUpper(row.IORD ?? ''))
      .filter((item) => item.length > 0);
    if (!invalid.length) return;
    throw new BadRequestException(
      `Las siguientes ORDs deben tener laboratorio asignado para enviar a taller: ${invalid.join(', ')}`,
    );
  }

  private async assertBatchFlowAndAsignadoForIncidencia(
    iords: string[],
    scope: SucScope,
    user: JwtPayload,
  ) {
    const roleCode = await this.resolveRoleCode(user);
    const rows = await this.fetchBatchOrdOperationalContext(
      iords,
      scope,
      roleCode,
    );
    const invalidFlow = rows
      .filter((row) => {
        const flow = this.toFloat(row.ESTSEGU);
        return flow == null || Math.abs(flow - 8) > 0.0001;
      })
      .map((row) => this.normalizeUpper(row.IORD ?? ''))
      .filter((item) => item.length > 0);
    if (invalidFlow.length) {
      throw new BadRequestException(
        `Solo se puede registrar incidencia para ORDs en estatus 8 (ASIGNADA): ${invalidFlow.join(', ')}`,
      );
    }
    const invalidAsignado = rows
      .filter((row) => !this.normalizeText(row.ASIGN))
      .map((row) => this.normalizeUpper(row.IORD ?? ''))
      .filter((item) => item.length > 0);
    if (!invalidAsignado.length) return;
    throw new BadRequestException(
      `Las siguientes ORDs deben tener colaborador asignado para registrar incidencia: ${invalidAsignado.join(', ')}`,
    );
  }

  private async applyFlowVisibilityRulesToItems(
    items: Record<string, unknown>[],
    rules: OrdFlowVisibilityRule[],
    scope: SucScope,
    roleCodeRaw: string,
  ) {
    if (!items.length || !rules.length) return items;
    const externalOnlyFlows = new Set(
      rules
        .filter((rule) => rule.onlyExternalLab)
        .map((rule) => this.formatStatusCode(rule.estsegu)),
    );
    if (!externalOnlyFlows.size) return items;

    const iords = items
      .map((item) => this.normalizeUpper(item.IORD ?? ''))
      .filter((value) => value.length > 0);
    if (!iords.length) return items;

    const contextRows = await this.fetchBatchOrdOperationalContext(
      iords,
      scope,
      roleCodeRaw,
    );
    const externalByIord = new Map<string, boolean>();
    for (const row of contextRows) {
      const iord = this.normalizeUpper(row.IORD ?? '');
      if (!iord) continue;
      externalByIord.set(iord, this.isLaboratorioExterno(row));
    }

    return items.filter((item) => {
      const flow = this.toFloat(item.ESTSEGU);
      if (flow == null) return true;
      const flowCode = this.formatStatusCode(flow);
      if (!externalOnlyFlows.has(flowCode)) return true;

      const iord = this.normalizeUpper(item.IORD ?? '');
      if (!iord) return false;
      return externalByIord.get(iord) === true;
    });
  }

  private async resolveFlowVisibilityRules(
    user: JwtPayload,
    roleCodeRaw: string,
    panelMode: 'operativo' | 'estado' | 'anulados' | 'entregadas',
  ) {
    const tableExists = await this.hasFlowVisibilityTable();
    if (!tableExists) return [];

    const roleCode = this.isAdmin(user)
      ? 'ADMIN'
      : this.normalizeUpper(roleCodeRaw);
    if (!roleCode) return [];
    const roleCandidates = this.resolveFlowVisibilityRoleCandidates(roleCode);
    if (!roleCandidates.length) return [];
    const rolePlaceholders = roleCandidates.map((_, idx) => `@${idx + 1}`).join(',');

    const rows = await this.dataSource.query(
      `
      SELECT
        TRY_CONVERT(FLOAT, ESTA) AS ESTA,
        TRY_CONVERT(BIT, SOLO_EXTERNO) AS SOLO_EXTERNO,
        UPPER(LTRIM(RTRIM(ISNULL(ROLE_CODE, '')))) AS ROLE_CODE
      FROM dbo.DAT_JAO_ORD_FLUJO_VIS
      WHERE UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) = 'DAT_JAO_ORD'
        AND UPPER(LTRIM(RTRIM(ISNULL(PANEL_MODE, '')))) = UPPER(@0)
        AND UPPER(LTRIM(RTRIM(ISNULL(ROLE_CODE, '')))) IN (${rolePlaceholders})
        AND ISNULL(ACTIVO, 1) = 1
      ORDER BY TRY_CONVERT(FLOAT, ESTA)
      `,
      [panelMode, ...roleCandidates],
    );
    const candidatePriority = new Map<string, number>();
    roleCandidates.forEach((candidate, index) =>
      candidatePriority.set(candidate, index),
    );

    type CandidateRule = OrdFlowVisibilityRule & { priority: number };
    const selectedByFlow = new Map<string, CandidateRule>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const record = row as Record<string, unknown>;
      const role = this.normalizeUpper(record.ROLE_CODE ?? '');
      if (!role) continue;
      const priority = candidatePriority.get(role);
      if (priority == null) continue;

      const estsegu = this.toFloat(record.ESTA);
      if (estsegu == null) continue;
      const onlyExternalLab = this.toInt(record.SOLO_EXTERNO) === 1;
      const flowCode = this.formatStatusCode(estsegu);

      const current = selectedByFlow.get(flowCode);
      if (!current) {
        selectedByFlow.set(flowCode, { estsegu, onlyExternalLab, priority });
        continue;
      }

      if (priority < current.priority) {
        selectedByFlow.set(flowCode, { estsegu, onlyExternalLab, priority });
        continue;
      }

      if (priority === current.priority && onlyExternalLab && !current.onlyExternalLab) {
        selectedByFlow.set(flowCode, { estsegu, onlyExternalLab, priority });
      }
    }

    return [...selectedByFlow.values()]
      .map((rule) => ({
        estsegu: rule.estsegu,
        onlyExternalLab: rule.onlyExternalLab,
      }))
      .sort((a, b) => a.estsegu - b.estsegu);
  }

  private resolveFlowVisibilityRoleCandidates(roleCodeRaw: string) {
    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (!roleCode) return [] as string[];
    return [roleCode];
  }

  private async hasFlowVisibilityTable() {
    if (this.flowVisibilityTableExists != null) {
      return this.flowVisibilityTableExists;
    }
    const rows = await this.dataSource.query(`
      SELECT TOP 1 1 AS ok
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'DAT_JAO_ORD_FLUJO_VIS'
    `);
    this.flowVisibilityTableExists = Array.isArray(rows) && rows.length > 0;
    return this.flowVisibilityTableExists;
  }

  private async hasFlowVisibilityPanelConfig(
    panelMode: 'operativo' | 'estado' | 'anulados' | 'entregadas',
  ) {
    const key = panelMode.toLowerCase();
    const cached = this.flowVisibilityPanelConfigCache.get(key);
    if (cached != null) return cached;

    const tableExists = await this.hasFlowVisibilityTable();
    if (!tableExists) {
      this.flowVisibilityPanelConfigCache.set(key, false);
      return false;
    }

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 1 AS ok
      FROM dbo.DAT_JAO_ORD_FLUJO_VIS
      WHERE UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) = 'DAT_JAO_ORD'
        AND UPPER(LTRIM(RTRIM(ISNULL(PANEL_MODE, '')))) = UPPER(@0)
        AND ISNULL(ACTIVO, 1) = 1
      `,
      [panelMode],
    );
    const hasConfig = Array.isArray(rows) && rows.length > 0;
    this.flowVisibilityPanelConfigCache.set(key, hasConfig);
    return hasConfig;
  }

  private async assertBatchExternalLaboratorioForAnalyst(
    iords: string[],
    scope: SucScope,
    roleCodeRaw: string,
  ) {
    if (!this.isAnalistaRoleForRecepcionExterna(roleCodeRaw)) return;
    const rows = await this.fetchBatchOrdOperationalContext(iords, scope, roleCodeRaw);
    const invalidFlow = rows
      .filter((row) => {
        const flow = this.toFloat(row.ESTSEGU);
        return flow == null || Math.abs(flow - 9) > 0.0001;
      })
      .map((row) => this.normalizeUpper(row.IORD ?? ''))
      .filter((item) => item.length > 0);
    if (invalidFlow.length) {
      throw new BadRequestException(
        `Las siguientes ORDs deben estar en estatus 9 (PENDIENTE RECIBIR EN ANALISTA): ${invalidFlow.join(', ')}`,
      );
    }
    const invalid = rows
      .filter((row) => !this.isLaboratorioExterno(row))
      .map((row) => this.normalizeUpper(row.IORD ?? ''))
      .filter((item) => item.length > 0);
    if (!invalid.length) return;
    throw new BadRequestException(
      `Las siguientes ORDs pertenecen a laboratorio interno y no pueden recibirse desde analista: ${invalid.join(', ')}`,
    );
  }

  private async fetchBatchOrdOperationalContext(
    iords: string[],
    scope: SucScope,
    roleCodeRaw: string,
  ) {
    if (!iords.length) return [];
    const placeholders = iords.map((_, idx) => `@${idx}`).join(',');
    const rows = await this.dataSource.query(
      `
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) AS IORD,
        UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) AS SUC,
        UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) AS TIPO,
        TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
        TRY_CONVERT(INT, o.LABOR) AS LABOR,
        LTRIM(RTRIM(ISNULL(lab.LAB, ''))) AS LAB_DESC,
        UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '')))) AS LAB_TIPOLAB,
        UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '')))) AS LAB_UBILAB,
        UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '')))) AS LAB_SUC,
        LTRIM(RTRIM(ISNULL(CAST(o.ASIGN AS NVARCHAR(100)), ''))) AS ASIGN
      FROM dbo.PV_CTR_ORDS o
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) IN (${placeholders})
        AND ${this.buildOrdAllowedSucSql('o', 'lab', `@${iords.length}`, `@${iords.length + 1}`, `@${iords.length + 2}`, `@${iords.length + 3}`, `@${iords.length + 4}`)}
        AND ${this.buildOrdRequestedSucSql('o', `@${iords.length + 4}`)}
      `,
      [
        ...iords,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        this.normalizeUpper(roleCodeRaw),
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );

    const records = (Array.isArray(rows) ? rows : []).map(
      (row) => row as Record<string, unknown>,
    );
    const visibleIords = new Set(
      records
        .map((row) => this.normalizeUpper(row.IORD ?? ''))
        .filter((value) => value.length > 0),
    );
    const missing = iords.filter(
      (iord) => !visibleIords.has(this.normalizeUpper(iord)),
    );
    if (missing.length) {
      throw new NotFoundException(
        `ORD no encontrada o sin acceso por sucursal: ${missing.join(', ')}`,
      );
    }
    return records;
  }

  private isAnalistaRoleForRecepcionExterna(roleCodeRaw: string) {
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return roleCode === 'ANALISTA_ORD';
  }

  private isLaboratorioExterno(row: Record<string, unknown>) {
    const ubiLab = this.normalizeUpper(row.LAB_UBILAB ?? '');
    const tipoLab = this.normalizeUpper(row.LAB_TIPOLAB ?? '');
    const lab = this.normalizeUpper(row.LAB_DESC ?? '');
    const labSuc = this.normalizeUpper(row.LAB_SUC ?? '');

    const looksExternal =
      ubiLab.includes('EXTER') ||
      tipoLab.includes('EXTER') ||
      lab.includes('EXTER');
    if (looksExternal) return true;

    if (ubiLab.includes('LOCAL')) return false;

    // Sin catalogo de sucursal en laboratorio: tratamos como externo por compat.
    if (!labSuc) return true;

    return false;
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

  private normalizeHourMinute(value: unknown) {
    const text = this.normalizeText(value);
    if (!text) return null;
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
    if (!match) {
      throw new BadRequestException('hrEnt debe tener formato HH:MM');
    }
    return `${match[1]}:${match[2]}`;
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
    if (value == null) return null;
    if (typeof value === 'string' && value.trim().length === 0) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  }

  private toFloat(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'string' && value.trim().length === 0) return null;
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
