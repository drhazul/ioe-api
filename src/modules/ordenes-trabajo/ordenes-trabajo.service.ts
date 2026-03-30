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
  homeSuc: string | null;
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

  private buildOrdLaboratorioJoinSql(ordAlias: string, labAlias: string) {
    return `
      LEFT JOIN dbo.DAT_LAB ${labAlias}
        ON TRY_CONVERT(INT, ${labAlias}.ID) = TRY_CONVERT(INT, ${ordAlias}.LABOR)
    `;
  }

  private buildOrdAllowedSucSql(
    ordAlias: string,
    labAlias: string,
    isAdminParam: string,
    allowedSucsParam: string,
    roleCodeParam: string,
    homeSucParam: string,
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
            UPPER(LTRIM(RTRIM(ISNULL(${roleCodeParam}, '')))) NOT IN (
              'ANALISTA',
              'ANALISTA_ORD',
              'ENC_MAQUILA',
              'ENCARGADO_MAQUILA',
              'ENC_BISEL',
              'ENCARGADO_BISELADO'
            )
            OR ${homeSucParam} IS NULL
            OR UPPER(LTRIM(RTRIM(ISNULL(${ordAlias}.SUC, '')))) = UPPER(${homeSucParam})
            OR UPPER(LTRIM(RTRIM(ISNULL(${labAlias}.SUC, '')))) = UPPER(${homeSucParam})
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
    const asignLabels = await this.resolveOpvLabels(
      rawItems.map((item) => item.ASIGN),
    );
    const items = rawItems.map((item) => {
      const asignId = this.normalizeText(item.ASIGN);
      const asignLabel = asignId == null ? null : asignLabels.get(asignId);
      if (asignLabel == null) return item;
      return {
        ...item,
        ASIGN_ID: asignId,
        ASIGN_LABEL: asignLabel,
        ASIGN: asignLabel,
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
    await this.assertOrdTypeAccessByIord(iord, user, scope);
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

  async saveDetail(
    iordRaw: string,
    dto: SaveOrdDetalleDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const iord = this.requireIord(iordRaw);
    const scope = await this.resolveSucScope(user, null);
    const roleCode = await this.resolveRoleCode(user);
    if (!this.canEditOrdDetail(user, roleCode)) {
      throw new ForbiddenException(
        'Tu usuario no tiene permiso para editar laboratorio, comentario o detalle de la ORD',
      );
    }
    await this.assertOrdTypeAccessByIord(iord, user, scope);
    const actor = this.auditActor(user);
    const commentsValue = this.normalizeText(dto.comentarios);
    const tipoValueRaw = this.normalizeUpper(dto.tipo);
    const tipoValue =
      !tipoValueRaw || tipoValueRaw === 'TALLADO' || tipoValueRaw === 'BISELADO'
        ? tipoValueRaw || null
        : null;
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
      );
    }
    const rows = Array.isArray(dto.details) ? dto.details : [];

    const exists = await this.dataSource.query(
      `
      SELECT TOP 1 1 AS ok
      FROM dbo.PV_CTR_ORDS o
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE o.IORD = @0
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4')}
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
        ESTSEGU = 3.1,
        ESTATUS = 2,
        LABOR = CASE WHEN @1 IS NULL THEN LABOR ELSE @1 END,
        COMAD = CASE WHEN @2 IS NULL THEN COMAD ELSE LEFT(@2, 2000) END,
        TIPO = CASE WHEN @3 IS NULL THEN TIPO ELSE @3 END,
        FCNMOD = GETDATE()
      WHERE IORD = @0
      `,
      [iord, laborValue, commentsValue, tipoValue],
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
      tipo: tipoValue,
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
    const scope = await this.resolveSucScope(user, null);
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
    },
  ) {
    const code = this.normalizeText(codeRaw);
    if (!code) {
      throw new BadRequestException('code es requerido');
    }

    const scope = await this.resolveSucScope(user, null);
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
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4')}
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
      await this.resolveRoleCode(user),
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
      AUTORIZAR: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      ANULAR: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      ENVIAR: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      ASIGNAR: [
        'JEF_TALLER',
        'TALLER',
        'ENC_MAQUILA',
        'ENCARGADO_MAQUILA',
        'ENC_BISEL',
        'ENCARGADO_BISELADO',
      ],
      TRABAJO_TERMINADO: [
        'JEF_TALLER',
        'TALLER',
        'ENC_MAQUILA',
        'ENCARGADO_MAQUILA',
        'ENC_BISEL',
        'ENCARGADO_BISELADO',
      ],
      REGRESAR_INCIDENCIA: [
        'JEF_TALLER',
        'TALLER',
        'ENC_MAQUILA',
        'ENCARGADO_MAQUILA',
        'ENC_BISEL',
        'ENCARGADO_BISELADO',
      ],
      REGRESAR_TIENDA: ['JEF_TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      ASIGNAR_LABORATORIO: ['JEF_TALLER', 'TALLER', 'ANALISTA_ORD', 'ANALISTA'],
      RECIBIR: [
        'JEF_TALLER',
        'TALLER',
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
        'TALLER',
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

  private resolveAsignadoDeptos(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) {
      return ['TALLER', 'BISELADO'];
    }
    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (roleCode === 'ENC_MAQUILA' || roleCode === 'ENCARGADO_MAQUILA') {
      return ['TALLER'];
    }
    if (roleCode === 'ENC_BISEL' || roleCode === 'ENCARGADO_BISELADO') {
      return ['BISELADO'];
    }
    return ['TALLER', 'BISELADO'];
  }

  private canAccessAsignadoOptions(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return [
      'JEF_TALLER',
      'TALLER',
      'ANALISTA_ORD',
      'ANALISTA',
      'ENC_MAQUILA',
      'ENCARGADO_MAQUILA',
      'ENC_BISEL',
      'ENCARGADO_BISELADO',
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
      return [2, 3, 3.1, 5, 6, 7, 8, 9, 9.1, 9.2, 10, 12];
    }
    if (
      roleCode === 'ENC_MAQUILA' ||
      roleCode === 'ENCARGADO_MAQUILA' ||
      roleCode === 'ENC_BISEL' ||
      roleCode === 'ENCARGADO_BISELADO'
    ) {
      return [5, 7, 8, 9, 9.1, 9.2];
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

  private async resolveLaboratoriosFromAcceso(
    scope: SucScope,
    sucOverride?: string | null,
  ) {
    const requestedSuc = this.normalizeUpper(sucOverride ?? scope.requestedSuc);
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
      SELECT ID, LAB, TIPOLAB, SUC
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
    const requestedSuc = this.normalizeUpper(sucOverride);
    const rows = await this.dataSource.query(
      `
      WITH raw AS (
        SELECT
          TRY_CONVERT(INT, l.ID) AS ID,
          LTRIM(RTRIM(ISNULL(l.LAB, ''))) AS LAB,
          UPPER(LTRIM(RTRIM(ISNULL(l.TIPOLAB, '')))) AS TIPOLAB,
          UPPER(LTRIM(RTRIM(ISNULL(l.SUC, '')))) AS SUC,
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
      SELECT ID, LAB, TIPOLAB, SUC
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

  private async assertLaboratorioDisponibleParaOrd(
    iord: string,
    labor: number,
    user: JwtPayload,
    scope: SucScope,
  ) {
    const roleCode = await this.resolveRoleCode(user);
    const ord = await this.fetchOrdLaboratorioContext(iord, scope, roleCode);
    this.assertOrdTipoMatchesRole(roleCode, ord.tipo, iord);
    const laboratorios = await this.resolveLaboratorios(scope, ord.suc);
    if (this.isLaboratorioDisponible(laboratorios, labor, ord.tipo)) return;
    throw new BadRequestException(
      `El laboratorio ${labor} no está habilitado para la sucursal ${ord.suc || 'N/D'} y tipo ${ord.tipo || 'N/D'} de la ORD ${iord}.`,
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
    const tipo = this.normalizeUpper(tipoRaw);
    return laboratorios.some(
      (item) =>
        item.id === labor &&
        (!tipo || this.normalizeUpper(item.tipoLab) === tipo),
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
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4')}
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
      tipo: this.normalizeUpper(row.TIPO ?? ''),
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
        AND ${this.buildOrdAllowedSucSql('o', 'lab', `@${iords.length}`, `@${iords.length + 1}`, `@${iords.length + 2}`, `@${iords.length + 3}`)}
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
      tipo: this.normalizeUpper(row.TIPO ?? ''),
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
    panelMode: 'operativo' | 'anulados' | 'entregadas',
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
      if (panelMode === 'anulados') return ['VER_DETALLE'];
      if (panelMode === 'entregadas') return ['VER_DETALLE', 'GARANTIA'];
      return operationalActions;
    }

    const roleCode = this.normalizeUpper(roleCodeRaw);
    const nonStoreReceiveActions = operationalActions.filter(
      (action) => action !== 'REGRESAR_TIENDA',
    );
    const nonStoreReceiveActionsNoPrint = nonStoreReceiveActions.filter(
      (action) => action !== 'IMPRIMIR_ETIQUETA',
    );
    const byRole: Record<string, string[]> = {
      JEF_TALLER: operationalActions,
      TALLER: nonStoreReceiveActionsNoPrint,
      ANALISTA_ORD: [
        'VER_DETALLE',
        'AUTORIZAR',
        'ANULAR',
        'ENVIAR',
        'REGRESAR_TIENDA',
        'ASIGNAR_LABORATORIO',
        'ENTREGAR',
        'IMPRIMIR_ETIQUETA',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_ENTREGAR',
      ],
      ANALISTA: [
        'VER_DETALLE',
        'AUTORIZAR',
        'ANULAR',
        'ENVIAR',
        'REGRESAR_TIENDA',
        'ASIGNAR_LABORATORIO',
        'ENTREGAR',
        'IMPRIMIR_ETIQUETA',
        'CAMBIO_MATERIAL',
        'MERMA',
        'SCAN_ENTREGAR',
      ],
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
      ENCARGADO_MAQUILA: [
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
      ENCARGADO_BISELADO: [
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
      ${this.buildOrdLaboratorioJoinSql('o', 'lab')}
      WHERE o.IORD = @0
        AND TRY_CONVERT(FLOAT, o.ESTSEGU) = 3
        AND TRY_CONVERT(INT, o.ESTATUS) = 2
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4')}
        AND ${this.buildOrdRequestedSucSql('o', '@5')}
      `,
      [
        iord,
        scope.isAdmin ? 1 : 0,
        scope.allowedSucsCsv,
        roleCode,
        scope.homeSuc,
        scope.requestedSuc,
      ],
    );
  }

  private canEditOrdDetail(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return (
      roleCode === 'JEF_TALLER' ||
      roleCode === 'TALLER' ||
      roleCode === 'ANALISTA_ORD' ||
      roleCode === 'ANALISTA'
    );
  }

  private canManageOrdTipoAndPrint(user: JwtPayload, roleCodeRaw: string) {
    if (this.isAdmin(user)) return true;
    const roleCode = this.normalizeUpper(roleCodeRaw);
    return (
      roleCode === 'JEF_TALLER' ||
      roleCode === 'ANALISTA_ORD' ||
      roleCode === 'ANALISTA'
    );
  }

  private resolveOrdTipoScope(roleCodeRaw: string) {
    const roleCode = this.normalizeUpper(roleCodeRaw);
    if (roleCode === 'ENC_MAQUILA' || roleCode === 'ENCARGADO_MAQUILA') {
      return 'TALLADO';
    }
    if (roleCode === 'ENC_BISEL' || roleCode === 'ENCARGADO_BISELADO') {
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
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4')}
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
    const actualTipo = this.normalizeUpper(row.TIPO ?? '');
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
        AND ${this.buildOrdAllowedSucSql('o', 'lab', '@1', '@2', '@3', '@4')}
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
    const actualTipo = this.normalizeUpper(ordTipoRaw);
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
        AND ${this.buildOrdAllowedSucSql('o', 'lab', `@${iords.length}`, `@${iords.length + 1}`, `@${iords.length + 2}`, `@${iords.length + 3}`)}
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
      .filter((row) => this.normalizeUpper(row.TIPO ?? '') !== requiredTipo)
      .map((row) => this.normalizeUpper(row.IORD ?? ''))
      .filter((value) => value.length > 0);
    if (!invalid.length) return;

    throw new ForbiddenException(
      `Las siguientes ORDs no corresponden a tu taller ${requiredTipo}: ${invalid.join(', ')}`,
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
