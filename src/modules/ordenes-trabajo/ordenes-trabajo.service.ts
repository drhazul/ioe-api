import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ListOrdenesTrabajoQueryDto } from './dto/list-ordenes-trabajo-query.dto';
import { MermasAutorizadasQueryDto } from './dto/mermas-autorizadas-query.dto';
import {
  AplicarMermaCambioDto,
  ActualizarArticuloCambioMermaDto,
  CancelarCambioMermaDto,
  AssignLaboratorioBatchDto,
  AssignOrdBatchDto,
  CambioMaterialDto,
  CambioMermaContextDto,
  CrearCambioMermaDto,
  EntregarOrdBatchDto,
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

type CambioMermaEconomicBase = {
  unitPrice: number;
  baseTotal: number;
  source: string;
  warning: string | null;
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

type MermasAutorizadasFilterOptions = {
  tipos: Array<{ value: string; label: string }>;
  laboratorios: unknown[];
  asignados: Array<{ value: string; label: string }>;
};

@Injectable()
export class OrdenesTrabajoService {
  private readonly logger = new Logger(OrdenesTrabajoService.name);
  private static readonly MODULE_CODES = [
    'DAT_JAO_ORD',
    'DAT_JAO_MERMA_AUTORIZADAS',
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
  private readonly mermasFilterOptionsCache = new Map<
    string,
    { expiresAt: number; value: MermasAutorizadasFilterOptions }
  >();
  private readonly mermasFilterOptionsInFlight = new Map<
    string,
    Promise<MermasAutorizadasFilterOptions>
  >();

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

  private extractSucFromOrdCode(codeRaw: string) {
    const code = this.normalizeUpper(codeRaw).replace(/\s+/g, '');
    if (code.length < 4) return null;
    const prefix = code.slice(0, 4);
    return /^[A-Z]{2}\d{2}$/.test(prefix) ? prefix : null;
  }

  private resolveRequestedSucForCodeLookup(scope: SucScope, codeRaw: string) {
    const ordSuc = this.extractSucFromOrdCode(codeRaw);
    if (!ordSuc) return scope.requestedSuc;
    if (scope.isAdmin) return ordSuc;
    return scope.allowedSucs.includes(ordSuc) ? ordSuc : scope.requestedSuc;
  }

  async list(query: ListOrdenesTrabajoQueryDto, user: JwtPayload) {
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    const page = this.normalizePage(query.page);
    const panelMode = this.normalizePanelMode(query.panelMode);
    const isOrdenesVencerMode =
      query.ordenesVencerMode === true &&
      query.reportMode !== true &&
      panelMode === 'estado';
    // Órdenes a Vencer es una consulta transversal: no hereda los flujos
    // asignados a un rol específico en los paneles operativo o Estado.
    const isControlCalidadOrdenesPanelUser =
      (panelMode === 'estado' || panelMode === 'operativo') &&
      (await this.isControlCalidadRole(user));
    // Control de Calidad usa la visibilidad de flujos de ANALISTA_ORD en
    // Gestión de Orden, Consulta Estado y Reportes de Taller, en solo lectura.
    const panelRoleCode = isControlCalidadOrdenesPanelUser
      ? 'ANALISTA_ORD'
      : roleCode;
    const panelResponseRoleCode = this.isAdmin(user)
      ? 'ADMIN'
      : isControlCalidadOrdenesPanelUser
        ? 'CONTROL_CALIDAD'
        : roleCode;
    const dataPanelMode = query.reportMode ? 'estado' : panelMode;
    // El alcance por sucursal y los permisos de flujo son independientes una
    // vez resuelto el rol; consultarlos juntos reduce viajes secuenciales a SQL.
    const [scope, allowedStatusCodes] = await Promise.all([
      this.resolveSucScope(user, query.suc ?? null, roleCode),
      isOrdenesVencerMode
        ? this.resolveAllFlowStatusCodes()
        : this.resolveAllowedStatusCodes(user, panelRoleCode, dataPanelMode),
    ]);
    const showFlowHistoryDetails =
      query.reportMode !== true &&
      panelMode === 'estado' &&
      roleCode === 'JEF_TALLER';
    const sqlPanelMode = dataPanelMode;
    const exportAll = query.exportAll === true;
    // El filtro Otros de reportes requiere todas las coincidencias antes de paginar.
    const pageSize = exportAll
      ? 1000000
      : this.normalizePageSize(query.pageSize);
    const canUseOtros = query.reportMode === true && roleCode === 'JEF_TALLER';
    const canViewFlow10Report =
      query.reportMode === true &&
      ['JEF_TALLER', 'ANALISTA_ORD', 'ANALISTA'].includes(panelRoleCode);
    const allowedActions = isControlCalidadOrdenesPanelUser
      ? ['VER_DETALLE']
      : this.resolveAllowedActions(user, panelRoleCode, panelMode);
    if (
      query.reportMode === true &&
      panelRoleCode === 'ANALISTA_ORD' &&
      !allowedStatusCodes.some(
        (status) => this.formatStatusCode(status) === '4',
      )
    ) {
      allowedStatusCodes.push(4);
    }
    // Reportes usa el mismo catálogo de permisos de flujo que Consulta Estado
    // (dataPanelMode ya es 'estado'); reutilizarlo evita repetir varias
    // consultas de permisos en cada apertura del módulo.
    const flowCatalogStatusCodes = allowedStatusCodes;
    if (
      query.reportMode === true &&
      panelRoleCode === 'ANALISTA_ORD' &&
      !flowCatalogStatusCodes.some(
        (status) => this.formatStatusCode(status) === '4',
      )
    ) {
      flowCatalogStatusCodes.push(4);
    }
    const includeNullFlow =
      isOrdenesVencerMode ||
      this.shouldIncludeNullFlow(user, panelRoleCode, dataPanelMode);
    const needsIncidenciaOptions =
      query.reportMode !== true && panelMode !== 'estado';
    const [flowStatusOptions, laboratorios, incidenciaOptions, otrosOptions] =
      await Promise.all([
        this.resolveFlowStatusOptions(flowCatalogStatusCodes, includeNullFlow),
        this.resolveLaboratorios(scope),
        needsIncidenciaOptions
          ? this.resolveIncidenciaOptions()
          : Promise.resolve([]),
        canUseOtros
          ? this.dataSource.query(`
          SELECT CAST(TRY_CONVERT(INT, CMOV) AS NVARCHAR(30)) AS value,
                 LTRIM(RTRIM(TXTM)) AS label
          FROM dbo.DAT_CMOV
          WHERE TRY_CONVERT(INT, CMOV) = 455
        `)
          : Promise.resolve([]),
      ]);
    if (this.shouldDeferPanel(query, panelMode, scope.isAdmin)) {
      return {
        ok: true,
        page,
        pageSize,
        total: 0,
        roleCode: panelResponseRoleCode,
        panelMode,
        showFlowHistoryDetails,
        allowedSucs: scope.allowedSucs,
        allowedActions,
        flowStatusOptions,
        incidenciaOptions,
        laboratorios,
        otrosOptions,
        items: [],
      };
    }

    if (canUseOtros && query.otros) {
      return this.listMb51Movimiento455Report(query, {
        page,
        pageSize,
        roleCode,
        panelMode,
        scope,
        allowedActions,
        flowStatusOptions,
        incidenciaOptions,
        laboratorios,
        otrosOptions,
      });
    }

    const selectedReportFlow = this.toFloat(query.estsegu);
    const selectedReportNullFlow =
      this.normalizeUpper(query.estsegu) === 'NULL';
    const canViewSelectedHistoricalFlow =
      (canViewFlow10Report && selectedReportFlow === 10) ||
      (query.reportMode === true &&
        panelRoleCode === 'ANALISTA_ORD' &&
        (selectedReportFlow === 4 || selectedReportFlow === 7)) ||
      (query.reportMode === true &&
        roleCode === 'JEF_TALLER' &&
        (selectedReportFlow === 7 ||
          selectedReportFlow === 9.3 ||
          selectedReportNullFlow));
    if (
      canViewSelectedHistoricalFlow &&
      (selectedReportFlow != null || selectedReportNullFlow)
    ) {
      return this.listReportHistoricalFlow(query, user, selectedReportFlow, {
        page,
        pageSize,
        roleCode: panelRoleCode,
        responseRoleCode: panelResponseRoleCode,
        panelMode,
        scope,
        allowedActions,
        allowedStatusCodes,
        includeNullFlow,
        flowStatusOptions,
        incidenciaOptions,
        laboratorios,
        otrosOptions,
      });
    }

    const panelParams: unknown[] = [
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
      sqlPanelMode,
      isOrdenesVencerMode ? null : panelRoleCode,
      exportAll ? 1 : 0,
    ];
    const panelSql = `
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
        @ROLE_CODE=@21,
        @EXPORT=@22
    `;
    const rows = isOrdenesVencerMode
      ? await this.listOrdenesVencerRows(query, scope, page, pageSize)
      : await this.dataSource.query(panelSql, panelParams);

    let rawItems = Array.isArray(rows)
      ? rows.map((row) => {
          const out = { ...(row as Record<string, unknown>) };
          delete out.TOTAL_COUNT;
          delete out.total_count;
          return out;
        })
      : [];
    if (canUseOtros && query.otros && rawItems.length) {
      const iords = rawItems
        .map((item) => this.normalizeText(item.IORD))
        .filter((value): value is string => value != null);
      if (iords.length) {
        const placeholders = iords.map((_, index) => `@${index}`).join(',');
        const costRows = await this.dataSource.query(
          `
          SELECT IORD, TRY_CONVERT(FLOAT, CTORD) AS COSTO_SERVICIO
          FROM dbo.PV_CTR_ORDS
          WHERE IORD IN (${placeholders})
          `,
          iords,
        );
        const costs = new Map(
          (Array.isArray(costRows) ? costRows : []).map((row) => [
            this.normalizeText(row.IORD) ?? '',
            row.COSTO_SERVICIO,
          ]),
        );
        const mb51Conditions = iords
          .map((_, index) => `TXT LIKE @${index}`)
          .join(' OR ');
        const mb51Rows = await this.dataSource.query(
          `SELECT DOCP, ART, CTDA, CTOT, TXT
           FROM dbo.DAT_MB51
           WHERE CLSM = 455 AND (${mb51Conditions})`,
          iords.map((iord) => `%${iord}%`),
        );
        const articleCodes = [
          ...new Set(
            (Array.isArray(mb51Rows) ? mb51Rows : [])
              .map((row) => this.normalizeText(row.ART))
              .filter((value): value is string => value != null),
          ),
        ];
        const articlePlaceholders = articleCodes
          .map((_, index) => `@${index}`)
          .join(',');
        const articleCostRows = articleCodes.length
          ? await this.dataSource.query(
              `SELECT ART, TRY_CONVERT(FLOAT, CTOP) AS COSTO_ARTICULO
               FROM dbo.DAT_ART WHERE ART IN (${articlePlaceholders})`,
              articleCodes,
            )
          : [];
        const articleCosts = new Map(
          (Array.isArray(articleCostRows) ? articleCostRows : []).map((row) => [
            this.normalizeText(row.ART) ?? '',
            row.COSTO_ARTICULO,
          ]),
        );
        rawItems = rawItems.flatMap((item) => {
          const iord = this.normalizeText(item.IORD) ?? '';
          const movements = (Array.isArray(mb51Rows) ? mb51Rows : []).filter(
            (row) =>
              (this.normalizeText(row.TXT) ?? '')
                .toUpperCase()
                .includes(iord.toUpperCase()),
          );
          return movements.map((movement) => ({
            ...item,
            MB51_MOVIMIENTO: 455,
            MB51_DOCP: movement.DOCP,
            MB51_CTDA: movement.CTDA,
            MB51_CTOT: movement.CTOT,
            COSTO_ARTICULO:
              articleCosts.get(this.normalizeText(movement.ART) ?? '') ?? null,
            COSTO_SERVICIO: costs.get(iord) ?? null,
          }));
        });
      }
    }
    const selectedHistoricalFlow =
      dataPanelMode === 'estado' && !isOrdenesVencerMode
        ? (this.normalizeText(query.estsegu) ?? undefined)
        : undefined;
    const itemsByAllowedStatus = this.applyAllowedStatusFilterToItems(
      rawItems,
      allowedStatusCodes,
      includeNullFlow,
      selectedHistoricalFlow,
    );
    const visibilityRules = isOrdenesVencerMode
      ? []
      : await this.resolveFlowVisibilityRules(
          user,
          panelRoleCode,
          dataPanelMode,
        );
    const itemsAfterVisibility = await this.applyFlowVisibilityRulesToItems(
      itemsByAllowedStatus,
      visibilityRules,
      scope,
      panelRoleCode,
      selectedHistoricalFlow,
    );
    const asignLabels = await this.resolveOpvLabels(
      itemsAfterVisibility.map((item) => item.ASIGN),
    );
    const opvLabels = await this.resolveUsuarioLabels(
      itemsAfterVisibility.map((item) => item.OPV_ID ?? item.OPV),
    );
    const labeledItems = itemsAfterVisibility.map((item) => {
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
    const selectedFlow =
      dataPanelMode === 'estado' || isOrdenesVencerMode
        ? this.normalizeText(query.estsegu)
        : null;
    let items: Record<string, unknown>[];
    if (selectedFlow != null && isOrdenesVencerMode) {
      const selectedFlowValue =
        selectedFlow.toUpperCase() === 'NULL'
          ? null
          : this.toFloat(selectedFlow);
      const selectedFlowOption = flowStatusOptions.find((option) => {
        if (!option || typeof option !== 'object') return false;
        return (
          this.normalizeUpper((option as Record<string, unknown>).value) ===
          this.normalizeUpper(selectedFlow)
        );
      });
      const selectedFlowDescription =
        selectedFlow.toUpperCase() === 'NULL'
          ? 'SIN FLUJO'
          : selectedFlowOption && typeof selectedFlowOption === 'object'
            ? (this.normalizeText(
                (selectedFlowOption as Record<string, unknown>).label,
              ) ?? '')
            : '';
      items = labeledItems.map((item) => ({
        ...item,
        ESTSEGU_ACTUAL: item.ESTSEGU,
        ESTSEGU_ACTUAL_DESC: item.ESTSEGU_DESC,
        ESTSEGU: selectedFlowValue,
        ESTSEGU_DESC: selectedFlowDescription,
      }));
    } else {
      const enrichedItems =
        selectedFlow != null
          ? showFlowHistoryDetails
            ? await this.attachFlowHistorySafely(labeledItems)
            : await this.attachFlowHistory(labeledItems)
          : labeledItems;
      items =
        selectedFlow != null
          ? this.expandFlowHistoryItems(enrichedItems)
          : enrichedItems;
    }
    items.sort((a, b) => {
      const aTime = this.toTime(a.FCNS);
      const bTime = this.toTime(b.FCNS);
      if (aTime !== bTime) return bTime - aTime;
      const aIord = this.normalizeUpper(a.IORD ?? '');
      const bIord = this.normalizeUpper(b.IORD ?? '');
      return bIord.localeCompare(aIord);
    });
    if (showFlowHistoryDetails) {
      try {
        items = await this.attachFlowMovementActors(items);
      } catch (error) {
        this.logger.error(
          'No se pudo cargar quién realizó cada movimiento de Consulta Estado.',
          error instanceof Error ? error.stack : String(error),
        );
        items = items.map((item) => ({
          ...item,
          QUIEN_REALIZO: 'Sin registro',
        }));
      }
      // La columna de duración se oculta con el filtro "Todos". No consultar
      // el historial completo por ORD hasta que el usuario seleccione un flujo.
      if (this.normalizeText(query.estsegu) != null) {
        items = await this.attachFlowDurations(items);
      }
    }
    if (query.reportMode === true) {
      items = await this.attachChargedArticlePrices(items);
    }
    const first = this.firstRow(rows);
    const total =
      canUseOtros && query.otros
        ? items.length
        : (this.toInt(first?.TOTAL_COUNT ?? first?.total_count) ?? 0);

    return {
      ok: true,
      page,
      pageSize,
      total,
      roleCode: panelResponseRoleCode,
      panelMode,
      showFlowHistoryDetails,
      allowedSucs: scope.allowedSucs,
      allowedActions,
      flowStatusOptions,
      incidenciaOptions,
      laboratorios,
      otrosOptions,
      items,
    };
  }

  async listMermasAutorizadas(
    query: MermasAutorizadasQueryDto,
    user: JwtPayload,
    filterOptionsOnly = false,
    includeTotalCount = true,
    attachPrices = true,
  ) {
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    const allowedRoles = new Set([
      'JEF_TALLER',
      'INVJEF',
      'ANALISTA_INV',
      'ANALISTA_ORD',
      'ANALISTA',
      'AUX_JEF_TALLER',
      'AUX_JEFE_TALLER',
      'AUXILIAR_JEF_TALLER',
      'AUXILIAR_JEFE_TALLER',
      'ENC_MAQUILA',
      'ENC_BISEL',
    ]);
    const isControlCalidad = await this.isControlCalidadRole(user);
    if (
      !this.isAdmin(user) &&
      !allowedRoles.has(roleCode) &&
      !isControlCalidad
    ) {
      throw new ForbiddenException(
        'No tienes permiso para consultar mermas autorizadas de Taller.',
      );
    }

    const suc = this.normalizeText(query.suc) || null;
    const scope = await this.resolveSucScope(user, suc, roleCode);
    const page = Math.max(1, this.normalizePage(query.page));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
    const [
      hasAuditTable,
      hasMotivoTable,
      hasTipomColumn,
      hasComadColumn,
      hasCtdCambioColumn,
      hasMotrColumn,
      hasUsrAutColumn,
      hasFcnAutColumn,
    ] = await Promise.all([
      this.hasTable('AUDIT_LOG'),
      this.hasTable('DAT_ORD_MOTM'),
      this.hasColumn('PV_CTR_ORDS', 'TIPOM'),
      this.hasColumn('PV_CTR_ORDS', 'COMAD'),
      this.hasColumn('PV_CTR_ORDS', 'CTD_C_M'),
      this.hasColumn('PV_CTR_ORDS', 'MOTR'),
      this.hasColumn('PV_CTR_ORDS', 'USR_AUT_CYM'),
      this.hasColumn('PV_CTR_ORDS', 'FCN_AUT_CYM'),
    ]);
    const ctdCambioSql = hasCtdCambioColumn
      ? 'TRY_CONVERT(FLOAT, o.CTD_C_M)'
      : 'CAST(NULL AS FLOAT)';
    const motivoSql = hasMotrColumn
      ? 'TRY_CONVERT(INT, o.MOTR)'
      : 'CAST(NULL AS INT)';
    const tipoMSql = hasTipomColumn
      ? 'TRY_CONVERT(INT, o.TIPOM)'
      : 'CAST(NULL AS INT)';
    const comadSql = hasComadColumn
      ? 'o.COMAD'
      : 'CAST(NULL AS NVARCHAR(2000))';
    const usrAutSql = hasUsrAutColumn
      ? 'o.USR_AUT_CYM'
      : 'CAST(NULL AS NVARCHAR(255))';
    const fcnAutSql = hasFcnAutColumn
      ? 'o.FCN_AUT_CYM'
      : 'CAST(NULL AS DATETIME)';
    const authorizationDateSql = `COALESCE(${fcnAutSql}, o.FCNMOD)`;
    // La consulta anterior expandía todos los arreglos iords del historial y
    // hacía DISTINCT antes de unirlos a cada ORD. EXISTS evita materializar esa
    // lista global y solo revisa los eventos de anulación necesarios.
    const directCancellationExistsSql = hasAuditTable
      ? `EXISTS (
          SELECT 1
          FROM dbo.AUDIT_LOG anulacion
          CROSS APPLY OPENJSON(
            CASE
              WHEN ISJSON(anulacion.METADATA_JSON) = 1
                THEN anulacion.METADATA_JSON
              ELSE N'{}'
            END,
            '$.iords'
          ) anulacionIord
          WHERE anulacion.ACTION = 'ORD_ANULAR_LOTE'
            AND UPPER(LTRIM(RTRIM(ISNULL(anulacion.MODULO, '')))) = 'ORDENES-TRABAJO'
            AND UPPER(LTRIM(RTRIM(ISNULL(anulacion.ENTIDAD, '')))) = 'PV_CTR_ORDS'
            AND UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), anulacionIord.[value])))) =
                UPPER(LTRIM(RTRIM(ISNULL(o.IORD, ''))))
        )`
      : '1 = 0';
    const approvedByInventoryChiefSql = `EXISTS (
      SELECT 1
      FROM dbo.USUARIO usuarioAutoriza
      INNER JOIN dbo.ROL rolAutoriza ON rolAutoriza.IDROL = usuarioAutoriza.IDROL
      WHERE UPPER(LTRIM(RTRIM(ISNULL(usuarioAutoriza.USERNAME, '')))) =
            UPPER(LTRIM(RTRIM(ISNULL(${usrAutSql}, ''))))
        AND UPPER(LTRIM(RTRIM(ISNULL(rolAutoriza.CODIGO, '')))) = 'INVJEF'
    )`;
    const motivoMermaJoinSql = hasMotivoTable
      ? `LEFT JOIN dbo.DAT_ORD_MOTM motivoMerma
        ON TRY_CONVERT(INT, motivoMerma.IDM) = ${motivoSql}
       AND TRY_CONVERT(INT, motivoMerma.TIPO) = 2`
      : `LEFT JOIN (SELECT CAST(NULL AS INT) AS IDM, CAST(NULL AS NVARCHAR(255)) AS MOTM, CAST(NULL AS INT) AS TIPO) motivoMerma ON 1 = 0`;
    const motivoCambioJoinSql = hasMotivoTable
      ? `LEFT JOIN dbo.DAT_ORD_MOTM motivoCambio
        ON TRY_CONVERT(INT, motivoCambio.IDM) = TRY_CONVERT(INT, o.MOTR)
       AND TRY_CONVERT(INT, motivoCambio.TIPO) = 1`
      : `LEFT JOIN (SELECT CAST(NULL AS INT) AS IDM, CAST(NULL AS NVARCHAR(255)) AS MOTM, CAST(NULL AS INT) AS TIPO) motivoCambio ON 1 = 0`;
    const directCancellationPredicateSql = `(
      TRY_CONVERT(INT, o.ESTATUS) = 2
      AND TRY_CONVERT(FLOAT, o.ESTSEGU) = 4
      AND NULLIF(LTRIM(RTRIM(ISNULL(o.IORD, ''))), '') IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(ISNULL(o.REEORD, ''))), '') IS NULL
      AND NULLIF(LTRIM(RTRIM(ISNULL(${usrAutSql}, ''))), '') IS NULL
      AND ISNULL(${tipoMSql}, 0) NOT IN (1, 2)
      AND ${directCancellationExistsSql}
    )`;
    const params: unknown[] = [];
    const where = [
      `(
        (
          ${tipoMSql} IN (1, 2)
          AND TRY_CONVERT(FLOAT, o.ESTSEGU) = 4
          AND NULLIF(LTRIM(RTRIM(ISNULL(${usrAutSql}, ''))), '') IS NOT NULL
          AND ${fcnAutSql} IS NOT NULL
          AND ${approvedByInventoryChiefSql}
        )
        OR (
          ${directCancellationPredicateSql}
        )
      )`,
    ];

    if (!scope.isAdmin) {
      const sucParams = scope.allowedSucs.map(
        (_, index) => `@${params.length + index}`,
      );
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (${sucParams.join(', ')})`,
      );
      params.push(...scope.allowedSucs.map((value) => value.toUpperCase()));
    }
    if (suc) {
      where.push(`UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = @${params.length}`);
      params.push(suc.toUpperCase());
    }
    const authorizationWhere = [...where];
    const authorizationParams = [...params];
    if (query.fecIni) {
      where.push(
        `CONVERT(DATE, ${authorizationDateSql}) >= @${params.length}`,
      );
      params.push(query.fecIni);
    }
    if (query.fecFin) {
      where.push(
        `CONVERT(DATE, ${authorizationDateSql}) <= @${params.length}`,
      );
      params.push(query.fecFin);
    }
    const iord = this.normalizeText(query.iord);
    if (iord) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(o.REEORD, '')))) LIKE @${params.length})`,
      );
      params.push(`%${iord.toUpperCase()}%`);
    }
    const idfol = this.normalizeText(query.idfol);
    if (idfol) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) LIKE @${params.length}`,
      );
      params.push(`%${idfol.toUpperCase()}%`);
    }
    const client = this.normalizeText(query.client);
    if (client) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(o.CLIEN, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(o.NCLIENTE, '')))) LIKE @${params.length})`,
      );
      params.push(`%${client.toUpperCase()}%`);
    }
    const tipo = this.normalizeText(query.tipo);
    if (tipo) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) = @${params.length}`,
      );
      params.push(tipo.toUpperCase());
    }
    const labor = this.normalizeText(query.labor);
    if (labor) {
      where.push(`TRY_CONVERT(INT, o.LABOR) = TRY_CONVERT(INT, @${params.length})`);
      params.push(labor);
    }
    const asign = this.normalizeText(query.asign);
    if (asign) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(o.ASIGN, '')))) = @${params.length}`,
      );
      params.push(asign.toUpperCase());
    }
    const iordAutorizacion = this.normalizeText(query.iordAutorizacion);
    if (iordAutorizacion) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(o.REEORD, '')))) LIKE @${params.length}`,
      );
      params.push(`%${iordAutorizacion.toUpperCase()}%`);
    }
    const iordOriginal = this.normalizeText(query.iordOriginal);
    if (iordOriginal) {
      where.push(
        `UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) LIKE @${params.length}`,
      );
      params.push(`%${iordOriginal.toUpperCase()}%`);
    }

    if (filterOptionsOnly) {
      return {
        ok: true,
        filterOptions: await this.resolveCachedMermasAutorizadasFilterOptions(
          roleCode,
          scope,
          authorizationWhere,
          authorizationParams,
        ),
      };
    }

    const whereSql = where.join(' AND ');
    let rows = await this.dataSource.query(
      `
      WITH PageOrd AS (
        SELECT
          o.SUC,
          o.IDFOL,
          o.IORD,
          o.REEORD,
          o.OPV,
          o.ART,
          o.DESCART,
          o.CTD,
          ${ctdCambioSql} AS CTD_C_M,
          o.CLIEN,
          o.NCLIENTE,
          o.LABOR,
          o.ASIGN,
          o.TIPO,
          o.ESTSEGU,
          ${motivoSql} AS MOTR,
          ${tipoMSql} AS TIPOM,
          ${comadSql} AS COMAD,
          ${usrAutSql} AS USR_AUT_CYM,
          ${authorizationDateSql} AS AUTHORIZATION_DATE,
          CASE WHEN ${directCancellationPredicateSql} THEN 1 ELSE 0 END AS DIRECT_CANCELLED,
          ${includeTotalCount ? 'COUNT_BIG(1) OVER ()' : 'CAST(NULL AS BIGINT)'} AS TOTAL_COUNT
        FROM dbo.PV_CTR_ORDS o
        WHERE ${whereSql}
        ORDER BY ${authorizationDateSql} DESC, o.IORD DESC
        OFFSET @${params.length} ROWS FETCH NEXT @${params.length + 1} ROWS ONLY
      )
      SELECT
        LTRIM(RTRIM(ISNULL(o.SUC, ''))) AS SUC,
        LTRIM(RTRIM(ISNULL(o.IDFOL, ''))) AS IDFOL,
        LTRIM(RTRIM(ISNULL(o.IORD, ''))) AS IORD,
        LTRIM(RTRIM(ISNULL(o.REEORD, ''))) AS IORD_NUEVA,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONCAT(
            ISNULL(opv.NOMB, ''),
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(opv.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(opv.APELP)) END,
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(opv.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(opv.APELM)) END
          ))), ''),
          NULLIF(LTRIM(RTRIM(ISNULL(uopv.NOMBRE, ''))), ''),
          LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), '')))
        ) AS OPV,
        LTRIM(RTRIM(ISNULL(o.ART, ''))) AS ART,
        LTRIM(RTRIM(ISNULL(o.DESCART, ''))) AS DESCART,
        TRY_CONVERT(FLOAT, o.CTD) AS CTD,
        COALESCE(${ctdCambioSql}, TRY_CONVERT(FLOAT, o.CTD)) AS CTD_C_M,
        LTRIM(RTRIM(ISNULL(o.CLIEN, ''))) AS CLIEN,
        LTRIM(RTRIM(ISNULL(o.NCLIENTE, ''))) AS NCLIENTE,
        TRY_CONVERT(FLOAT, precio.PVTA) AS COSTO_SERVICIO,
        TRY_CONVERT(FLOAT, precio.CTOP) AS COSTO_ARTICULO,
        LTRIM(RTRIM(ISNULL(l.LAB, ''))) AS LABORATORIO_DESC,
        COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(
          ISNULL(asignado.NOMB, ''),
          CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(asignado.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(asignado.APELP)) END,
          CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(asignado.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(asignado.APELM)) END
        ))), ''), LTRIM(RTRIM(ISNULL(o.ASIGN, '')))) AS RESPONSABLE_MERMA,
        LTRIM(RTRIM(ISNULL(o.TIPO, ''))) AS TIPO,
        TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
        LTRIM(RTRIM(ISNULL(o.ASIGN, ''))) AS ASIGN,
        o.LABOR AS LABOR,
        o.MOTR AS MOTR,
        LTRIM(RTRIM(ISNULL(motivoMerma.MOTM, ''))) AS MOTIVO_MERMA,
        CASE WHEN TRY_CONVERT(INT, o.TIPOM) = 1
          THEN COALESCE(
            NULLIF(LTRIM(RTRIM(ISNULL(motivoCambio.MOTM, ''))), ''),
            LTRIM(RTRIM(ISNULL(CAST(o.COMAD AS NVARCHAR(MAX)), '')))
          )
          ELSE ''
        END AS MOTIVO_CAMBIO_MATERIAL,
        CASE
          WHEN TRY_CONVERT(INT, o.TIPOM) = 1 THEN 'CAMBIO DE MATERIAL AUTORIZADO'
          WHEN TRY_CONVERT(INT, o.TIPOM) = 2 THEN 'MERMA AUTORIZADA'
          WHEN o.DIRECT_CANCELLED = 1 THEN 'ANULADA EN DAT_JAO_ORD'
          ELSE ''
        END AS MOVIMIENTO,
        CASE WHEN TRY_CONVERT(FLOAT, o.ESTSEGU) = 4
          THEN '4 ANULADA'
          ELSE ''
        END AS FLUJO,
        LTRIM(RTRIM(ISNULL(${usrAutSql}, ''))) AS USR_AUT_CYM,
        o.AUTHORIZATION_DATE AS FCN_AUT_CYM,
        LTRIM(RTRIM(ISNULL(n.ART, ''))) AS ART_NUEVA,
        LTRIM(RTRIM(ISNULL(n.DESCART, ''))) AS DESCART_NUEVA,
        TRY_CONVERT(FLOAT, n.CTD) AS CTD_NUEVA
      FROM PageOrd o
      LEFT JOIN dbo.PV_CTR_ORDS n
        ON LTRIM(RTRIM(ISNULL(n.IORD, ''))) = LTRIM(RTRIM(ISNULL(o.REEORD, '')))
      LEFT JOIN dbo.DAT_LAB l
        ON TRY_CONVERT(INT, l.ID) = TRY_CONVERT(INT, o.LABOR)
      LEFT JOIN dbo.PV_OPV asignado
        ON UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), asignado.IDOPV)))) =
           UPPER(LTRIM(RTRIM(ISNULL(o.ASIGN, ''))))
      LEFT JOIN dbo.USUARIO uopv
        ON TRY_CONVERT(INT, uopv.IDUSUARIO) = TRY_CONVERT(INT, o.OPV)
      LEFT JOIN dbo.PV_OPV opv
        ON LTRIM(RTRIM(ISNULL(CAST(opv.IDOPV AS NVARCHAR(100)), ''))) =
           LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), '')))
      ${motivoCambioJoinSql}
      OUTER APPLY (
        SELECT TOP 1 art.PVTA, art.CTOP
        FROM dbo.DAT_ART art
        WHERE UPPER(LTRIM(RTRIM(ISNULL(art.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.ART, ''))))
          AND UPPER(LTRIM(RTRIM(ISNULL(art.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.SUC, ''))))
        ORDER BY TRY_CONVERT(INT, ISNULL(art.BLOQ, 0)) ASC
      ) precio
      ${motivoMermaJoinSql}
      ORDER BY o.AUTHORIZATION_DATE DESC, o.IORD DESC
      `,
      [...params, (page - 1) * pageSize, pageSize],
    );

    let total = 0;
    if (Array.isArray(rows) && rows.length) {
      total = Number(rows[0]?.TOTAL_COUNT ?? rows[0]?.total_count ?? 0);
      rows = rows.map((row: Record<string, unknown>) => {
        delete row.TOTAL_COUNT;
        delete row.total_count;
        return row;
      });
    } else if (includeTotalCount && page > 1) {
      // Si solicitan una página fuera del rango, conserva el total exacto aunque
      // COUNT_BIG OVER() no pueda devolverlo en una página vacía.
      const countRows = await this.dataSource.query(
        `SELECT COUNT_BIG(1) AS total
         FROM dbo.PV_CTR_ORDS o
         WHERE ${whereSql}`,
        params,
      );
      total = Number(countRows?.[0]?.total ?? countRows?.[0]?.TOTAL ?? 0);
    }

    const rawItems = (rows ?? []) as Record<string, unknown>[];
    const items = attachPrices
      ? await this.attachChargedArticlePrices(rawItems)
      : rawItems;
    return { items, total, page, pageSize };
  }

  private async resolveCachedMermasAutorizadasFilterOptions(
    roleCode: string,
    scope: SucScope,
    where: string[],
    params: unknown[],
  ): Promise<MermasAutorizadasFilterOptions> {
    const key = JSON.stringify({
      roleCode,
      isAdmin: scope.isAdmin,
      allowedSucs: [...scope.allowedSucs].sort(),
      requestedSuc: scope.requestedSuc,
    });
    const now = Date.now();
    const cached = this.mermasFilterOptionsCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    if (cached) this.mermasFilterOptionsCache.delete(key);

    const pending = this.mermasFilterOptionsInFlight.get(key);
    if (pending) return pending;

    const request = this.queryMermasAutorizadasFilterOptions(
      scope,
      where,
      params,
    )
      .then((value) => {
        this.mermasFilterOptionsCache.set(key, {
          expiresAt: Date.now() + 60_000,
          value,
        });
        return value;
      })
      .finally(() => this.mermasFilterOptionsInFlight.delete(key));
    this.mermasFilterOptionsInFlight.set(key, request);
    return request;
  }

  private async queryMermasAutorizadasFilterOptions(
    scope: SucScope,
    where: string[],
    params: unknown[],
  ): Promise<MermasAutorizadasFilterOptions> {
    const [rows, laboratorios] = await Promise.all([
      this.dataSource.query(
        `SET NOCOUNT ON;
         IF OBJECT_ID('tempdb..#MermasAutorizadasFilterOptions') IS NOT NULL
           DROP TABLE #MermasAutorizadasFilterOptions;
         SELECT DISTINCT
           LTRIM(RTRIM(ISNULL(o.TIPO, ''))) AS TIPO,
           LTRIM(RTRIM(ISNULL(o.ASIGN, ''))) AS ASIGN
         INTO #MermasAutorizadasFilterOptions
         FROM dbo.PV_CTR_ORDS o
         WHERE ${where.join(' AND ')}
         ;
         SELECT OPTION_TYPE, VALUE, LABEL
         FROM (
           SELECT
             CAST('TIPO' AS NVARCHAR(10)) AS OPTION_TYPE,
             tipos.TIPO AS VALUE,
             tipos.TIPO AS LABEL
           FROM (
             SELECT DISTINCT TIPO
             FROM #MermasAutorizadasFilterOptions
             WHERE NULLIF(TIPO, '') IS NOT NULL
           ) tipos
           UNION ALL
           SELECT
             CAST('ASIGN' AS NVARCHAR(10)) AS OPTION_TYPE,
             asignados.ASIGN AS VALUE,
             COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(
               ISNULL(p.NOMB, ''),
               CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(p.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(p.APELP)) END,
               CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(p.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(p.APELM)) END
             ))), ''), asignados.ASIGN) AS LABEL
           FROM (
             SELECT DISTINCT ASIGN
             FROM #MermasAutorizadasFilterOptions
             WHERE NULLIF(ASIGN, '') IS NOT NULL
           ) asignados
           LEFT JOIN dbo.PV_OPV p
             ON UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), p.IDOPV)))) =
                UPPER(asignados.ASIGN)
         ) opciones
         ORDER BY OPTION_TYPE, VALUE;
         DROP TABLE #MermasAutorizadasFilterOptions;`,
        params,
      ),
      this.resolveLaboratorios(scope),
    ]);
    const optionRows = Array.isArray(rows)
      ? (rows as Record<string, unknown>[])
      : [];
    const uniqueOptions = (optionType: string) => {
      const seen = new Set<string>();
      return optionRows.flatMap((row) => {
        if (
          this.normalizeUpper(row.OPTION_TYPE) !== optionType
        ) {
          return [];
        }
        const value = this.normalizeText(row.VALUE);
        if (!value || seen.has(value.toUpperCase())) return [];
        seen.add(value.toUpperCase());
        return [{ value, label: this.normalizeText(row.LABEL) ?? value }];
      });
    };
    return {
      tipos: uniqueOptions('TIPO'),
      laboratorios,
      asignados: uniqueOptions('ASIGN'),
    };
  }

  async exportMermasAutorizadasExcel(
    query: MermasAutorizadasQueryDto,
    user: JwtPayload,
  ): Promise<Buffer> {
    const pageSize = 100;
    const first = await this.listMermasAutorizadas(
      { ...query, page: 1, pageSize },
      user,
      false,
      true,
      false,
    );
    const rows = [...(first.items ?? [])];
    const pageCount = Math.ceil(Number(first.total ?? 0) / pageSize);
    for (let page = 2; page <= pageCount; page += 1) {
      const result = await this.listMermasAutorizadas(
        { ...query, page, pageSize },
        user,
        false,
        false,
        false,
      );
      rows.push(...(result.items ?? []));
    }

    const pricedRows = await this.attachChargedArticlePrices(rows);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Mermas autorizadas');
    sheet.columns = [
      { header: 'SUC', key: 'SUC', width: 14 },
      { header: 'Tipo', key: 'TIPO', width: 18 },
      { header: 'Movimiento', key: 'MOVIMIENTO', width: 34 },
      { header: 'OPV', key: 'OPV', width: 30 },
      { header: 'Laboratorio', key: 'LABORATORIO_DESC', width: 28 },
      { header: 'IORD', key: 'IORD', width: 22 },
      { header: 'Cliente', key: 'CLIENTE', width: 32 },
      { header: 'Artículo', key: 'ART', width: 20 },
      { header: 'Descripción', key: 'DESCART', width: 36 },
      { header: 'CTD', key: 'CTD_C_M', width: 12 },
      { header: 'Flujo', key: 'FLUJO', width: 18 },
      { header: 'Asignado', key: 'RESPONSABLE_MERMA', width: 32 },
      { header: 'Motivo de Merma', key: 'MOTIVO_MERMA', width: 44 },
      { header: 'Motivo Cambio de Material', key: 'MOTIVO_CAMBIO_MATERIAL', width: 44 },
      { header: 'IORD autorización', key: 'IORD_NUEVA', width: 22 },
      { header: 'Folio', key: 'IDFOL', width: 28 },
      { header: 'Artículo nuevo', key: 'ART_NUEVA', width: 20 },
      { header: 'Descripción nueva', key: 'DESCART_NUEVA', width: 36 },
      { header: 'F. autorización', key: 'FCN_AUT_CYM', width: 22 },
      { header: 'Precio cobrado', key: 'PRECIO_COBRADO', width: 18 },
      { header: 'Costo del artículo', key: 'COSTO_ARTICULO', width: 20 },
      { header: 'Costo del servicio', key: 'COSTO_SERVICIO', width: 20 },
      { header: 'Autorizó', key: 'USR_AUT_CYM', width: 22 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF071428' },
    };
    for (const row of pricedRows) {
      sheet.addRow({
        ...row,
        CLIENTE: `${this.normalizeText(row.CLIEN) ?? ''} ${this.normalizeText(row.NCLIENTE) ?? ''}`.trim(),
        FCN_AUT_CYM:
          row.FCN_AUT_CYM instanceof Date
            ? row.FCN_AUT_CYM
            : this.normalizeText(row.FCN_AUT_CYM),
      });
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'W1' };
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async listOrdenesVencerRows(
    query: ListOrdenesTrabajoQueryDto,
    scope: SucScope,
    page: number,
    pageSize: number,
  ): Promise<Record<string, unknown>[]> {
    const params: unknown[] = [
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
      (page - 1) * pageSize,
      pageSize,
      scope.isAdmin ? 1 : 0,
      scope.allowedSucsCsv,
      this.normalizeText(query.vencimiento),
    ];

    const rows = await this.dataSource.query(
      `
      SELECT
        o.IORD,
        o.IDFOL,
        o.TIPO,
        LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), ''))) AS OPV_ID,
        COALESCE(
          NULLIF(LTRIM(RTRIM(ISNULL(uopv.NOMBRE, ''))), ''),
          NULLIF(LTRIM(RTRIM(CONCAT(
            ISNULL(opv.NOMB, ''),
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(opv.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(opv.APELP)) END,
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(opv.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(opv.APELM)) END
          ))), ''),
          LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), '')))
        ) AS OPV,
        o.FCNS,
        o.FCNM,
        o.CLIEN,
        o.NCLIENTE,
        o.MAT,
        o.CTD,
        o.ART,
        o.DESCART,
        o.COMAD,
        o.ESTATUS,
        o.ESTSEGU,
        CASE
          WHEN TRY_CONVERT(FLOAT, o.ESTSEGU) IN (4, 11) THEN NULL
          WHEN TRY_CONVERT(DATETIME2, o.FCNM) IS NULL THEN NULL
          WHEN TRY_CONVERT(DATETIME2, o.FCNM) < GETDATE() THEN 'retrasadas'
          WHEN TRY_CONVERT(DATETIME2, o.FCNM) <= DATEADD(MINUTE, 30, GETDATE()) THEN 'por_vencer'
          ELSE NULL
        END AS VENCIMIENTO_COLOR,
        CASE
          WHEN TRY_CONVERT(FLOAT, o.ESTSEGU) IN (4, 11) THEN NULL
          WHEN TRY_CONVERT(DATETIME2, o.FCNM) IS NULL THEN NULL
          WHEN TRY_CONVERT(DATETIME2, o.FCNM) < GETDATE()
            THEN DATEDIFF(MINUTE, TRY_CONVERT(DATETIME2, o.FCNM), GETDATE())
          ELSE NULL
        END AS VENCIDO_MINUTOS,
        o.ASIGN,
        o.LABOR,
        o.MOTR,
        CAST(NULL AS INT) AS TIPOM,
        CAST(NULL AS NVARCHAR(255)) AS REEORD,
        CAST(NULL AS NVARCHAR(255)) AS DOCDIF,
        o.SUC,
        e.TIPO AS ESTSEGU_DESC,
        COUNT_BIG(1) OVER () AS TOTAL_COUNT
      FROM dbo.PV_CTR_ORDS o
      LEFT JOIN dbo.DAT_EST_ORD e
        ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, o.ESTSEGU)
      LEFT JOIN dbo.USUARIO uopv
        ON TRY_CONVERT(INT, uopv.IDUSUARIO) = TRY_CONVERT(INT, o.OPV)
      LEFT JOIN dbo.PV_OPV opv
        ON LTRIM(RTRIM(ISNULL(CAST(opv.IDOPV AS NVARCHAR(100)), ''))) =
           LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), '')))
      WHERE
        (@0 IS NULL OR LTRIM(RTRIM(ISNULL(o.IORD, ''))) LIKE '%' + @0 + '%')
        AND (@1 IS NULL OR LTRIM(RTRIM(ISNULL(o.IDFOL, ''))) LIKE '%' + @1 + '%')
        AND (
          @2 IS NULL
          OR (
            CASE
              WHEN TRY_CONVERT(DECIMAL(38, 0), o.CLIEN) IS NOT NULL
                THEN CONVERT(NVARCHAR(255), CONVERT(DECIMAL(38, 0), o.CLIEN))
              ELSE LTRIM(RTRIM(CONVERT(NVARCHAR(255), ISNULL(o.CLIEN, ''))))
            END
          ) LIKE '%' + @2 + '%'
          OR UPPER(LTRIM(RTRIM(ISNULL(o.NCLIENTE, '')))) LIKE '%' + UPPER(@2) + '%'
        )
        AND (@3 IS NULL OR LTRIM(RTRIM(ISNULL(o.ART, ''))) LIKE '%' + @3 + '%')
        AND (@4 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) LIKE '%' + UPPER(@4) + '%')
        AND (@5 IS NULL OR CAST(ISNULL(o.LABOR, '') AS NVARCHAR(255)) = @5)
        AND (@6 IS NULL OR CAST(ISNULL(o.ESTATUS, '') AS NVARCHAR(255)) = @6)
        AND (
          @7 IS NULL
          OR (UPPER(LTRIM(RTRIM(ISNULL(@7, '')))) = 'NULL' AND TRY_CONVERT(FLOAT, o.ESTSEGU) IS NULL)
          OR CAST(ISNULL(o.ESTSEGU, '') AS NVARCHAR(255)) = @7
        )
        AND (@10 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.ASIGN, '')))) LIKE '%' + UPPER(@10) + '%')
        AND (
          @11 IS NULL
          OR EXISTS (
            SELECT 1
            FROM OPENJSON((SELECT o.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) j
            WHERE j.[key] IN ('TIPOM', 'TPOM')
              AND TRY_CONVERT(INT, j.[value]) = TRY_CONVERT(INT, @11)
          )
        )
        AND (@12 IS NULL OR CAST(ISNULL(o.MOTR, '') AS NVARCHAR(255)) = @12)
        AND (@13 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@13))
        AND (@8 IS NULL OR TRY_CONVERT(DATE, o.FCNS) >= TRY_CONVERT(DATE, @8))
        AND (@9 IS NULL OR TRY_CONVERT(DATE, o.FCNS) <= TRY_CONVERT(DATE, @9))
        AND (
          @14 IS NULL
          OR UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) LIKE '%' + UPPER(@14) + '%'
          OR UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) LIKE '%' + UPPER(@14) + '%'
          OR UPPER(LTRIM(RTRIM(ISNULL(o.ART, '')))) LIKE '%' + UPPER(@14) + '%'
          OR UPPER(LTRIM(RTRIM(ISNULL(o.DESCART, '')))) LIKE '%' + UPPER(@14) + '%'
          OR (
            CASE
              WHEN TRY_CONVERT(DECIMAL(38, 0), o.CLIEN) IS NOT NULL
                THEN CONVERT(NVARCHAR(255), CONVERT(DECIMAL(38, 0), o.CLIEN))
              ELSE LTRIM(RTRIM(CONVERT(NVARCHAR(255), ISNULL(o.CLIEN, ''))))
            END
          ) LIKE '%' + @14 + '%'
          OR UPPER(LTRIM(RTRIM(ISNULL(o.NCLIENTE, '')))) LIKE '%' + UPPER(@14) + '%'
        )
        AND (
          @17 = 1
          OR @18 IS NULL
          OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (
            SELECT UPPER(LTRIM(RTRIM(value)))
            FROM STRING_SPLIT(ISNULL(@18, ''), ',')
            WHERE LTRIM(RTRIM(ISNULL(value, ''))) <> ''
          )
        )
        AND (
          @19 IS NULL
          OR (
            @19 = 'por_vencer'
            AND ISNULL(TRY_CONVERT(FLOAT, o.ESTSEGU), -1) NOT IN (4, 11)
            AND TRY_CONVERT(DATETIME2, o.FCNM) > GETDATE()
            AND TRY_CONVERT(DATETIME2, o.FCNM) <= DATEADD(MINUTE, 30, GETDATE())
          )
          OR (
            @19 = 'retrasadas'
            AND ISNULL(TRY_CONVERT(FLOAT, o.ESTSEGU), -1) NOT IN (4, 11)
            AND TRY_CONVERT(DATETIME2, o.FCNM) < GETDATE()
          )
        )
        AND TRY_CONVERT(INT, o.ESTATUS) = 2
      ORDER BY ISNULL(o.FCNS, ISNULL(o.FCNMOD, o.FCNM)) DESC, o.IORD DESC
      OFFSET @15 ROWS FETCH NEXT @16 ROWS ONLY
      `,
      params,
    );
    return Array.isArray(rows) ? rows : [];
  }

  private async listReportHistoricalFlow(
    query: ListOrdenesTrabajoQueryDto,
    user: JwtPayload,
    flowCode: number | null,
    context: {
      page: number;
      pageSize: number;
      roleCode: string;
      responseRoleCode: string;
      panelMode: string;
      scope: SucScope;
      allowedActions: string[];
      allowedStatusCodes: number[];
      includeNullFlow: boolean;
      flowStatusOptions: unknown[];
      incidenciaOptions: unknown[];
      laboratorios: unknown[];
      otrosOptions: unknown[];
    },
  ) {
    const selectedFlowCode =
      flowCode == null ? 'NULL' : this.formatStatusCode(flowCode);
    const hasSelectedFlow =
      flowCode == null
        ? context.includeNullFlow
        : context.allowedStatusCodes.some(
            (status) => this.formatStatusCode(status) === selectedFlowCode,
          );
    const flowHistoryPredicate =
      flowCode == null ? 'h.ESTSEGU IS NULL' : `h.ESTSEGU = ${flowCode}`;
    const flowCatalogPredicate =
      flowCode == null ? '1 = 0' : `TRY_CONVERT(FLOAT, e.ESTA) = ${flowCode}`;
    if (!hasSelectedFlow) {
      return {
        ok: true,
        page: context.page,
        pageSize: context.pageSize,
        total: 0,
        roleCode: context.responseRoleCode,
        panelMode: context.panelMode,
        allowedSucs: context.scope.allowedSucs,
        allowedActions: context.allowedActions,
        flowStatusOptions: context.flowStatusOptions,
        incidenciaOptions: context.incidenciaOptions,
        laboratorios: context.laboratorios,
        otrosOptions: context.otrosOptions,
        items: [],
      };
    }

    const visibilityRules = await this.resolveFlowVisibilityRules(
      user,
      context.roleCode,
      'estado',
    );
    const selectedFlowVisibility = visibilityRules.find(
      (rule) => this.formatStatusCode(rule.estsegu) === selectedFlowCode,
    );
    const externalOnlyClause = selectedFlowVisibility?.onlyExternalLab
      ? `AND UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '')))) = 'EXTERNO'`
      : '';
    const reportFiltersByOrderDates =
      query.reportMode === true &&
      ((context.roleCode === 'JEF_TALLER' &&
        (flowCode === 7 || flowCode === 10)) ||
        (context.roleCode === 'ANALISTA_ORD' && flowCode === 10));
    const includeFlow10MaterialCost =
      query.reportMode === true &&
      flowCode === 10 &&
      context.roleCode === 'JEF_TALLER';
    const materialCostSelect = includeFlow10MaterialCost
      ? 'TRY_CONVERT(FLOAT, material.CTOP) AS COSTO_MATERIAL,'
      : '';
    const servicePriceSelect = includeFlow10MaterialCost
      ? 'TRY_CONVERT(FLOAT, material.PVTA) AS COSTO_SERVICIO,'
      : 'TRY_CONVERT(FLOAT, o.CTORD) AS COSTO_SERVICIO,';
    const materialCostJoin = includeFlow10MaterialCost
      ? `OUTER APPLY (
          SELECT TOP 1 art.CTOP, art.PVTA
          FROM dbo.DAT_ART art
          WHERE UPPER(LTRIM(RTRIM(ISNULL(art.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.SUC, ''))))
            AND UPPER(LTRIM(RTRIM(ISNULL(art.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.ART, ''))))
          ORDER BY TRY_CONVERT(INT, ISNULL(art.BLOQ, 0)) ASC
        ) material`
      : '';
    const flowDateClause =
      query.reportMode === true && flowCode == null
        ? `AND (@0 IS NULL OR h.FCNR >= TRY_CONVERT(DATE, @0))
          AND (@1 IS NULL OR h.FCNR < DATEADD(DAY, 1, TRY_CONVERT(DATE, @1)))`
        : query.reportMode === true &&
            context.roleCode === 'ANALISTA_ORD' &&
            (flowCode === 4 || flowCode === 7)
          ? `AND (@0 IS NULL OR h.FCNR >= TRY_CONVERT(DATE, @0))
          AND (@1 IS NULL OR h.FCNR < DATEADD(DAY, 1, TRY_CONVERT(DATE, @1)))`
          : reportFiltersByOrderDates
            ? `AND (@0 IS NULL OR TRY_CONVERT(DATE, o.FCNS) >= TRY_CONVERT(DATE, @0))
          AND (@1 IS NULL OR TRY_CONVERT(DATE, ISNULL(o.FCNM, o.FCNS)) <= TRY_CONVERT(DATE, @1))`
            : `AND (@0 IS NULL OR h.NEXT_FCNR IS NULL OR h.NEXT_FCNR > TRY_CONVERT(DATE, @0))
          AND (@1 IS NULL OR h.FCNR < DATEADD(DAY, 1, TRY_CONVERT(DATE, @1)))`;
    const isJefeGarantiaReport =
      query.reportMode === true &&
      context.roleCode === 'JEF_TALLER' &&
      flowCode === 9.3;
    const needsFlowIntervalBoundary =
      this.normalizeText(query.fecIni) != null ||
      this.normalizeText(query.fecFin) != null;
    const flowHistoryCte = isJefeGarantiaReport
      ? `FlowHistoryIntervals AS (
        SELECT
          h.IORD,
          h.ID,
          TRY_CONVERT(FLOAT, h.ESTSEGU) AS ESTSEGU,
          h.FCNR,
          ${needsFlowIntervalBoundary ? 'nextFlow.FCNR' : 'CAST(NULL AS DATETIME)'} AS NEXT_FCNR
        FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
        ${needsFlowIntervalBoundary ? `OUTER APPLY (
          SELECT TOP (1) h2.FCNR
          FROM dbo.PV_CTR_ORDS_FLUJO_HIST h2
          WHERE UPPER(LTRIM(RTRIM(h2.IORD))) = UPPER(LTRIM(RTRIM(h.IORD)))
            AND (
              h2.FCNR > h.FCNR
              OR (h2.FCNR = h.FCNR AND h2.ID > h.ID)
            )
          ORDER BY h2.FCNR, h2.ID
        ) nextFlow` : ''}
        WHERE h.ESTSEGU = 9.3
      )`
      : `FlowHistoryIntervals AS (
        SELECT
          h.IORD,
          h.ID,
          TRY_CONVERT(FLOAT, h.ESTSEGU) AS ESTSEGU,
          h.FCNR,
          LEAD(h.FCNR) OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(h.IORD)))
            ORDER BY h.FCNR, h.ID
          ) AS NEXT_FCNR
        FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
      )`;
    const params: unknown[] = [
      this.normalizeText(query.fecIni),
      this.normalizeText(query.fecFin),
      this.normalizeText(query.iord),
      this.normalizeText(query.idfol),
      this.normalizeText(query.client),
      this.normalizeText(query.art),
      this.normalizeText(query.tipo),
      this.normalizeText(query.labor),
      this.normalizeText(query.estatus),
      this.normalizeText(query.asign),
      context.scope.requestedSuc,
      this.normalizeText(query.search),
    ];
    const allowedClause = context.scope.isAdmin
      ? ''
      : `AND UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (${context.scope.allowedSucs
          .map((_, index) => `@${params.length + index}`)
          .join(',')})`;
    if (!context.scope.isAdmin) params.push(...context.scope.allowedSucs);

    const offset = (context.page - 1) * context.pageSize;
    const offsetPlaceholder = params.length;
    params.push(offset);
    const limitPlaceholder = params.length;
    params.push(context.pageSize);
    const rows = await this.dataSource.query(
      `
      WITH ${flowHistoryCte},
      FlowOrders AS (
        SELECT
          o.IORD,
          o.IDFOL,
          o.TIPO,
          LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), ''))) AS OPV_ID,
          COALESCE(
            NULLIF(LTRIM(RTRIM(ISNULL(uopv.NOMBRE, ''))), ''),
            NULLIF(LTRIM(RTRIM(CONCAT(
              ISNULL(opv.NOMB, ''),
              CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(opv.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(ISNULL(opv.APELP, ''))) END,
              CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(opv.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(ISNULL(opv.APELM, ''))) END
            ))), ''),
            LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), '')))
          ) AS OPV,
          o.FCNS,
          o.FCNM,
          o.CLIEN,
          o.NCLIENTE,
          o.MAT,
          o.CTD,
          o.ART,
          o.DESCART,
          o.COMAD,
          o.ESTATUS,
          TRY_CONVERT(FLOAT, h.ESTSEGU) AS ESTSEGU,
          TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU_ACTUAL,
          e.TIPO AS ESTSEGU_DESC,
          o.ASIGN,
          o.LABOR,
          o.MOTR,
          o.SUC,
          ${servicePriceSelect}
          ${materialCostSelect}
          h.FCNR AS FECHA_FLUJO,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(o.IORD)))
            ORDER BY h.FCNR DESC, h.ID DESC
          ) AS FLOW_ROW
        FROM dbo.PV_CTR_ORDS o
        INNER JOIN FlowHistoryIntervals h
          ON UPPER(LTRIM(RTRIM(h.IORD))) = UPPER(LTRIM(RTRIM(o.IORD)))
         AND ${flowHistoryPredicate}
        LEFT JOIN dbo.DAT_EST_ORD e
          ON ${flowCatalogPredicate}
        LEFT JOIN dbo.USUARIO uopv
          ON TRY_CONVERT(INT, uopv.IDUSUARIO) = TRY_CONVERT(INT, o.OPV)
        LEFT JOIN dbo.PV_OPV opv
          ON LTRIM(RTRIM(ISNULL(CAST(opv.IDOPV AS NVARCHAR(100)), ''))) = LTRIM(RTRIM(ISNULL(CAST(o.OPV AS NVARCHAR(100)), '')))
        LEFT JOIN dbo.DAT_LAB lab
          ON TRY_CONVERT(INT, lab.ID) = TRY_CONVERT(INT, o.LABOR)
        ${materialCostJoin}
        WHERE ${isJefeGarantiaReport ? '1 = 1' : 'TRY_CONVERT(INT, o.ESTATUS) = 2'}
          ${flowDateClause}
          AND (@2 IS NULL OR LTRIM(RTRIM(ISNULL(o.IORD, ''))) LIKE '%' + @2 + '%')
          AND (@3 IS NULL OR LTRIM(RTRIM(ISNULL(o.IDFOL, ''))) LIKE '%' + @3 + '%')
          AND (
            @4 IS NULL
            OR CASE
              WHEN TRY_CONVERT(DECIMAL(38, 0), o.CLIEN) IS NOT NULL
                THEN CONVERT(NVARCHAR(255), CONVERT(DECIMAL(38, 0), o.CLIEN))
              ELSE LTRIM(RTRIM(CONVERT(NVARCHAR(255), ISNULL(o.CLIEN, ''))))
            END LIKE '%' + @4 + '%'
            OR UPPER(LTRIM(RTRIM(ISNULL(o.NCLIENTE, '')))) LIKE '%' + UPPER(@4) + '%'
          )
          AND (@5 IS NULL OR LTRIM(RTRIM(ISNULL(o.ART, ''))) LIKE '%' + @5 + '%')
          AND (@6 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) LIKE '%' + UPPER(@6) + '%')
          AND (@7 IS NULL OR CAST(ISNULL(o.LABOR, '') AS NVARCHAR(255)) = @7)
          AND (@8 IS NULL OR CAST(ISNULL(o.ESTATUS, '') AS NVARCHAR(255)) = @8)
          AND (@9 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.ASIGN, '')))) LIKE '%' + UPPER(@9) + '%')
          AND (@10 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) = UPPER(@10))
          AND (
            @11 IS NULL
            OR UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) LIKE '%' + UPPER(@11) + '%'
            OR UPPER(LTRIM(RTRIM(ISNULL(o.IDFOL, '')))) LIKE '%' + UPPER(@11) + '%'
            OR UPPER(LTRIM(RTRIM(ISNULL(o.ART, '')))) LIKE '%' + UPPER(@11) + '%'
            OR UPPER(LTRIM(RTRIM(ISNULL(o.DESCART, '')))) LIKE '%' + UPPER(@11) + '%'
            OR UPPER(LTRIM(RTRIM(ISNULL(o.NCLIENTE, '')))) LIKE '%' + UPPER(@11) + '%'
          )
          ${allowedClause}
          ${externalOnlyClause}
      ),
      Deduplicated AS (
        SELECT *, COUNT(*) OVER() AS TOTAL_COUNT
        FROM FlowOrders
        WHERE FLOW_ROW = 1
      )
      SELECT *
      FROM Deduplicated
      ORDER BY FECHA_FLUJO DESC, IORD DESC
      OFFSET @${offsetPlaceholder} ROWS FETCH NEXT @${limitPlaceholder} ROWS ONLY
      `,
      params,
    );
    let rawItems = Array.isArray(rows)
      ? rows.map((row) => {
          const out = { ...(row as Record<string, unknown>) };
          delete out.TOTAL_COUNT;
          delete out.total_count;
          delete out.FLOW_ROW;
          if (context.roleCode !== 'JEF_TALLER') {
            delete out.COSTO_SERVICIO;
          }
          return out;
        })
      : [];
    if (flowCode === 4 && context.roleCode === 'ANALISTA_ORD') {
      rawItems = await this.attachAnulacionMotivos(rawItems);
    }
    const itemsByAllowedStatus = this.applyAllowedStatusFilterToItems(
      rawItems,
      context.allowedStatusCodes,
      context.includeNullFlow,
      selectedFlowCode,
    );
    const visibleItems = await this.applyFlowVisibilityRulesToItems(
      itemsByAllowedStatus,
      visibilityRules,
      context.scope,
      context.roleCode,
      selectedFlowCode,
    );
    const reportItems =
      query.reportMode === true
        ? await this.attachChargedArticlePrices(visibleItems)
        : visibleItems;
    const asignLabels = await this.resolveOpvLabels(
      reportItems.map((item) => item.ASIGN),
    );
    const opvLabels = await this.resolveUsuarioLabels(
      reportItems.map((item) => item.OPV_ID ?? item.OPV),
    );
    const labeledItems = reportItems.map((item) => {
      const asignId = this.normalizeText(item.ASIGN);
      const asignLabel = asignId == null ? null : asignLabels.get(asignId);
      const opvId = this.normalizeText(item.OPV_ID ?? item.OPV);
      const opvLabel = opvId == null ? null : opvLabels.get(opvId);
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
    const first = this.firstRow(rows);
    return {
      ok: true,
      page: context.page,
      pageSize: context.pageSize,
      total: this.toInt(first?.TOTAL_COUNT ?? first?.total_count) ?? 0,
      roleCode: context.responseRoleCode,
      panelMode: context.panelMode,
      allowedSucs: context.scope.allowedSucs,
      allowedActions: context.allowedActions,
      flowStatusOptions: context.flowStatusOptions,
      incidenciaOptions: context.incidenciaOptions,
      laboratorios: context.laboratorios,
      otrosOptions: context.otrosOptions,
      items: labeledItems,
    };
  }

  private async attachChargedArticlePrices(
    items: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (!items.length) return items;

    const references = items.map((item) => ({
      item,
      iord: this.normalizeUpper(item.IORD),
      idfol: this.normalizeUpper(item.IDFOL),
      art: this.normalizeUpper(item.ART),
    }));
    const prices = new Map<string, number>();
    const itemKey = (reference: (typeof references)[number]) =>
      reference.iord ?? '';
    const priceFrom = (
      row: Record<string, unknown>,
      unitField: string,
      totalField: string,
      quantityField: string,
    ) => {
      const unitPrice = this.toFloat(row[unitField]);
      if (unitPrice != null && unitPrice >= 0) return unitPrice;
      const total = this.toFloat(row[totalField]);
      const quantity = this.toFloat(row[quantityField]);
      return total != null && total >= 0 && quantity != null && quantity > 0
        ? this.roundMoney(total / quantity)
        : null;
    };
    const distinct = (values: Array<string | null>) => [
      ...new Set(values.filter((value): value is string => value != null)),
    ];

    const referencesWithIord = references.filter(
      (reference) => reference.iord != null,
    );
    if (await this.hasTable('PV_ORD_CAMBIO_MERMA_PRECIO')) {
      const iords = distinct(
        referencesWithIord.map((reference) => reference.iord),
      );
      for (let start = 0; start < iords.length; start += 500) {
        const batch = iords.slice(start, start + 500);
        const placeholders = batch.map((_, index) => `@${index}`).join(',');
        const rows = await this.dataSource.query(
          `
          SELECT IORD, ART, TRY_CONVERT(FLOAT, PVTA_UNITARIO) AS PVTA_UNITARIO,
                 FCN_MOD, FCN_ALT
          FROM dbo.PV_ORD_CAMBIO_MERMA_PRECIO
          WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) IN (${placeholders})
          ORDER BY ISNULL(FCN_MOD, FCN_ALT) DESC
          `,
          batch,
        );
        for (const row of Array.isArray(rows) ? rows : []) {
          const iord = this.normalizeUpper(row.IORD);
          const article = this.normalizeUpper(row.ART);
          const price = this.toFloat(row.PVTA_UNITARIO);
          const matchingOrder = referencesWithIord.some(
            (reference) =>
              reference.iord === iord &&
              (reference.art == null || reference.art === article),
          );
          if (
            iord &&
            matchingOrder &&
            price != null &&
            price >= 0 &&
            !prices.has(iord)
          ) {
            prices.set(iord, price);
          }
        }
      }
    }

    const attachFromTicketSource = async (
      tableName: 'PV_TICKET_LOG' | 'FACT_TICKET_SHP',
    ) => {
      if (!(await this.hasTable(tableName))) return;
      const unresolved = referencesWithIord.filter(
        (reference) => !prices.has(itemKey(reference)),
      );
      for (let start = 0; start < unresolved.length; start += 200) {
        const batch = unresolved.slice(start, start + 200);
        const iords = distinct(batch.map((reference) => reference.iord));
        const pairs = batch.filter(
          (reference) => reference.idfol != null && reference.art != null,
        );
        const folios = distinct(pairs.map((reference) => reference.idfol));
        const articles = distinct(pairs.map((reference) => reference.art));
        const params: string[] = [];
        const inClause = (values: string[]) => {
          const startIndex = params.length;
          const placeholders = values.map(
            (_, index) => `@${startIndex + index}`,
          );
          params.push(...values);
          return placeholders.join(',');
        };
        const conditions: string[] = [];
        if (iords.length) {
          conditions.push(
            `UPPER(LTRIM(RTRIM(ISNULL(ORD, '')))) IN (${inClause(iords)})`,
          );
        }
        if (folios.length && articles.length) {
          conditions.push(
            `(UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) IN (${inClause(folios)})
              AND UPPER(LTRIM(RTRIM(ISNULL(ART, '')))) IN (${inClause(articles)}))`,
          );
        }
        if (!conditions.length) continue;
        const ticketSql =
          tableName === 'PV_TICKET_LOG'
            ? `SELECT ORD, IDFOL, ART, PVTA, PVTAT, CTD, UPDATED_AT, ID
               FROM dbo.PV_TICKET_LOG WHERE ${conditions.join(' OR ')}`
            : `SELECT ORD, IDFOL, NoIdentificacion AS ART, ValorUnitario AS PVTA,
                      PVTAT, Cantidad AS CTD, CAST(NULL AS DATETIME) AS UPDATED_AT, IDD AS ID
               FROM dbo.FACT_TICKET_SHP WHERE ${conditions
                 .map((condition) =>
                   condition.replaceAll('ART', 'NoIdentificacion'),
                 )
                 .join(' OR ')}`;
        const rows = await this.dataSource.query(ticketSql, params);
        const candidates = Array.isArray(rows)
          ? (rows as Record<string, unknown>[])
          : [];
        for (const reference of batch) {
          const key = itemKey(reference);
          if (!key || prices.has(key)) continue;
          const matching = candidates
            .filter((row) => {
              const rowIord = this.normalizeUpper(row.ORD);
              const rowFolio = this.normalizeUpper(row.IDFOL);
              const rowArticle = this.normalizeUpper(row.ART);
              return (
                (rowIord === reference.iord &&
                  (reference.art == null || rowArticle === reference.art)) ||
                (reference.idfol != null &&
                  reference.art != null &&
                  rowFolio === reference.idfol &&
                  rowArticle === reference.art)
              );
            })
            .sort((left, right) => {
              const leftExact =
                this.normalizeUpper(left.ORD) === reference.iord ? 0 : 1;
              const rightExact =
                this.normalizeUpper(right.ORD) === reference.iord ? 0 : 1;
              if (leftExact !== rightExact) return leftExact - rightExact;
              const byUpdatedAt =
                this.toTime(right.UPDATED_AT) - this.toTime(left.UPDATED_AT);
              return byUpdatedAt !== 0
                ? byUpdatedAt
                : String(right.ID ?? '').localeCompare(String(left.ID ?? ''));
            });
          const price = matching.length
            ? priceFrom(matching[0], 'PVTA', 'PVTAT', 'CTD')
            : null;
          if (price != null) prices.set(key, price);
        }
      }
    };

    await attachFromTicketSource('PV_TICKET_LOG');
    await attachFromTicketSource('FACT_TICKET_SHP');
    return references.map((reference) => ({
      ...reference.item,
      PRECIO_COBRADO: prices.get(itemKey(reference)) ?? null,
    }));
  }

  private async listMb51Movimiento455Report(
    query: ListOrdenesTrabajoQueryDto,
    context: {
      page: number;
      pageSize: number;
      roleCode: string;
      panelMode: string;
      scope: SucScope;
      allowedActions: string[];
      flowStatusOptions: unknown[];
      incidenciaOptions: unknown[];
      laboratorios: unknown[];
      otrosOptions: unknown[];
    },
  ) {
    const params: unknown[] = [
      this.normalizeText(query.iord),
      this.normalizeText(query.idfol),
      this.normalizeText(query.client),
      this.normalizeText(query.fecIni),
      this.normalizeText(query.fecFin),
      this.normalizeText(query.tipo),
      this.normalizeText(query.labor),
      this.normalizeText(query.estsegu),
      this.normalizeText(query.asign),
    ];
    const requestedSucPlaceholder = context.scope.requestedSuc
      ? params.length
      : null;
    if (context.scope.requestedSuc) params.push(context.scope.requestedSuc);
    const allowedClause = context.scope.isAdmin
      ? ''
      : ` AND m.SUC IN (${context.scope.allowedSucs
          .map((_, index) => `@${params.length + index}`)
          .join(',')})`;
    if (!context.scope.isAdmin) params.push(...context.scope.allowedSucs);
    const offsetPlaceholder = params.length;
    params.push((context.page - 1) * context.pageSize);
    const limitPlaceholder = params.length;
    params.push(context.pageSize);
    const rows = await this.dataSource.query(
      `
      SELECT
        m.IDPD AS MB51_IDPD,
        m.DOCP AS MB51_DOCP,
        m.ART AS ART,
        ABS(ISNULL(m.CTDA, 0)) AS CTD,
        m.CTOT AS MB51_CTOT,
        m.FCND AS FCNS,
        m.SUC AS SUC,
        COUNT(*) OVER() AS TOTAL_COUNT,
        m.TXT AS MB51_TXT,
        a.DES AS DESCART,
        a.CTOP AS COSTO_ARTICULO,
        o.IORD AS IORD,
        o.IDFOL AS IDFOL,
        o.TIPO AS TIPO,
        o.OPV AS OPV,
        o.CLIEN AS CLIEN,
        o.NCLIENTE AS NCLIENTE,
        a.PVTA AS COSTO_SERVICIO,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONCAT(
            ISNULL(responsable.NOMB, ''),
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(responsable.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(responsable.APELP)) END,
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(responsable.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(responsable.APELM)) END
          ))), ''),
          'Sin colaborador asignado'
        ) AS RESPONSABLE_MERMA,
        o.ESTATUS AS ESTATUS,
        o.ESTSEGU AS ESTSEGU,
        o.ESTSEGU AS ESTSEGU_DESC,
        o.ASIGN AS ASIGN,
        o.ASIGN AS ASIGN_ID,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONCAT(
            ISNULL(responsable.NOMB, ''),
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(responsable.APELP, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(responsable.APELP)) END,
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(responsable.APELM, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(responsable.APELM)) END
          ))), ''),
          LTRIM(RTRIM(ISNULL(o.ASIGN, '')))
        ) AS ASIGN_LABEL,
        o.LABOR AS LABOR,
        o.TIPOM AS TIPOM,
        o.MOTR AS MOTR,
        o.FCNTE AS FCNTE
      FROM dbo.DAT_MB51 m
      OUTER APPLY (
        SELECT TOP 1 DES, CTOP, PVTA
        FROM dbo.DAT_ART art
        WHERE art.ART = m.ART
        ORDER BY CASE WHEN art.SUC = m.SUC THEN 0 ELSE 1 END
      ) a
      OUTER APPLY (
        SELECT LTRIM(RTRIM(
          SUBSTRING(
            m.TXT,
            CASE WHEN CHARINDEX('ORD:', UPPER(m.TXT)) > 0
              THEN CHARINDEX('ORD:', UPPER(m.TXT)) + 4
              ELSE CHARINDEX('ORD', UPPER(m.TXT)) + 3
            END,
            255
          )
        )) AS IORDTXT
      ) ordtxt
      LEFT JOIN dbo.PV_CTR_ORDS o ON o.IORD = ordtxt.IORDTXT
      LEFT JOIN dbo.PV_OPV responsable
        ON UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(255), responsable.IDOPV)))) =
           UPPER(LTRIM(RTRIM(ISNULL(o.ASIGN, ''))))
      WHERE TRY_CONVERT(INT, m.CLSM) = 455
        AND (@0 IS NULL OR m.TXT LIKE '%' + @0 + '%' OR o.IORD LIKE '%' + @0 + '%')
        AND (@1 IS NULL OR o.IDFOL LIKE '%' + @1 + '%')
        AND (@2 IS NULL OR o.CLIEN LIKE '%' + @2 + '%' OR o.NCLIENTE LIKE '%' + @2 + '%')
        AND (@3 IS NULL OR m.FCND >= @3)
        AND (@4 IS NULL OR m.FCND < DATEADD(DAY, 1, @4))
        AND (@5 IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(o.TIPO, '')))) = UPPER(@5))
        AND (@6 IS NULL OR TRY_CONVERT(INT, o.LABOR) = TRY_CONVERT(INT, @6))
        AND (
          @7 IS NULL
          OR EXISTS (
            SELECT 1
            FROM dbo.PV_CTR_ORDS_FLUJO_HIST fh
            WHERE fh.IORD = o.IORD
              AND (
                (UPPER(LTRIM(RTRIM(@7))) = 'NULL' AND fh.ESTSEGU IS NULL)
                OR (
                  UPPER(LTRIM(RTRIM(@7))) <> 'NULL'
                  AND fh.ESTSEGU = TRY_CONVERT(FLOAT, @7)
                )
              )
          )
        )
        AND (@8 IS NULL OR LTRIM(RTRIM(ISNULL(o.ASIGN, ''))) = LTRIM(RTRIM(@8)))
        ${requestedSucPlaceholder != null ? `AND m.SUC = @${requestedSucPlaceholder}` : ''}
        ${allowedClause}
      ORDER BY m.FCND DESC, m.IDPD DESC
      OFFSET @${offsetPlaceholder} ROWS FETCH NEXT @${limitPlaceholder} ROWS ONLY
      `,
      params,
    );
    const total = this.toInt(rows?.[0]?.TOTAL_COUNT) ?? 0;
    const items =
      query.reportMode === true
        ? await this.attachChargedArticlePrices(rows)
        : rows;
    return {
      ok: true,
      page: context.page,
      pageSize: context.pageSize,
      total,
      roleCode: context.roleCode,
      panelMode: context.panelMode,
      allowedSucs: context.scope.allowedSucs,
      allowedActions: context.allowedActions,
      flowStatusOptions: context.flowStatusOptions,
      incidenciaOptions: context.incidenciaOptions,
      laboratorios: context.laboratorios,
      otrosOptions: context.otrosOptions,
      items,
    };
  }

  async listarColaboradoresTaller(_user: JwtPayload) {
    const rows = await this.dataSource.query(`
      SELECT IDOPV, NOMB, APELP, APELM, SUC, DEPTO, NIVEL, ESTATUS
      FROM dbo.PV_OPV
      WHERE UPPER(LTRIM(RTRIM(ISNULL(DEPTO, '')))) IN ('TALLER', 'BISELADO')
      ORDER BY SUC, NOMB, APELP, APELM, IDOPV
    `);
    const sucursalesRows = await this.dataSource.query(`
      SELECT LTRIM(RTRIM(SUC)) AS SUC, LTRIM(RTRIM(ISNULL([DESC], ''))) AS [DESC]
      FROM dbo.DAT_SUC
      WHERE NULLIF(LTRIM(RTRIM(ISNULL(SUC, ''))), '') IS NOT NULL
      ORDER BY LTRIM(RTRIM(SUC))
    `);
    return {
      ok: true,
      items: rows,
      sucursales: sucursalesRows,
    };
  }

  async crearColaboradorTaller(
    body: Record<string, unknown>,
    _user: JwtPayload,
  ) {
    const nomb = this.normalizeText(body.nomb ?? body.NOMB);
    const apelp = this.normalizeText(body.apelp ?? body.APELP);
    const apelm = this.normalizeText(body.apelm ?? body.APELM);
    const suc = this.normalizeUpper(body.suc ?? body.SUC);
    const depto = this.normalizeUpper(body.depto ?? body.DEPTO);
    if (
      !nomb ||
      !apelp ||
      !suc ||
      !['TALLER', 'BISELADO'].includes(depto ?? '')
    ) {
      throw new BadRequestException(
        'Nombre, apellido, sucursal y departamento son requeridos',
      );
    }
    const nextIdRows = await this.dataSource.query(`
      SELECT COALESCE(MAX(TRY_CONVERT(INT, IDOPV)), 0) + 1 AS NEXT_ID
      FROM dbo.PV_OPV
    `);
    const idopv = String(nextIdRows?.[0]?.NEXT_ID ?? '1');
    await this.dataSource.query(
      `
      INSERT INTO dbo.PV_OPV (IDOPV, NOMB, APELP, APELM, SUC, DEPTO, NIVEL, ESTATUS)
      VALUES (@0, @1, @2, @3, @4, @5, 41, 'ACTIVO')
      `,
      [idopv, nomb, apelp, apelm ?? '', suc, depto],
    );
    return { ok: true, idopv };
  }

  async editarColaboradorTaller(
    idopvRaw: string,
    body: Record<string, unknown>,
    _user: JwtPayload,
  ) {
    const idopv = this.normalizeText(idopvRaw);
    const nomb = this.normalizeText(body.nomb ?? body.NOMB);
    const apelp = this.normalizeText(body.apelp ?? body.APELP);
    const apelm = this.normalizeText(body.apelm ?? body.APELM) ?? '';
    const suc = this.normalizeUpper(body.suc ?? body.SUC);
    const deptoInput = this.normalizeUpper(body.depto ?? body.DEPTO);
    const depto = deptoInput === 'TALLADO' ? 'TALLER' : deptoInput;
    if (
      !idopv ||
      !nomb ||
      !apelp ||
      !suc ||
      !['TALLER', 'BISELADO'].includes(depto ?? '')
    ) {
      throw new BadRequestException(
        'Nombre, apellido, sucursal y departamento son requeridos',
      );
    }
    const result = await this.dataSource.query(
      `
      UPDATE dbo.PV_OPV
      SET NOMB = @0, APELP = @1, APELM = @2, SUC = @3, DEPTO = @4
      OUTPUT INSERTED.IDOPV AS IDOPV
      WHERE IDOPV = @5
        AND UPPER(LTRIM(RTRIM(ISNULL(DEPTO, '')))) IN ('TALLER', 'BISELADO')
      `,
      [nomb, apelp, apelm, suc, depto, idopv],
    );
    if (!Array.isArray(result) || result.length === 0) {
      throw new NotFoundException('Colaborador no encontrado');
    }
    return { ok: true, idopv };
  }

  async cambiarEstatusColaboradorTaller(
    idopvRaw: string,
    body: { estatus?: string },
    _user: JwtPayload,
  ) {
    const idopv = this.normalizeText(idopvRaw);
    const estatus = this.normalizeUpper(body.estatus ?? '');
    if (!idopv || !['ACTIVO', 'INACTIVO'].includes(estatus)) {
      throw new BadRequestException('Estatus inválido');
    }
    const result = await this.dataSource.query(
      `
      UPDATE dbo.PV_OPV
      SET ESTATUS = @0
      WHERE IDOPV = @1
        AND UPPER(LTRIM(RTRIM(ISNULL(DEPTO, '')))) IN ('TALLER', 'BISELADO')
      `,
      [estatus, idopv],
    );
    return { ok: true, idopv, estatus, updated: result?.[1] ?? null };
  }

  async exportExcel(
    query: ListOrdenesTrabajoQueryDto,
    user: JwtPayload,
  ): Promise<Buffer> {
    const report: any = await this.list(
      { ...query, exportAll: true, page: 1, pageSize: 25 },
      user,
    );
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IOE API';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('ORDs');
    const selectedFlow = this.normalizeText(query.estsegu) != null;
    const selectedReportFlow10 =
      query.reportMode === true &&
      this.toFloat(query.estsegu) === 10 &&
      query.otros !== true;
    const includeFlow10ServiceCost =
      selectedReportFlow10 && report.roleCode === 'JEF_TALLER';
    const includeOtrosServiceCost =
      query.reportMode === true &&
      query.otros === true &&
      report.roleCode === 'JEF_TALLER';
    const includeFlow10MaterialCost =
      query.reportMode === true &&
      this.toFloat(query.estsegu) === 10 &&
      query.otros !== true &&
      report.roleCode === 'JEF_TALLER';
    const includeChargedArticlePrice = query.reportMode === true;
    const includeAnulacionMotivo =
      query.reportMode === true &&
      this.toFloat(query.estsegu) === 4 &&
      ['ANALISTA_ORD', 'CONTROL_CALIDAD'].includes(report.roleCode);
    const includeFlowMovementActor =
      query.reportMode !== true &&
      this.normalizePanelMode(query.panelMode) === 'estado' &&
      report.roleCode === 'JEF_TALLER';
    sheet.columns = [
      { header: 'SUC', key: 'suc', width: 10 },
      { header: 'Tipo', key: 'tipo', width: 14 },
      { header: 'OPV', key: 'opv', width: 28 },
      { header: 'Laboratorio', key: 'laboratorio', width: 28 },
      { header: 'IORD', key: 'iord', width: 20 },
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'Articulo', key: 'articulo', width: 16 },
      { header: 'Descripcion', key: 'descripcion', width: 42 },
      { header: 'CTD', key: 'ctd', width: 10 },
      ...(includeChargedArticlePrice
        ? [{ header: 'Precio cobrado', key: 'precioCobrado', width: 18 }]
        : []),
      ...(includeFlow10MaterialCost
        ? [{ header: 'Costo del material', key: 'costoMaterial', width: 20 }]
        : []),
      ...(includeFlow10ServiceCost || includeOtrosServiceCost
        ? [{ header: 'Costo del servicio', key: 'costoServicio', width: 18 }]
        : []),
      ...(includeAnulacionMotivo
        ? [{ header: 'Motivo', key: 'motivo', width: 36 }]
        : []),
      {
        header: query.ordenesVencerMode
          ? selectedFlow
            ? 'Flujo seleccionado'
            : 'Flujo actual'
          : selectedFlow
            ? 'Flujo recorrido'
            : 'Flujo actual',
        key: 'flujo',
        width: 32,
      },
      ...(includeFlowMovementActor
        ? [{ header: 'Realizó movimiento', key: 'quienRealizo', width: 28 }]
        : []),
      { header: 'Asignado', key: 'asignado', width: 30 },
      { header: 'F. sol', key: 'fsol', width: 14 },
      { header: 'F. ent', key: 'fent', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0B1B33' },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const optionalColumnCount = [
      includeFlow10ServiceCost,
      includeOtrosServiceCost,
      includeFlow10MaterialCost,
      includeChargedArticlePrice,
      includeAnulacionMotivo,
      includeFlowMovementActor,
    ].filter(Boolean).length;
    const lastColumn = String.fromCharCode(
      'M'.charCodeAt(0) + optionalColumnCount,
    );
    sheet.autoFilter = `A1:${lastColumn}1`;
    const text = (value: unknown) =>
      value == null ? '' : String(value).trim();
    const laboratorioLabels = new Map(
      report.laboratorios.map((laboratorio) => [
        text(laboratorio.id),
        text(laboratorio.lab),
      ]),
    );
    const selectedHistoricalFlow =
      query.reportMode === true ? this.normalizeText(query.estsegu) : null;
    const exportItems = selectedHistoricalFlow
      ? report.items.filter((item: Record<string, unknown>) => {
          const itemFlow = this.toFloat(item.ESTSEGU);
          if (selectedHistoricalFlow.toUpperCase() === 'NULL') {
            return itemFlow == null;
          }
          const selectedFlow = this.toFloat(selectedHistoricalFlow);
          return (
            itemFlow != null &&
            selectedFlow != null &&
            Math.abs(itemFlow - selectedFlow) <= 0.0001
          );
        })
      : report.items;
    for (const item of exportItems) {
      sheet.addRow({
        suc: text(item.SUC),
        tipo: text(item.TIPO),
        opv: text(item.OPV_LABEL ?? item.OPV),
        laboratorio:
          laboratorioLabels.get(text(item.LABOR)) ??
          text(item.LABORATORIO_DESC ?? item.LABOR),
        iord: text(item.IORD),
        cliente: `${text(item.CLIEN)} ${text(item.NCLIENTE)}`.trim(),
        articulo: text(item.ART),
        descripcion: text(item.DESCART),
        ctd: item.CTD ?? '',
        ...(includeChargedArticlePrice
          ? { precioCobrado: item.PRECIO_COBRADO ?? '' }
          : {}),
        ...(includeFlow10MaterialCost
          ? { costoMaterial: item.COSTO_MATERIAL ?? '' }
          : {}),
        ...(includeFlow10ServiceCost || includeOtrosServiceCost
          ? { costoServicio: item.COSTO_SERVICIO ?? '' }
          : {}),
        ...(includeAnulacionMotivo ? { motivo: text(item.MOTIVO) } : {}),
        flujo:
          selectedHistoricalFlow?.toUpperCase() === 'NULL'
            ? 'SIN FLUJO'
            : `${text(item.ESTSEGU)} ${text(item.ESTSEGU_DESC)}`.trim(),
        ...(includeFlowMovementActor
          ? { quienRealizo: text(item.QUIEN_REALIZO) }
          : {}),
        asignado: text(item.ASIGN_LABEL ?? item.ASIGN),
        fsol: text(item.FCNS),
        fent: text(item.FCNM),
      });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
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
        if (
          this.normalizeUpper(stagedIord) !== this.normalizeUpper(finalIord)
        ) {
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
    return this.buildCambioMermaContextResponse(
      iord,
      tipo,
      original.row,
      staging,
    );
  }

  async cancelarCambioMerma(
    iordRaw: string,
    dto: CancelarCambioMermaDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const tipo = this.normalizeCambioMermaTipo(dto.tipo);
    const motivoCancelacion = this.normalizeText(dto.motivoCancelacion);
    if (!motivoCancelacion || motivoCancelacion.length < 3) {
      throw new BadRequestException(
        'El motivo de cancelación es obligatorio y debe tener al menos 3 caracteres.',
      );
    }
    if (motivoCancelacion.length > 255) {
      throw new BadRequestException(
        'El motivo de cancelación no puede exceder 255 caracteres.',
      );
    }
    if (!this.isAdmin(user)) {
      const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
      const allowedRoles =
        tipo === 1
          ? ['JEF_TALLER', 'ANALISTA_ORD', 'ENC_MAQUILA', 'ENC_BISEL']
          : [
              'JEF_TALLER',
              'ANALISTA_ORD',
              'ANALISTA',
              'ENC_MAQUILA',
              'ENC_BISEL',
              'AUX_JEF_TALLER',
              'AUX_JEFE_TALLER',
              'AUXILIAR_JEF_TALLER',
              'AUXILIAR_JEFE_TALLER',
            ];
      if (!roleCode || !allowedRoles.includes(roleCode)) {
        throw new ForbiddenException(
          'Tu rol no puede cancelar esta solicitud de cambio/merma.',
        );
      }
    }
    await this.assertCambioMermaStagingTable();

    // Este contexto valida el acceso por sucursal antes de tomar los bloqueos.
    await this.fetchCambioMermaOriginalContext(iord, user, tipo);
    const hasTipom = await this.hasColumn('PV_CTR_ORDS', 'TIPOM');
    const hasTpom = await this.hasColumn('PV_CTR_ORDS', 'TPOM');
    const hasReeord = await this.hasColumn('PV_CTR_ORDS', 'REEORD');
    const hasReoord = await this.hasColumn('PV_CTR_ORDS', 'REOORD');
    const hasUsrAut = await this.hasColumn('PV_CTR_ORDS', 'USR_AUT_CYM');
    const hasFcnAut = await this.hasColumn('PV_CTR_ORDS', 'FCN_AUT_CYM');
    const hasMotr = await this.hasColumn('PV_CTR_ORDS', 'MOTR');
    const hasSelCtrlOrd = await this.hasColumn('PV_CTR_ORDS', 'selCtrlOrd');
    const hasCtdCM = await this.hasColumn('PV_CTR_ORDS', 'CTD_C_M');
    const hasNvaIord = await this.hasColumn(
      'PV_ORD_CAMBIO_MERMA_TMP',
      'NVA_IORD',
    );

    const tipoSql = [
      ...(hasTipom ? ['TRY_CONVERT(INT, o.TIPOM)'] : []),
      ...(hasTpom ? ['TRY_CONVERT(INT, o.TPOM)'] : []),
    ];
    const relationSql = [
      ...(hasReeord
        ? ["NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REEORD AS NVARCHAR(255)), ''))), '')"]
        : []),
      ...(hasReoord
        ? ["NULLIF(LTRIM(RTRIM(ISNULL(CAST(o.REOORD AS NVARCHAR(255)), ''))), '')"]
        : []),
    ];
    const hasRelatedOrderSql = relationSql.length
      ? `CASE WHEN ${relationSql.map((expression) => `${expression} IS NOT NULL`).join(' OR ')} THEN 1 ELSE 0 END`
      : '0';
    const authorizedBySql = [
      ...(hasUsrAut
        ? ["NULLIF(LTRIM(RTRIM(ISNULL(o.USR_AUT_CYM, ''))), '') IS NOT NULL"]
        : []),
      ...(hasFcnAut ? ['o.FCN_AUT_CYM IS NOT NULL'] : []),
    ];
    const hasAuthorizationSql = authorizedBySql.length
      ? `CASE WHEN ${authorizedBySql.join(' OR ')} THEN 1 ELSE 0 END`
      : '0';

    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const rows = await queryRunner.query(
        `
        SELECT TOP 1
          o.IORD,
          o.SUC,
          TRY_CONVERT(FLOAT, o.ESTSEGU) AS ESTSEGU,
          ${tipoSql.length > 1 ? `COALESCE(${tipoSql.join(', ')})` : tipoSql[0] ?? 'CAST(NULL AS INT)'} AS TIPOM,
          TRY_CONVERT(INT, o.selCtrlOrd) AS selCtrlOrd,
          ${hasMotr ? 'TRY_CONVERT(INT, o.MOTR)' : 'CAST(NULL AS INT)'} AS MOTR,
          ${hasCtdCM ? 'TRY_CONVERT(FLOAT, o.CTD_C_M)' : 'CAST(NULL AS FLOAT)'} AS CTD_C_M,
          o.ASIGN,
          o.LABOR,
          ${hasRelatedOrderSql} AS HAS_RELATED_ORDER,
          ${hasAuthorizationSql} AS HAS_AUTHORIZATION,
          ${hasNvaIord ? "NULLIF(LTRIM(RTRIM(ISNULL(t.NVA_IORD, ''))), '')" : 'CAST(NULL AS NVARCHAR(255))'} AS NVA_IORD,
          t.ART_NUEVO AS STAGING_ART_NUEVO,
          t.MOTR AS STAGING_MOTR,
          t.MOTIVO AS STAGING_MOTIVO,
          TRY_CONVERT(FLOAT, t.CTD_C_M) AS STAGING_CTD_C_M,
          t.USER_MOD AS STAGING_USER_MOD,
          ${hasNvaIord ? `CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(t.NVA_IORD, ''))), '') IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.PV_CTR_ORDS child WHERE UPPER(LTRIM(RTRIM(ISNULL(child.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(t.NVA_IORD, ''))))) THEN 1 ELSE 0 END` : '0'} AS HAS_CREATED_NVA_IORD
        FROM dbo.PV_CTR_ORDS o WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.PV_ORD_CAMBIO_MERMA_TMP t WITH (UPDLOCK, HOLDLOCK)
          ON UPPER(LTRIM(RTRIM(ISNULL(t.IORD, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.IORD, ''))))
         AND TRY_CONVERT(INT, t.TIPOM) = @1
        WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
        `,
        [iord, tipo],
      );
      const locked = this.firstRow(rows);
      if (!locked) {
        throw new NotFoundException(`No existe la ORD ${iord}.`);
      }

      const currentFlow = this.toFloat(locked.ESTSEGU);
      const requiredFlow = tipo === 1 ? 9.1 : 9.2;
      if (
        currentFlow == null ||
        Math.abs(currentFlow - requiredFlow) > 0.0001 ||
        this.toInt(locked.TIPOM) !== tipo
      ) {
        throw new BadRequestException(
          `Solo se puede cancelar una solicitud de ${tipo === 1 ? 'cambio' : 'merma'} en flujo ${requiredFlow}.`,
        );
      }
      if (!this.normalizeText(locked.ASIGN)) {
        throw new BadRequestException(
          'No se puede regresar la ORD al colaborador porque no tiene una asignación vigente.',
        );
      }
      if (
        this.toInt(locked.HAS_RELATED_ORDER) === 1 ||
        this.toInt(locked.HAS_AUTHORIZATION) === 1 ||
        this.toInt(locked.HAS_CREATED_NVA_IORD) === 1
      ) {
        throw new BadRequestException(
          'La solicitud ya fue autorizada o tiene una ORD derivada; no se puede cancelar desde este flujo.',
        );
      }
      const selCtrlOrd = this.toInt(locked.selCtrlOrd);
      if (
        selCtrlOrd != null &&
        ![0, 13, 14, 15, 16].includes(selCtrlOrd)
      ) {
        throw new BadRequestException(
          `La solicitud no se puede cancelar desde selCtrlOrd=${selCtrlOrd}.`,
        );
      }

      const setClauses = [
        'ESTSEGU = 8',
        'ESTATUS = 2',
        'FCNMOD = GETDATE()',
        ...(hasTipom ? ['TIPOM = 0'] : []),
        ...(hasTpom ? ['TPOM = 0'] : []),
        ...(hasMotr ? ['MOTR = NULL'] : []),
        ...(hasSelCtrlOrd ? ['selCtrlOrd = NULL'] : []),
        ...(hasCtdCM ? ['CTD_C_M = NULL'] : []),
      ];
      await queryRunner.query(
        `UPDATE dbo.PV_CTR_ORDS SET ${setClauses.join(', ')} WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0)`,
        [iord],
      );
      await queryRunner.query(
        `DELETE FROM dbo.PV_ORD_CAMBIO_MERMA_TMP WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0) AND TRY_CONVERT(INT, TIPOM) = @1`,
        [iord, tipo],
      );
      await queryRunner.commitTransaction();

      await this.auditMutation('ORD_CAMBIO_MERMA_CANCELAR', user, ip, {
        iord,
        tipo,
        flujoAnterior: currentFlow,
        selCtrlOrdAnterior: selCtrlOrd,
        motrAnterior: this.toInt(locked.MOTR),
        ctdCMAnterior: this.toFloat(locked.CTD_C_M),
        capturaTemporal: {
          articuloNuevo: this.normalizeText(locked.STAGING_ART_NUEVO),
          motr: this.toInt(locked.STAGING_MOTR),
          motivo: this.normalizeText(locked.STAGING_MOTIVO),
          ctdCM: this.toFloat(locked.STAGING_CTD_C_M),
          nvaIordReservada: this.normalizeText(locked.NVA_IORD),
          usuarioModifico: this.normalizeText(locked.STAGING_USER_MOD),
        },
        asign: this.normalizeText(locked.ASIGN),
        labor: this.toInt(locked.LABOR),
        motivoCancelacion,
      });

      return {
        ok: true,
        message: 'Solicitud cancelada. La ORD regresó al colaborador asignado.',
        data: {
          IORD: iord,
          ESTSEGU: 8,
          ASIGN: this.normalizeText(locked.ASIGN),
          LABOR: this.toInt(locked.LABOR),
        },
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw this.mapError(
        error,
        'No se pudo cancelar la solicitud de cambio/merma.',
      );
    } finally {
      await queryRunner.release();
    }
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
      tipo,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal, tipo);
    const motivo = await this.resolveMovimientoMotrAndLabel(
      tipo,
      dto.motivo,
      this.toInt(dto.motr) ?? this.toInt(original.row.MOTR) ?? undefined,
    );
    const pvtaNuevo = await this.resolveCambioMermaNewUnitPrice(
      this.normalizeText(original.row.SUC) ?? '',
      this.normalizeText(original.row.ART) ?? '',
      null,
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
        pvtaNuevo,
        diferenciaEconomica: null,
        nvaIord,
      },
      this.auditActor(user),
    );

    await this.updateCambioMermaOriginalState(
      iord,
      13,
      ctdCM,
      motivo.id,
      undefined,
      tipo,
    );

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

    const artNuevo = this.normalizeText(dto.artNuevo);
    if (!artNuevo) {
      throw new BadRequestException(
        'Debe seleccionar un artículo válido para la nueva ORD.',
      );
    }
    const suc = this.normalizeText(original.row.SUC) ?? '';
    let pvtaNuevo: number | null = null;
    pvtaNuevo = await this.resolveCambioMermaNewUnitPrice(
      suc,
      artNuevo,
      pvtaNuevo,
    );
    if (pvtaNuevo == null || !Number.isFinite(pvtaNuevo) || pvtaNuevo < 0) {
      throw new BadRequestException('pvtaNuevo inválido para cambio/merma.');
    }
    pvtaNuevo = this.roundMoney(pvtaNuevo);

    const ctdOriginal = this.toFloat(original.row.CTD) ?? 0;
    const ctdCM = this.resolveCtdCM(
      staging.CTD_C_M,
      original.row.CTD_C_M,
      ctdOriginal,
      tipo,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal, tipo);

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
        crearNuevaOrd: (this.toInt(staging.CREAR_NUEVA_ORD) ?? 1) !== 0,
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
      tipo,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal, tipo);

    const artOriginal = this.normalizeText(original.row.ART) ?? '';
    const artNuevo = this.normalizeText(dto.artNuevo) ?? artOriginal;
    if (tipo === 1 && !artNuevo) {
      throw new BadRequestException(
        'Debe seleccionar un artículo nuevo para cambio material.',
      );
    }
    const motivo = await this.resolveMovimientoMotrAndLabel(
      tipo,
      dto.motivo,
      dto.motr,
    );

    const labor =
      dto.labor == null
        ? this.toInt(original.row.LABOR)
        : this.toInt(dto.labor);
    const asign = this.normalizeText(dto.asign);
    if (asign && tipo === 2) {
      const laboratorioRows = await this.dataSource.query(
        `
        SELECT TOP 1 UPPER(LTRIM(RTRIM(ISNULL(l.SUC, '')))) AS SUC
        FROM dbo.DAT_LAB l
        WHERE TRY_CONVERT(INT, l.ID) = TRY_CONVERT(INT, @0)
        `,
        [labor],
      );
      const sucAsign =
        this.normalizeUpper(this.firstRow(laboratorioRows)?.SUC) ??
        this.normalizeUpper(original.row.SUC);
      const collaboratorSucs = this.normalizeUnique([
        ...(sucAsign ? [sucAsign] : []),
        ...(sucAsign ? await this.resolveAsignadoSharedSucs(sucAsign) : []),
      ]);
      const sucPlaceholders = collaboratorSucs
        .map((_, idx) => `@${idx + 1}`)
        .join(',');
      const collaboratorRows = await this.dataSource.query(
        `
        SELECT TOP 1 1 AS ok
        FROM dbo.PV_OPV o
        WHERE LTRIM(RTRIM(ISNULL(CAST(o.IDOPV AS NVARCHAR(100)), ''))) = @0
          AND TRY_CONVERT(INT, o.NIVEL) = 41
          AND UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (${sucPlaceholders || 'NULL'})
        `,
        [asign, ...collaboratorSucs],
      );
      if (!this.firstRow(collaboratorRows)) {
        throw new BadRequestException(
          'El colaborador seleccionado no está disponible para la sucursal de la ORD.',
        );
      }
    }
    const crearNuevaOrd = true;
    const suc = this.normalizeText(original.row.SUC) ?? '';
    let pvtaNuevo =
      this.toFloat(stagingBefore?.PVTA_NUEVO) ?? this.toFloat(dto.pvtaNuevo);
    pvtaNuevo = await this.resolveCambioMermaNewUnitPrice(
      suc,
      artNuevo,
      pvtaNuevo,
    );
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
          this.normalizeText(dto.docDif) ??
          this.normalizeText(original.row.DOCDIF),
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
      asign && tipo === 2 ? asign : null,
    );

    await this.auditMutation('ORD_CAMBIO_MERMA_SOLICITAR_AUT', user, ip, {
      iord,
      tipo,
      selCtrlOrd: nextSelCtrlOrd,
      ctdCM,
      motr: motivo.id,
      ...(asign && tipo === 2 ? { asign } : {}),
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
      tipo,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal, tipo);
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
    const hasSelCtrlOrd = await this.hasColumn('PV_CTR_ORDS', 'selCtrlOrd');

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

    await this.dataSource.transaction(async (manager) => {
      const savedOrderRows = await manager.query(
        `
      DECLARE @savedOrd TABLE (IORD NVARCHAR(255));
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
      OUTPUT inserted.IORD INTO @savedOrd (IORD)
      WHERE IORD = @0
        ${hasSelCtrlOrd ? 'AND ISNULL(TRY_CONVERT(INT, selCtrlOrd), -1) <> 14' : ''};

      SELECT IORD FROM @savedOrd;
      `,
        [iord, laborValue, commentsValue, tipoValue || null, hrEntValue],
      );
      if (hasSelCtrlOrd && !this.firstRow(savedOrderRows)) {
        throw new BadRequestException(
          `No se puede guardar el detalle de la ORD ${iord} mientras su solicitud de cambio o merma está pendiente de autorización.`,
        );
      }

      if (rows.length) {
        for (const line of rows) {
          const iordp = this.normalizeText(line.iordp);
          const job = this.normalizeUpper(line.job);
          const esf = this.normalizeText(line.esf);
          const cil = this.normalizeText(line.cil);
          const eje = this.normalizeText(line.eje);
          if (!iordp && !job) continue;

          await manager.query(
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
    });

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
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    const motivo = this.normalizeText(dto.motivo);
    if (
      [
        'JEF_TALLER',
        'AUX_JEF_TALLER',
        'AUX_JEFE_TALLER',
        'AUXILIAR_JEF_TALLER',
        'AUXILIAR_JEFE_TALLER',
      ].includes(roleCode) &&
      !motivo
    ) {
      throw new BadRequestException(
        'El motivo de anulación es obligatorio para este rol',
      );
    }
    return this.executeLoteAction(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_anular_lote',
      auditAction: 'ORD_ANULAR_LOTE',
      fallbackError:
        'No se pudo anular el lote de ORDs. Verifique estado y permisos.',
      singleMessage: '1 ORD anulada a estatus 4',
      pluralMessagePrefix: 'ORDs anuladas a estatus 4',
      notFoundMessage: 'No fue posible procesar las ORDs para anulación',
      auditMetadataExtra: {
        ...(motivo ? { motivo } : {}),
      },
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
    const suc = this.normalizeUpper(sucRaw);
    if (!suc) {
      throw new BadRequestException('suc es requerida');
    }
    const roleCode = this.normalizeUpper(await this.resolveRoleCode(user));
    const hasReadOnlyAssignedLookup = await this.isControlCalidadRole(user);
    if (
      !this.canAccessAsignadoOptions(user, roleCode) &&
      !hasReadOnlyAssignedLookup
    ) {
      throw new ForbiddenException(
        'Rol no autorizado para consultar asignados del panel',
      );
    }
    const scope = await this.resolveSucScope(user, suc);
    if (!scope.isAdmin && !scope.allowedSucs.includes(suc)) {
      return {
        ok: true,
        suc,
        items: [],
      };
    }
    const allowedDeptos = this.resolveAsignadoDeptos(user, roleCode);
    if (!allowedDeptos.length) {
      return {
        ok: true,
        suc,
        items: [],
      };
    }
    const sharedSucs = await this.resolveAsignadoSharedSucs(suc);
    const sucs = this.normalizeUnique([suc, ...sharedSucs]);
    const sucPlaceholders = sucs.map((_, idx) => `@${idx}`).join(',');
    const deptParamOffset = sucs.length;
    const deptPlaceholders = allowedDeptos
      .map((_, idx) => `@${deptParamOffset + idx}`)
      .join(',');
    const rows = await this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(CAST(o.IDOPV AS NVARCHAR(100)), ''))) AS IDOPV,
        LTRIM(RTRIM(ISNULL(o.NOMB, ''))) AS NOMB,
        LTRIM(RTRIM(ISNULL(o.APELP, ''))) AS APELP,
        LTRIM(RTRIM(ISNULL(o.APELM, ''))) AS APELM,
        UPPER(LTRIM(RTRIM(ISNULL(o.DEPTO, '')))) AS DEPTO,
        UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) AS SUC
      FROM dbo.PV_OPV o
      WHERE TRY_CONVERT(INT, o.NIVEL) = 41
        AND UPPER(LTRIM(RTRIM(ISNULL(o.ESTATUS, '')))) = 'ACTIVO'
        AND UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '')))) IN (${sucPlaceholders})
        AND UPPER(LTRIM(RTRIM(ISNULL(o.DEPTO, '')))) IN (${deptPlaceholders})
      ORDER BY NOMB, APELP, APELM, IDOPV
      `,
      [...sucs, ...allowedDeptos],
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
          depto: this.normalizeUpper(rec.DEPTO) ?? '',
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
          depto: string;
          suc: string;
        } => item !== null,
      );

    return {
      ok: true,
      suc,
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
        '1 ORD recibida en tienda (derivada de merma: padre con entrega 11 -> 10, sin entrega 11 -> 9.2; no derivada: TIPOM=1 -> 9.1, TIPOM=2 -> 9.2)',
      pluralMessagePrefix:
        'ORDs recibidas en tienda (derivada de merma: padre con entrega 11 -> 10, sin entrega 11 -> 9.2; no derivada: TIPOM=1 -> 9.1, TIPOM=2 -> 9.2)',
      notFoundMessage:
        'No fue posible procesar las ORDs para regresar a tienda',
    });
  }

  async rechazarRegresarTiendaLote(
    dto: SendOrdBatchDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('REGRESAR_TIENDA', user);
    const motivo = this.normalizeText(dto.motivo);
    if (!motivo || motivo.length < 3) {
      throw new BadRequestException(
        'El motivo del rechazo es obligatorio y debe tener al menos 3 caracteres',
      );
    }
    if (motivo.length > 500) {
      throw new BadRequestException(
        'El motivo del rechazo no puede exceder 500 caracteres',
      );
    }

    return this.executeLoteActionWithParams(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_regresar_tienda_rechazar_lote',
      auditAction: 'ORD_RECHAZAR_REGRESAR_TIENDA_LOTE',
      fallbackError:
        'No se pudo rechazar la recepción. Verifique el motivo, el estatus y los permisos.',
      singleMessage:
        '1 ORD rechazada y devuelta al taller (estatus 5, según su tipo registrado)',
      pluralMessagePrefix:
        'ORDs rechazadas y devueltas al taller (estatus 5, según su tipo registrado)',
      notFoundMessage: 'No fue posible procesar las ORDs rechazadas',
      extraSqlParams: '@MOTIVO=@1,',
      extraParams: [motivo],
      auditMetadataExtra: { motivo },
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
      singleMessage: '1 ORD recibida (5->7 interno / 9->10 externo)',
      pluralMessagePrefix: 'ORDs recibidas (5->7 interno / 9->10 externo)',
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
    dto: EntregarOrdBatchDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    await this.assertActionPermission('SCAN_ENTREGAR', user);
    return this.executeLoteActionWithParams(dto, user, ip, {
      spName: 'sp_ordenes_trabajo_entregar_lote',
      auditAction: 'ORD_ENTREGAR_LOTE',
      fallbackError:
        'No se pudo entregar el lote de ORDs al cliente. Verifique estado y permisos.',
      singleMessage: '1 ORD entregada a cliente (estatus 11)',
      pluralMessagePrefix: 'ORDs entregadas a cliente (estatus 11)',
      notFoundMessage: 'No fue posible procesar las ORDs para entrega',
      extraSqlParams: '@OBS=@1,@FIRMA_CLIENTE=@2,',
      extraParams: [
        this.normalizeText(dto.observaciones),
        this.normalizeText(dto.firmaCliente),
      ],
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
    const directPreview = await this.buildCambioMermaDirectPreview(
      iordRaw,
      1,
      dto.artNuevo,
      ctdCM,
      user,
    );
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
        directPreview.pvtaNuevo,
        null,
        directPreview.diferenciaEconomica,
      ],
      user,
      ip,
      'Cambio de material aplicado',
      'ORD_CAMBIO_MATERIAL',
      '@ART_NUEVO=@1,@MOTIVO=@2,@LABOR=@3,@DOCDIF=@4,@MOTR=@5,@CTD_C_M=@6,@PVTA_NUEVO=@7,@IORD_NUEVA=@8,@DIFERENCIA_SELLADA=@9,',
    );
    await this.persistDirectCambioMermaSnapshot(
      result.data,
      directPreview,
      this.auditActor(user),
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
    const directPreview = await this.buildCambioMermaDirectPreview(
      iordRaw,
      2,
      dto.artNuevo,
      ctdCM,
      user,
    );
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
        directPreview.pvtaNuevo,
        null,
        directPreview.diferenciaEconomica,
      ],
      user,
      ip,
      'Merma procesada',
      'ORD_MERMA',
      '@CANTIDAD_MERMA=@1,@MOTIVO=@2,@CREAR_NUEVA_ORD=@3,@MOTR=@4,@ART_NUEVO=@5,@CTD_C_M=@6,@PVTA_NUEVO=@7,@IORD_NUEVA=@8,@DIFERENCIA_SELLADA=@9,',
    );
    if (dto.crearNuevaOrd == null || dto.crearNuevaOrd) {
      await this.persistDirectCambioMermaSnapshot(
        result.data,
        directPreview,
        this.auditActor(user),
      );
    }
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
    const lookupRequestedSuc = this.resolveRequestedSucForCodeLookup(
      scope,
      code,
    );
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
        lookupRequestedSuc,
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
    this.assertOrdTipoMatchesRole(roleCode, row.TIPO, iord);

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

    let rows: unknown[];
    try {
      rows = await this.dataSource.query(sql, [
        iord,
        ...extraParams,
        actor,
        ip,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        scope.requestedSuc,
      ]);
    } catch (error) {
      throw this.mapError(error, `No fue posible procesar la ORD ${iord}`);
    }

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
    const isInventoryOrdReviewer =
      roleCode === 'ANALISTA_INV' || roleCode === 'INVJEF';
    const rows = isInventoryOrdReviewer
      ? await this.dataSource.query(`
          SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) AS SUC
          FROM dbo.DAT_SUC
          WHERE NULLIF(LTRIM(RTRIM(ISNULL(SUC, ''))), '') IS NOT NULL
        `)
      : await this.dataSource.query(
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
      ANULAR: [
        'JEF_TALLER',
        'AUX_JEF_TALLER',
        'AUX_JEFE_TALLER',
        'AUXILIAR_JEF_TALLER',
        'AUXILIAR_JEFE_TALLER',
      ],
      ENVIAR: ['JEF_TALLER', 'ANALISTA_ORD'],
      ASIGNAR: ['JEF_TALLER', 'ENC_MAQUILA', 'ENC_BISEL'],
      TRABAJO_TERMINADO: ['JEF_TALLER', 'ENC_MAQUILA', 'ENC_BISEL'],
      REGRESAR_INCIDENCIA: ['JEF_TALLER', 'ENC_MAQUILA', 'ENC_BISEL'],
      REGRESAR_TIENDA: ['JEF_TALLER', 'ANALISTA_ORD'],
      ASIGNAR_LABORATORIO: ['JEF_TALLER', 'ANALISTA_ORD'],
      RECIBIR: ['JEF_TALLER', 'ENC_MAQUILA', 'ENC_BISEL'],
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
        'ANALISTA',
        'ENC_MAQUILA',
        'ENC_BISEL',
        'AUX_JEF_TALLER',
        'AUX_JEFE_TALLER',
        'AUXILIAR_JEF_TALLER',
        'AUXILIAR_JEFE_TALLER',
      ],
      SCAN_RECIBIR: ['JEF_TALLER', 'ANALISTA_ORD', 'ENC_MAQUILA', 'ENC_BISEL'],
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

  private async isControlCalidadRole(user: JwtPayload) {
    const userId = Number(user?.sub ?? 0);
    if (!Number.isFinite(userId) || userId <= 0) return false;
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 1 AS ENABLED
      FROM dbo.USUARIO u
      LEFT JOIN dbo.ROL r ON r.IDROL = u.IDROL
      WHERE u.IDUSUARIO = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(r.NOMBRE, '')))) LIKE '%CONTROL%CALIDAD%'
      `,
      [userId],
    );
    return this.firstRow(rows) != null;
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

  private async resolveAsignadoSharedSucs(sucRaw: string) {
    const suc = this.normalizeUpper(sucRaw);
    if (!suc) return [] as string[];
    if (!(await this.hasTable('DAT_SUC_COLAB_ACCESO'))) return [];
    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(SUC_ORIGEN, '')))) AS SUC
      FROM dbo.DAT_SUC_COLAB_ACCESO
      WHERE UPPER(LTRIM(RTRIM(ISNULL(SUC_DESTINO, '')))) = UPPER(@0)
        AND ISNULL(TRY_CONVERT(INT, ACTIVO), 1) = 1
      `,
      [suc],
    );
    return this.normalizeUnique(
      (Array.isArray(rows) ? rows : []).map(
        (row: Record<string, unknown>) => row.SUC,
      ),
    );
  }

  private canAccessAsignadoOptions(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return [
      'JEF_TALLER',
      'AUX_JEF_TALLER',
      'AUX_JEFE_TALLER',
      'AUXILIAR_JEF_TALLER',
      'AUXILIAR_JEFE_TALLER',
      'ANALISTA_ORD',
      'ANALISTA',
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
      const usernamePlaceholders = missingIds
        .map((_, idx) => `@${idx}`)
        .join(',');
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
    if (
      query.deferResults === true &&
      (query.reportMode === true || panelMode === 'estado')
    ) {
      return true;
    }
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

    const roleCode = this.normalizeUpper(roleCodeRaw);
    // Inventarios comparte el panel operativo de DAT_JAO_ORD, pero su matriz
    // puede no estar sembrada en una base donde ya existen filas para otros
    // roles. Conserva el alcance funcional de revisión de cambio/merma y deja
    // que includeNullFlow habilite la cola de autorización pendiente.
    if (
      panelMode === 'operativo' &&
      (roleCode === 'ANALISTA_INV' || roleCode === 'INVJEF')
    ) {
      return [9.1, 9.2, 9.3];
    }

    if (tableExists) {
      const panelConfigured =
        await this.hasFlowVisibilityPanelConfig(panelMode);
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

    if (panelMode === 'estado') {
      return roleCode === 'JEF_TALLER' ||
        roleCode === 'ANALISTA_ORD' ||
        roleCode === 'ANALISTA'
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
    if (roleCode === 'ENC_MAQUILA' || roleCode === 'ENC_BISEL') {
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
    flowOverride?: string,
  ) {
    if (!items.length) return items;
    const allowed = new Set(
      allowedStatusCodes.map((code) => this.formatStatusCode(code)),
    );
    return items.filter((item) => {
      const flow =
        flowOverride === undefined
          ? this.toFloat(item.ESTSEGU)
          : this.toFloat(flowOverride);
      if (flow == null) return includeNullFlow;
      return allowed.has(this.formatStatusCode(flow));
    });
  }

  private shouldIncludeNullFlow(
    user: JwtPayload,
    roleCodeRaw: string,
    panelMode: 'operativo' | 'estado' | 'anulados' | 'entregadas',
  ) {
    if (panelMode !== 'operativo' && panelMode !== 'estado') return false;
    if (this.isAdmin(user)) return true;

    const roleCode = this.normalizeUpper(roleCodeRaw);
    return (
      roleCode === 'JEF_TALLER' ||
      roleCode === 'ANALISTA_ORD' ||
      (panelMode === 'operativo' &&
        (roleCode === 'ANALISTA_INV' || roleCode === 'INVJEF'))
    );
  }

  private async attachFlowHistory(
    items: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (!items.length) return items;

    const existingHistory = new Map<string, string>();
    for (const item of items) {
      const iord = this.normalizeUpper(item.IORD ?? '');
      const history = this.normalizeText(item.FLUJO_HISTORIAL);
      if (iord && history) existingHistory.set(iord, history);
    }

    const historyByIord = new Map<string, string>();
    const historyItemsByIord = new Map<
      string,
      Array<{ ESTSEGU: number | null; ESTSEGU_DESC: string }>
    >();
    if (await this.hasTable('PV_CTR_ORDS_FLUJO_HIST')) {
      const iords = this.normalizeDistinctIords(items.map((item) => item.IORD));
      if (iords.length) {
        const placeholders = iords.map((_, index) => `@${index}`).join(',');
        const rows = await this.dataSource.query(
          `
          SELECT
            UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '')))) AS IORD,
            TRY_CONVERT(FLOAT, h.ESTSEGU) AS ESTSEGU,
            LTRIM(RTRIM(ISNULL(e.TIPO, ''))) AS ESTSEGU_DESC,
            MIN(h.FCNR) AS PRIMERA_FCNR,
            MIN(h.ID) AS ORDEN
          FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
          LEFT JOIN dbo.DAT_EST_ORD e
            ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, h.ESTSEGU)
          WHERE UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '')))) IN (${placeholders})
          GROUP BY
            UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '')))),
            TRY_CONVERT(FLOAT, h.ESTSEGU),
            LTRIM(RTRIM(ISNULL(e.TIPO, '')))
          ORDER BY IORD, PRIMERA_FCNR, ORDEN
          `,
          iords,
        );

        const partsByIord = new Map<string, string[]>();
        for (const row of Array.isArray(rows) ? rows : []) {
          const record = row as Record<string, unknown>;
          const iord = this.normalizeUpper(record.IORD ?? '');
          if (!iord) continue;
          const flow = this.toFloat(record.ESTSEGU);
          const code = flow == null ? 'SIN FLUJO' : this.formatStatusCode(flow);
          const description = this.normalizeText(record.ESTSEGU_DESC) ?? '';
          const label = `${code} ${description}`.trim();
          const parts = partsByIord.get(iord) ?? [];
          if (!parts.includes(label)) parts.push(label);
          partsByIord.set(iord, parts);
          const historyItems = historyItemsByIord.get(iord) ?? [];
          if (
            !historyItems.some((historyItem) => historyItem.ESTSEGU === flow)
          ) {
            historyItems.push({ ESTSEGU: flow, ESTSEGU_DESC: description });
          }
          historyItemsByIord.set(iord, historyItems);
        }
        for (const [iord, parts] of partsByIord) {
          if (parts.length) historyByIord.set(iord, parts.join(' -> '));
        }
      }
    }

    return items.map((item) => {
      const iord = this.normalizeUpper(item.IORD ?? '');
      const currentFlow = this.toFloat(item.ESTSEGU);
      const currentCode =
        currentFlow == null ? 'SIN FLUJO' : this.formatStatusCode(currentFlow);
      const currentDescription = this.normalizeText(item.ESTSEGU_DESC) ?? '';
      const currentLabel = `${currentCode} ${currentDescription}`.trim();
      const historyItems = historyItemsByIord.get(iord) ?? [
        { ESTSEGU: currentFlow, ESTSEGU_DESC: currentDescription },
      ];
      return {
        ...item,
        FLUJO_HISTORIAL:
          historyByIord.get(iord) ?? existingHistory.get(iord) ?? currentLabel,
        FLUJO_HISTORIAL_ITEMS: historyItems,
      };
    });
  }

  private async attachFlowHistorySafely(
    items: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    try {
      return await this.attachFlowHistory(items);
    } catch (error) {
      this.logger.error(
        'No se pudo cargar el historial de flujos de Consulta Estado.',
        error instanceof Error ? error.stack : String(error),
      );
      return items.map((item) => {
        const flow = this.toFloat(item.ESTSEGU);
        const code = flow == null ? 'SIN FLUJO' : this.formatStatusCode(flow);
        const description = this.normalizeText(item.ESTSEGU_DESC) ?? '';
        const label = `${code} ${description}`.trim();
        return {
          ...item,
          FLUJO_HISTORIAL: label,
          FLUJO_HISTORIAL_ITEMS: [{ ESTSEGU: flow, ESTSEGU_DESC: description }],
        };
      });
    }
  }

  private async attachAnulacionMotivos(
    items: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const iords = this.normalizeDistinctIords(items.map((item) => item.IORD));
    if (!iords.length) return items;
    const predicates = iords.map(
      (_, index) => `METADATA_JSON LIKE '%' + @${index} + '%'`,
    );
    let rows: unknown[] = [];
    try {
      rows = await this.dataSource.query(
        `
        SELECT IDLOG, METADATA_JSON
        FROM dbo.AUDIT_LOG
        WHERE ACTION = 'ORD_ANULAR_LOTE'
          AND (${predicates.join(' OR ')})
        ORDER BY IDLOG DESC
        `,
        iords,
      );
    } catch {
      return items;
    }
    const motivos = new Map<string, string>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const metadataText = this.normalizeText(
        (row as Record<string, unknown>).METADATA_JSON,
      );
      if (!metadataText) continue;
      let metadata: Record<string, unknown>;
      try {
        const parsed = JSON.parse(metadataText);
        if (!parsed || typeof parsed !== 'object') continue;
        metadata = parsed as Record<string, unknown>;
      } catch {
        continue;
      }
      const motivo = this.normalizeText(metadata.motivo);
      if (!motivo || !Array.isArray(metadata.iords)) continue;
      for (const value of metadata.iords) {
        const iord = this.normalizeUpper(value);
        if (iord && !motivos.has(iord)) motivos.set(iord, motivo);
      }
    }
    return items.map((item) => ({
      ...item,
      MOTIVO: motivos.get(this.normalizeUpper(item.IORD)) ?? '',
    }));
  }

  private async attachFlowMovementActors(
    items: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (
      !items.length ||
      !(await this.hasTable('PV_CTR_ORDS_FLUJO_HIST')) ||
      !(await this.hasTable('AUDIT_LOG'))
    ) {
      return items.map((item) => ({ ...item, QUIEN_REALIZO: 'Sin registro' }));
    }

    const iords = this.normalizeDistinctIords(items.map((item) => item.IORD));
    if (!iords.length) return items;
    const placeholders = iords.map((_, index) => `@${index}`).join(',');
    const auditPredicates = iords.map(
      (_, index) => `a.METADATA_JSON LIKE '%' + @${index} + '%'`,
    );
    const rows = await this.dataSource.query(
      `
      WITH FlowEvents AS (
        SELECT
          h.ID,
          UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '')))) AS IORD,
          TRY_CONVERT(FLOAT, h.ESTSEGU) AS ESTSEGU,
          h.FCNR,
          LEAD(h.FCNR) OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(ISNULL(h.IORD, ''))))
            ORDER BY h.FCNR, h.ID
          ) AS NEXT_FCNR
        FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
        WHERE UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '')))) IN (${placeholders})
      ), AuditEvents AS (
        SELECT
          a.IDLOG,
          a.FCNR,
          UPPER(LTRIM(RTRIM(ISNULL(j.IORD, '')))) AS IORD,
          TRY_CONVERT(FLOAT, j.ESTSEGU) AS ESTSEGU,
          COALESCE(
            NULLIF(LTRIM(RTRIM(CONCAT(
              ISNULL(u.NOMBRE, ''),
              CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(u.APELLIDOS, ''))), '') IS NULL THEN '' ELSE ' ' + LTRIM(RTRIM(u.APELLIDOS)) END
            ))), ''),
            NULLIF(LTRIM(RTRIM(ISNULL(u.USERNAME, ''))), ''),
            CONVERT(NVARCHAR(100), a.IDUSUARIO)
          ) AS QUIEN_REALIZO
        FROM dbo.AUDIT_LOG a
        LEFT JOIN dbo.USUARIO u
          ON TRY_CONVERT(INT, u.IDUSUARIO) = TRY_CONVERT(INT, a.IDUSUARIO)
        CROSS APPLY OPENJSON(JSON_QUERY(a.METADATA_JSON, '$.result'))
          WITH (
            IORD NVARCHAR(255) '$.IORD',
            ESTSEGU FLOAT '$.ESTSEGU'
          ) j
        WHERE UPPER(LTRIM(RTRIM(ISNULL(a.MODULO, '')))) = 'ORDENES-TRABAJO'
          AND UPPER(LTRIM(RTRIM(ISNULL(a.ENTIDAD, '')))) = 'PV_CTR_ORDS'
          AND (
            LTRIM(RTRIM(ISNULL(a.ENTIDAD_ID, ''))) IN (${placeholders})
            OR (${auditPredicates.join(' OR ')})
          )
          AND NULLIF(LTRIM(RTRIM(ISNULL(j.IORD, ''))), '') IS NOT NULL
      )
      SELECT
        h.IORD,
        h.ESTSEGU,
        h.FCNR,
        COALESCE(actor.QUIEN_REALIZO, 'Sin registro') AS QUIEN_REALIZO
      FROM FlowEvents h
      OUTER APPLY (
        SELECT TOP 1 a.QUIEN_REALIZO
        FROM AuditEvents a
        WHERE a.IORD = h.IORD
          AND (
            a.ESTSEGU = h.ESTSEGU
            OR (a.ESTSEGU IS NULL AND h.ESTSEGU IS NULL)
          )
          AND a.FCNR >= h.FCNR
          AND (h.NEXT_FCNR IS NULL OR a.FCNR <= h.NEXT_FCNR)
        ORDER BY DATEDIFF_BIG(MILLISECOND, h.FCNR, a.FCNR), a.IDLOG
      ) actor
      ORDER BY h.IORD, h.FCNR, h.ID
      `,
      iords,
    );

    const actorsByIordFlow = new Map<string, Map<string, string[]>>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const record = row as Record<string, unknown>;
      const iord = this.normalizeUpper(record.IORD);
      const flow = this.toFloat(record.ESTSEGU);
      if (!iord) continue;
      const flowKey = flow == null ? 'NULL' : this.formatStatusCode(flow);
      const byFlow = actorsByIordFlow.get(iord) ?? new Map<string, string[]>();
      const actors = byFlow.get(flowKey) ?? [];
      actors.push(this.normalizeText(record.QUIEN_REALIZO) ?? 'Sin registro');
      byFlow.set(flowKey, actors);
      actorsByIordFlow.set(iord, byFlow);
    }

    return items.map((item) => {
      const iord = this.normalizeUpper(item.IORD);
      const flow = this.toFloat(item.ESTSEGU);
      const flowKey = flow == null ? 'NULL' : this.formatStatusCode(flow);
      const actualFlow = this.toFloat(item.ESTSEGU_ACTUAL);
      const hasActualFlow = Object.prototype.hasOwnProperty.call(
        item,
        'ESTSEGU_ACTUAL',
      );
      const isCurrentFlow =
        !hasActualFlow ||
        (actualFlow == null ? flow == null : actualFlow === flow);
      const actors = iord
        ? (actorsByIordFlow.get(iord)?.get(flowKey) ?? [])
        : [];
      return {
        ...item,
        QUIEN_REALIZO:
          (isCurrentFlow ? actors[actors.length - 1] : actors[0]) ??
          'Sin registro',
      };
    });
  }

  private async attachFlowDurations(
    items: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const noHistory = () =>
      items.map((item) => ({
        ...item,
        TIEMPO_FLUJO: 'Sin historial',
        TIEMPO_POR_FLUJO: 'Sin historial',
      }));
    if (!items.length) return noHistory();
    let hasFlowHistoryTable = false;
    try {
      hasFlowHistoryTable = await this.hasTable('PV_CTR_ORDS_FLUJO_HIST');
    } catch (error) {
      this.logger.error(
        'No se pudo verificar el historial para calcular tiempos de flujo.',
        error instanceof Error ? error.stack : String(error),
      );
      return noHistory();
    }
    if (!hasFlowHistoryTable) {
      return noHistory();
    }

    const iords = this.normalizeDistinctIords(items.map((item) => item.IORD));
    if (!iords.length) return noHistory();
    const placeholders = iords.map((_, index) => `@${index}`).join(',');
    let rows: unknown;
    try {
      rows = await this.dataSource.query(
        `
      WITH FlowEvents AS (
        SELECT
          UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '')))) AS IORD,
          TRY_CONVERT(FLOAT, h.ESTSEGU) AS ESTSEGU,
          LTRIM(RTRIM(ISNULL(e.TIPO, ''))) AS ESTSEGU_DESC,
          h.FCNR,
          LEAD(h.FCNR) OVER (
            PARTITION BY UPPER(LTRIM(RTRIM(ISNULL(h.IORD, ''))))
            ORDER BY h.FCNR, h.ID
          ) AS NEXT_FCNR
        FROM dbo.PV_CTR_ORDS_FLUJO_HIST h
        LEFT JOIN dbo.DAT_EST_ORD e
          ON TRY_CONVERT(FLOAT, e.ESTA) = TRY_CONVERT(FLOAT, h.ESTSEGU)
        WHERE UPPER(LTRIM(RTRIM(ISNULL(h.IORD, '')))) IN (${placeholders})
      )
      SELECT
        flowEvent.IORD,
        flowEvent.ESTSEGU,
        flowEvent.ESTSEGU_DESC,
        DATEDIFF_BIG(
          SECOND,
          flowEvent.FCNR,
          CASE
            WHEN flowEvent.NEXT_FCNR IS NOT NULL THEN flowEvent.NEXT_FCNR
            WHEN flowEvent.ESTSEGU = TRY_CONVERT(FLOAT, actual.ESTSEGU)
              OR (flowEvent.ESTSEGU IS NULL AND TRY_CONVERT(FLOAT, actual.ESTSEGU) IS NULL)
              THEN GETDATE()
            ELSE NULL
          END
        ) AS SEGUNDOS_EN_FLUJO
      FROM FlowEvents flowEvent
      LEFT JOIN dbo.PV_CTR_ORDS actual
        ON UPPER(LTRIM(RTRIM(ISNULL(actual.IORD, '')))) = flowEvent.IORD
      ORDER BY flowEvent.IORD, flowEvent.FCNR
      `,
        iords,
      );
    } catch (error) {
      this.logger.error(
        'No se pudo calcular el tiempo por flujo de Consulta Estado.',
        error instanceof Error ? error.stack : String(error),
      );
      return items.map((item) => ({
        ...item,
        TIEMPO_FLUJO: 'Tiempo no disponible',
        TIEMPO_POR_FLUJO: 'Tiempo no disponible',
      }));
    }

    const durationsByIord = new Map<string, string[]>();
    const durationsByIordAndFlow = new Map<string, Map<string, string[]>>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const record = row as Record<string, unknown>;
      const iord = this.normalizeUpper(record.IORD);
      if (!iord) continue;
      const flowValue = this.toFloat(record.ESTSEGU);
      const flowCode =
        flowValue == null ? 'SIN FLUJO' : this.formatStatusCode(flowValue);
      const flowDescription = this.normalizeText(record.ESTSEGU_DESC);
      const flowLabel = `${flowCode}${flowDescription ? ` ${flowDescription}` : ''}`;
      const seconds = Number(record.SEGUNDOS_EN_FLUJO);
      if (!Number.isFinite(seconds) || seconds < 0) continue;
      const duration = this.formatFlowDuration(seconds);
      const entries = durationsByIord.get(iord) ?? [];
      entries.push(`${flowLabel}: ${duration}`);
      durationsByIord.set(iord, entries);
      const flowKey =
        flowValue == null ? 'NULL' : this.formatStatusCode(flowValue);
      const byFlow =
        durationsByIordAndFlow.get(iord) ?? new Map<string, string[]>();
      const flowDurations = byFlow.get(flowKey) ?? [];
      flowDurations.push(duration);
      byFlow.set(flowKey, flowDurations);
      durationsByIordAndFlow.set(iord, byFlow);
    }

    return items.map((item) => {
      const iord = this.normalizeUpper(item.IORD);
      const flowValue = this.toFloat(item.ESTSEGU);
      const flowKey =
        flowValue == null ? 'NULL' : this.formatStatusCode(flowValue);
      return {
        ...item,
        TIEMPO_FLUJO:
          (iord
            ? durationsByIordAndFlow.get(iord)?.get(flowKey)?.join(' / ')
            : null) ?? 'Sin historial',
        TIEMPO_POR_FLUJO:
          (iord ? durationsByIord.get(iord)?.join(' | ') : null) ??
          'Sin historial',
      };
    });
  }

  private formatFlowDuration(totalSeconds: number) {
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes === 0) return totalSeconds > 0 ? '<1 min' : '0 min';
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    return [
      ...(days ? [`${days} d`] : []),
      ...(hours ? [`${hours} h`] : []),
      ...(minutes ? [`${minutes} min`] : []),
    ].join(' ');
  }

  private expandFlowHistoryItems(
    items: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    return items.flatMap((item) => {
      const historyItems = Array.isArray(item.FLUJO_HISTORIAL_ITEMS)
        ? (item.FLUJO_HISTORIAL_ITEMS as Array<Record<string, unknown>>)
        : [];
      if (!historyItems.length) {
        const copy = { ...item };
        delete copy.FLUJO_HISTORIAL_ITEMS;
        return [copy];
      }
      return historyItems.map((historyItem) => {
        const copy = { ...item };
        copy.ESTSEGU_ACTUAL = item.ESTSEGU;
        copy.ESTSEGU_ACTUAL_DESC = item.ESTSEGU_DESC;
        copy.ESTSEGU = historyItem.ESTSEGU ?? null;
        copy.ESTSEGU_DESC = historyItem.ESTSEGU_DESC ?? '';
        delete copy.FLUJO_HISTORIAL_ITEMS;
        return copy;
      });
    });
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
        (
          item,
        ): item is {
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
              item.tipo === tipo &&
              this.normalizeUpper(item.label) === motivoUpper,
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
    const allowCambioMaterialSinFlujo = tipo === 1 && flow == null;
    if (
      (flow == null || Math.abs(flow - requiredFlow) > 0.0001) &&
      !allowFinalized &&
      !allowCambioMaterialSinFlujo
    ) {
      const flowLabel = this.normalizeText(row.DESCFLUJO) ?? 'SIN FLUJO';
      const flowText = flow == null ? 'SIN FLUJO' : this.formatStatusCode(flow);
      throw new BadRequestException(
        `La ORD ${iord} debe estar en estatus ${this.formatStatusCode(requiredFlow)} (${requiredFlowLabel}). Estado actual: ${flowText} ${flowLabel}`.trim(),
      );
    }

    const tipom = this.toInt(row.TIPOM) ?? this.toInt(row.TPOM) ?? 0;
    if (tipom !== tipo && !allowCambioMaterialSinFlujo) {
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
      tipo,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal, tipo);

    const artNuevo =
      this.normalizeText(stagingRow?.ART_NUEVO) ??
      this.normalizeText(originalRow.ART) ??
      '';

    const originalArtInfo = await this.resolveArticuloDatArt(suc, artOriginal);
    const nuevoArtInfo = await this.resolveArticuloDatArt(suc, artNuevo);
    const sameArticulo =
      this.normalizeUpper(artNuevo) === this.normalizeUpper(artOriginal);
    const draftDesc = sameArticulo
      ? (nuevoArtInfo?.des ??
        this.normalizeText(originalRow.DESCART) ??
        this.normalizeText(originalRow.DESCRT) ??
        '')
      : (nuevoArtInfo?.des ?? '');

    const baseEconomicaOriginal =
      await this.resolveCambioMermaOriginalEconomicBase(
        iord,
        idfol,
        artOriginal,
        ctdOriginal,
        originalArtInfo?.pvta ?? 0,
      );
    const precioNuevo = await this.resolveCambioMermaNewUnitPrice(
      suc,
      artNuevo,
      this.toFloat(stagingRow?.PVTA_NUEVO),
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
    const originalBase = this.roundMoney(baseEconomicaOriginal.baseTotal);
    const nuevoBase = this.roundMoney(precioNuevo * ctdCM);
    const originalBaseContable =
      ctdOriginal > 0
        ? this.roundMoney(originalBase * (ctdCM / ctdOriginal))
        : 0;
    const nuevoBaseContable = this.roundMoney(precioNuevo * ctdCM);

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
    const diferenciaEconomica = this.roundMoney(
      montosNuevoContable.total - montosOriginalContable.total,
    );
    const generaAfectacionContable = Math.abs(diferenciaEconomica) >= 0.009;
    const priceDifferenceMessage =
      sameArticulo && generaAfectacionContable
        ? baseEconomicaOriginal.source === 'PV_TICKET_LOG' ||
          baseEconomicaOriginal.source === 'FACT_TICKET_SHP'
          ? 'Diferencia originada por precio modificado en PV respecto al precio actual de catálogo.'
          : 'Diferencia originada por variación entre el precio histórico de la ORD y el precio actual de catálogo.'
        : '';

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
      originalPriceSource: baseEconomicaOriginal.source,
      originalPriceWarning: baseEconomicaOriginal.warning,
      newPriceSource: 'DAT_ART',
      priceDifferenceMessage,
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
        PVTA_UNITARIO_BASE: baseEconomicaOriginal.unitPrice,
        PVTAT_BASE: originalBase,
        PRECIO_ORIGEN: baseEconomicaOriginal.source,
        PRECIO_ADVERTENCIA: baseEconomicaOriginal.warning,
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
        DES: draftDesc,
        CTD: ctdCM,
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
    const ctdCM = this.resolveCtdCM(
      staging.CTD_C_M,
      original.row.CTD_C_M,
      ctdOriginal,
      tipo,
    );
    this.assertCtdCMCompatible(ctdCM, ctdOriginal, tipo);

    const suc = this.normalizeText(original.row.SUC) ?? '';
    const artOriginal = this.normalizeText(original.row.ART) ?? '';
    const artNuevo = this.normalizeText(staging.ART_NUEVO) ?? artOriginal;
    if (tipo === 1) {
      if (!artNuevo) {
        throw new BadRequestException(
          'Debe existir artículo nuevo en la captura para cambio material.',
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
    pvtaNuevo = await this.resolveCambioMermaNewUnitPrice(
      suc,
      artNuevo,
      pvtaNuevo,
    );
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
          sealedDiff,
        ],
        user,
        ip,
        'Cambio de material aplicado',
        'ORD_CAMBIO_MATERIAL',
        '@ART_NUEVO=@1,@MOTIVO=@2,@LABOR=@3,@DOCDIF=@4,@MOTR=@5,@CTD_C_M=@6,@PVTA_NUEVO=@7,@IORD_NUEVA=@8,@DIFERENCIA_SELLADA=@9,',
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
          sealedDiff,
        ],
        user,
        ip,
        'Merma procesada',
        'ORD_MERMA',
        '@CANTIDAD_MERMA=@1,@MOTIVO=@2,@CREAR_NUEVA_ORD=@3,@MOTR=@4,@ART_NUEVO=@5,@CTD_C_M=@6,@PVTA_NUEVO=@7,@IORD_NUEVA=@8,@DIFERENCIA_SELLADA=@9,',
      );
    }

    const finalNewIord = this.normalizeText(result.data.IORD_NUEVA) ?? nvaIord;
    const finalDiff =
      this.toFloat(result.data.DIFERENCIA_ECONOMICA) ?? sealedDiff ?? 0;

    await this.normalizeCambioMermaNewOrdRecord(finalNewIord, artNuevo, ctdCM);
    if (tipo === 2) {
      await this.dataSource.query(
        `
        UPDATE nueva
        SET nueva.ASIGN = origen.ASIGN,
            nueva.FCNMOD = GETDATE()
        FROM dbo.PV_CTR_ORDS nueva
        INNER JOIN dbo.PV_CTR_ORDS origen
          ON UPPER(LTRIM(RTRIM(ISNULL(origen.IORD, '')))) = UPPER(@1)
        WHERE UPPER(LTRIM(RTRIM(ISNULL(nueva.IORD, '')))) = UPPER(@0)
        `,
        [finalNewIord, iord],
      );
    }
    await this.upsertCambioMermaPriceSnapshot({
      iord: finalNewIord,
      sourceIord: iord,
      idfol: this.normalizeText(original.row.IDFOL) ?? '',
      suc,
      art: artNuevo,
      ctd: ctdCM,
      unitPrice: pvtaNuevo,
      source: 'DAT_ART',
      tipoTran: this.resolveCambioMermaTipoTran(
        original.row.ORIGEN_AUT ?? original.row.AUT_FOLIO ?? original.row.AUT,
      ),
      ivaIntegrado: this.toInt(original.row.IVA_INTEGRADO),
      rqfac: this.resolveCambioMermaRqfac(original.row),
      actor,
    });
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

  private async buildCambioMermaDirectPreview(
    iordRaw: string,
    tipo: number,
    artNuevoRaw: string | null | undefined,
    ctdCM: number,
    user: JwtPayload,
  ) {
    const iord = this.requireIord(iordRaw);
    const original = await this.fetchCambioMermaOriginalContext(
      iord,
      user,
      tipo,
    );
    const suc = this.normalizeText(original.row.SUC) ?? '';
    const artOriginal = this.normalizeText(original.row.ART) ?? '';
    const artNuevo = this.normalizeText(artNuevoRaw) ?? artOriginal;
    const pvtaNuevo = await this.resolveCambioMermaNewUnitPrice(
      suc,
      artNuevo,
      null,
    );
    const context = await this.buildCambioMermaContextResponse(
      iord,
      tipo,
      original.row,
      {
        ART_NUEVO: artNuevo,
        PVTA_NUEVO: pvtaNuevo,
        CTD_C_M: ctdCM,
      },
    );
    return {
      iord,
      original,
      suc,
      artNuevo,
      ctdCM,
      pvtaNuevo,
      diferenciaEconomica: this.toFloat(context.diferenciaEconomica) ?? 0,
    };
  }

  private async persistDirectCambioMermaSnapshot(
    resultData: Record<string, unknown>,
    preview: {
      iord: string;
      original: CambioMermaOriginalContext;
      suc: string;
      artNuevo: string;
      ctdCM: number;
      pvtaNuevo: number;
    },
    actor: string,
  ) {
    const newIord = this.normalizeText(resultData.IORD_NUEVA);
    if (!newIord) return;

    await this.upsertCambioMermaPriceSnapshot({
      iord: newIord,
      sourceIord: preview.iord,
      idfol: this.normalizeText(preview.original.row.IDFOL) ?? '',
      suc: preview.suc,
      art: preview.artNuevo,
      ctd: preview.ctdCM,
      unitPrice: preview.pvtaNuevo,
      source: 'DAT_ART',
      tipoTran: this.resolveCambioMermaTipoTran(
        preview.original.row.ORIGEN_AUT ??
          preview.original.row.AUT_FOLIO ??
          preview.original.row.AUT,
      ),
      ivaIntegrado: this.toInt(preview.original.row.IVA_INTEGRADO),
      rqfac: this.resolveCambioMermaRqfac(preview.original.row),
      actor,
    });
  }

  private async resolveCambioMermaOriginalEconomicBase(
    iordRaw: string,
    idfolRaw: string,
    artRaw: string,
    ctdOriginalRaw: number,
    fallbackUnitPriceRaw: number,
  ): Promise<CambioMermaEconomicBase> {
    const iord = this.normalizeText(iordRaw) ?? '';
    const idfol = this.normalizeText(idfolRaw) ?? '';
    const art = this.normalizeText(artRaw) ?? '';
    const ctdOriginal = this.toFloat(ctdOriginalRaw) ?? 0;
    const fallbackUnitPrice = this.toFloat(fallbackUnitPriceRaw) ?? 0;

    if (await this.hasTable('PV_ORD_CAMBIO_MERMA_PRECIO')) {
      const snapshotRows = await this.dataSource.query(
        `
        SELECT TOP 1
          TRY_CONVERT(FLOAT, p.PVTA_UNITARIO) AS PVTA_UNITARIO,
          TRY_CONVERT(FLOAT, p.PVTAT_BASE) AS PVTAT_BASE,
          LTRIM(RTRIM(ISNULL(p.ORIGEN_PRECIO, 'SNAPSHOT_ORD'))) AS ORIGEN_PRECIO
        FROM dbo.PV_ORD_CAMBIO_MERMA_PRECIO p
        WHERE UPPER(LTRIM(RTRIM(ISNULL(p.IORD, '')))) = UPPER(@0)
        ORDER BY ISNULL(p.FCN_MOD, p.FCN_ALT) DESC
        `,
        [iord],
      );
      const snapshot = this.firstRow(snapshotRows);
      const snapshotBase = this.toFloat(snapshot?.PVTAT_BASE);
      if (snapshotBase != null && snapshotBase >= 0) {
        const snapshotUnit =
          this.toFloat(snapshot?.PVTA_UNITARIO) ??
          (ctdOriginal > 0 ? snapshotBase / ctdOriginal : 0);
        return {
          unitPrice: this.roundMoney(snapshotUnit),
          baseTotal: this.roundMoney(snapshotBase),
          source: this.normalizeText(snapshot?.ORIGEN_PRECIO) ?? 'SNAPSHOT_ORD',
          warning: null,
        };
      }
    }

    if (await this.hasTable('PV_TICKET_LOG')) {
      const ticketRows = await this.dataSource.query(
        `
        SELECT TOP 1
          TRY_CONVERT(FLOAT, t.PVTA) AS PVTA_UNITARIO,
          TRY_CONVERT(FLOAT, t.PVTAT) AS PVTAT_BASE,
          TRY_CONVERT(FLOAT, t.CTD) AS CTD_TICKET
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
      const ticket = this.firstRow(ticketRows);
      const ticketBase = this.toFloat(ticket?.PVTAT_BASE);
      if (ticketBase != null && ticketBase >= 0) {
        const ticketCtd = this.toFloat(ticket?.CTD_TICKET) ?? ctdOriginal;
        const ticketUnit =
          this.toFloat(ticket?.PVTA_UNITARIO) ??
          (ticketCtd > 0 ? ticketBase / ticketCtd : 0);
        return {
          unitPrice: this.roundMoney(ticketUnit),
          baseTotal: this.roundMoney(ticketBase),
          source: 'PV_TICKET_LOG',
          warning: null,
        };
      }
    }

    if (await this.hasTable('FACT_TICKET_SHP')) {
      const factRows = await this.dataSource.query(
        `
        SELECT TOP 1
          TRY_CONVERT(FLOAT, f.ValorUnitario) AS PVTA_UNITARIO,
          TRY_CONVERT(FLOAT, f.PVTAT) AS PVTAT_BASE,
          TRY_CONVERT(FLOAT, f.Cantidad) AS CTD_TICKET
        FROM dbo.FACT_TICKET_SHP f
        WHERE (
            UPPER(LTRIM(RTRIM(ISNULL(f.ORD, '')))) = UPPER(@0)
            OR (
              UPPER(LTRIM(RTRIM(ISNULL(f.IDFOL, '')))) = UPPER(@1)
              AND UPPER(LTRIM(RTRIM(ISNULL(f.NoIdentificacion, '')))) = UPPER(@2)
            )
          )
        ORDER BY
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(f.ORD, '')))) = UPPER(@0) THEN 0
            ELSE 1
          END,
          LTRIM(RTRIM(ISNULL(f.IDD, ''))) DESC
        `,
        [iord, idfol, art],
      );
      const fact = this.firstRow(factRows);
      const factBase = this.toFloat(fact?.PVTAT_BASE);
      if (factBase != null && factBase >= 0) {
        const factCtd = this.toFloat(fact?.CTD_TICKET) ?? ctdOriginal;
        const factUnit =
          this.toFloat(fact?.PVTA_UNITARIO) ??
          (factCtd > 0 ? factBase / factCtd : 0);
        return {
          unitPrice: this.roundMoney(factUnit),
          baseTotal: this.roundMoney(factBase),
          source: 'FACT_TICKET_SHP',
          warning: null,
        };
      }
    }

    if (await this.hasTable('PV_ORD_CAMBIO_MERMA_TMP')) {
      const parentRows = await this.dataSource.query(
        `
        SELECT TOP 1
          TRY_CONVERT(FLOAT, t.PVTA_NUEVO) AS PVTA_UNITARIO
        FROM dbo.PV_ORD_CAMBIO_MERMA_TMP t
        WHERE UPPER(LTRIM(RTRIM(ISNULL(t.NVA_IORD, '')))) = UPPER(@0)
          AND TRY_CONVERT(FLOAT, t.PVTA_NUEVO) IS NOT NULL
        ORDER BY ISNULL(t.FCN_MOD, t.FCN_ALT) DESC
        `,
        [iord],
      );
      const parent = this.firstRow(parentRows);
      const parentUnit = this.toFloat(parent?.PVTA_UNITARIO);
      if (parentUnit != null && parentUnit >= 0) {
        return {
          unitPrice: this.roundMoney(parentUnit),
          baseTotal: this.roundMoney(parentUnit * ctdOriginal),
          source: 'CAPTURA_PADRE',
          warning: null,
        };
      }
    }

    return {
      unitPrice: this.roundMoney(fallbackUnitPrice),
      baseTotal: this.roundMoney(fallbackUnitPrice * ctdOriginal),
      source: 'DAT_ART_FALLBACK',
      warning:
        'No se localizó precio histórico de la ORD; se usó precio unitario actual de catálogo por la cantidad original.',
    };
  }

  private async resolveCambioMermaNewUnitPrice(
    sucRaw: string,
    artRaw: string,
    fallback: number | null,
  ) {
    const suc = this.normalizeText(sucRaw) ?? '';
    const art = this.normalizeText(artRaw) ?? '';
    const fallbackValue = this.toFloat(fallback);
    if (
      fallbackValue != null &&
      Number.isFinite(fallbackValue) &&
      fallbackValue >= 0
    ) {
      return this.roundMoney(fallbackValue);
    }
    const artInfo = await this.resolveArticuloDatArt(suc, art);
    const value = this.toFloat(artInfo?.pvta);
    if (value != null && Number.isFinite(value) && value >= 0) {
      return this.roundMoney(value);
    }
    return 0;
  }

  private async syncCambioMermaStagingDiferencia(
    iord: string,
    tipo: number,
    diferenciaEconomica: number | null,
    actor: string,
  ) {
    if (
      !(await this.hasColumn('PV_ORD_CAMBIO_MERMA_TMP', 'DIFERENCIA_ECONOMICA'))
    ) {
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
      [iord, tipo, diferenciaEconomica, actor],
    );
  }

  private async upsertCambioMermaPriceSnapshot(options: {
    iord: string;
    sourceIord: string;
    idfol: string;
    suc: string;
    art: string;
    ctd: number;
    unitPrice: number;
    source: string;
    tipoTran: string;
    ivaIntegrado: number | null;
    rqfac: number | null;
    actor: string;
  }) {
    if (!(await this.hasTable('PV_ORD_CAMBIO_MERMA_PRECIO'))) return;

    const baseTotal = this.roundMoney(options.unitPrice * options.ctd);
    await this.dataSource.query(
      `
      MERGE dbo.PV_ORD_CAMBIO_MERMA_PRECIO AS tgt
      USING (SELECT @0 AS IORD) AS src
        ON UPPER(LTRIM(RTRIM(ISNULL(tgt.IORD, '')))) =
           UPPER(LTRIM(RTRIM(ISNULL(src.IORD, ''))))
      WHEN MATCHED THEN
        UPDATE SET
          IORD_ORIGEN = @1,
          IDFOL = @2,
          SUC = @3,
          ART = @4,
          CTD = @5,
          PVTA_UNITARIO = @6,
          PVTAT_BASE = @7,
          ORIGEN_PRECIO = @8,
          TIPO_TRAN = @9,
          IVA_INTEGRADO = @10,
          REQF = @11,
          USER_MOD = @12,
          FCN_MOD = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (
          IORD, IORD_ORIGEN, IDFOL, SUC, ART, CTD,
          PVTA_UNITARIO, PVTAT_BASE, ORIGEN_PRECIO,
          TIPO_TRAN, IVA_INTEGRADO, REQF,
          USER_ALT, FCN_ALT, USER_MOD, FCN_MOD
        )
        VALUES (
          @0, @1, @2, @3, @4, @5,
          @6, @7, @8,
          @9, @10, @11,
          @12, GETDATE(), @12, GETDATE()
        );
      `,
      [
        options.iord,
        options.sourceIord,
        options.idfol,
        options.suc,
        options.art,
        options.ctd,
        options.unitPrice,
        baseTotal,
        options.source,
        options.tipoTran,
        options.ivaIntegrado,
        options.rqfac,
        options.actor,
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
      throw new BadRequestException(
        'No se pudo generar NVA_IORD para la captura.',
      );
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
      throw new BadRequestException(
        'tipo debe ser 1 (cambio material) o 2 (merma)',
      );
    }
    return tipo;
  }

  private resolveCtdCM(
    primary: unknown,
    secondary: unknown,
    ctdOriginal: number,
    tipo: number,
  ) {
    const allowed = this.resolveAllowedCtdCM(ctdOriginal, tipo);
    const fromPrimary = this.toFloat(primary);
    if (fromPrimary != null) {
      for (const value of allowed) {
        if (Math.abs(fromPrimary - value) <= 0.0001) return value;
      }
    }
    const fromSecondary = this.toFloat(secondary);
    if (fromSecondary != null) {
      for (const value of allowed) {
        if (Math.abs(fromSecondary - value) <= 0.0001) return value;
      }
    }
    return allowed[0];
  }

  private resolveAllowedCtdCM(ctdOriginal: number, tipo: number) {
    if (Math.abs(ctdOriginal - 1) <= 0.0001) {
      return [1, 0.5];
    }
    if (Math.abs(ctdOriginal - 0.5) <= 0.0001) {
      return tipo === 1 ? [0.5, 1] : [0.5];
    }
    throw new BadRequestException(
      'La ORD origen debe tener cantidad 1 o 0.5 para procesar cambio/merma.',
    );
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

  private assertCtdCMCompatible(
    ctdCM: number,
    ctdOriginal: number,
    tipo: number,
  ) {
    const allowed = this.resolveAllowedCtdCM(ctdOriginal, tipo);
    if (!allowed.some((value) => Math.abs(ctdCM - value) <= 0.0001)) {
      if (tipo === 1) {
        throw new BadRequestException(
          'Para cambio de material, CTD_C_M solo permite 1 o 0.5.',
        );
      }
      throw new BadRequestException(
        allowed.length === 1
          ? 'CTD_C_M solo permite 0.5 cuando la ORD origen fue creada con 0.5.'
          : 'CTD_C_M solo permite 1 o 0.5 cuando la ORD origen fue creada con 1.',
      );
    }
    if (ctdOriginal <= 0) {
      throw new BadRequestException(
        'La ORD no tiene cantidad válida para procesar cambio/merma.',
      );
    }
    if (tipo !== 1 && ctdCM - ctdOriginal > 0.0001) {
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
    asign?: string | null,
    tipom?: number | null,
  ) {
    await this.dataSource.query(
      `
      UPDATE dbo.PV_CTR_ORDS
      SET
        selCtrlOrd = @1,
        CTD_C_M = @2,
        MOTR = COALESCE(@3, MOTR),
        ASIGN = COALESCE(@4, ASIGN),
        TIPOM = COALESCE(@5, TIPOM),
        FCNMOD = GETDATE()
      WHERE UPPER(LTRIM(RTRIM(ISNULL(IORD, '')))) = UPPER(@0)
      `,
      [iord, selCtrlOrd, ctdCM, motr ?? null, asign ?? null, tipom ?? null],
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

  private async normalizeCambioMermaNewOrdRecord(
    iordRaw: string,
    artNuevoRaw: string | null,
    ctdCMRaw?: number | null,
  ) {
    const iord = this.normalizeText(iordRaw);
    if (!iord) return;
    const artNuevo = this.normalizeText(artNuevoRaw);
    const ctdCM = this.toFloat(ctdCMRaw);
    await this.dataSource.query(
      `
      UPDATE o
      SET
        ART = COALESCE(NULLIF(@1, ''), o.ART),
        MAT = COALESCE(NULLIF(@1, ''), o.MAT),
        CTD = COALESCE(@2, TRY_CONVERT(FLOAT, o.CTD)),
        CTD_C_M = COALESCE(@2, TRY_CONVERT(FLOAT, o.CTD_C_M)),
        TIPOM = 0,
        MOTR = NULL,
        DESCART = COALESCE(
          NULLIF(LTRIM(RTRIM(ISNULL(a.DES, ''))), ''),
          o.DESCART
        ),
        FCNMOD = GETDATE()
      FROM dbo.PV_CTR_ORDS o
      LEFT JOIN dbo.DAT_ART a
        ON UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(o.SUC, ''))))
       AND UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) = UPPER(LTRIM(RTRIM(ISNULL(COALESCE(NULLIF(@1, ''), o.ART), ''))))
      WHERE UPPER(LTRIM(RTRIM(ISNULL(o.IORD, '')))) = UPPER(@0)
      `,
      [iord, artNuevo ?? '', ctdCM],
    );
  }

  private async resetSelCtrlOrdByIords(
    values: Array<string | null | undefined>,
  ) {
    const iords = [
      ...new Set(values.map((item) => this.normalizeText(item) ?? '')),
    ]
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
    options: {
      tipoTran: string;
      ivaIntegrado: number | null;
      rqfac: number | null;
    },
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
    const requestedSucRaw = this.normalizeText(
      sucOverride ?? scope.requestedSuc,
    );
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
          this.normalizeText((row as Record<string, unknown>)['LAB_SUC']) ??
          suc;
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
        } => item !== null,
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
    if (this.isLaboratorioDisponible(laboratorios, labor, effectiveTipo))
      return;
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
      AUX_JEF_TALLER: operationalActions,
      AUX_JEFE_TALLER: operationalActions,
      AUXILIAR_JEF_TALLER: operationalActions,
      AUXILIAR_JEFE_TALLER: operationalActions,
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
    return roleCode === 'JEF_TALLER' || roleCode === 'ANALISTA_ORD';
  }

  private canManageOrdTipoAndPrint(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return roleCode === 'JEF_TALLER' || roleCode === 'ANALISTA_ORD';
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
    const lookupRequestedSuc = this.resolveRequestedSucForCodeLookup(
      scope,
      code,
    );
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
        lookupRequestedSuc,
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
    flowOverride?: string,
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
      const flow =
        flowOverride === undefined
          ? this.toFloat(item.ESTSEGU)
          : this.toFloat(flowOverride);
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
    const rolePlaceholders = roleCandidates
      .map((_, idx) => `@${idx + 1}`)
      .join(',');

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

      if (
        priority === current.priority &&
        onlyExternalLab &&
        !current.onlyExternalLab
      ) {
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
    const rows = await this.fetchBatchOrdOperationalContext(
      iords,
      scope,
      roleCodeRaw,
    );
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
