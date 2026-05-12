import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PvCotizacionCierreDto } from './dto/pv-cotizacion-cierre.dto';
import { PvCotizacionCierreFormaDto } from './dto/pv-cotizacion-cierre-forma.dto';
import { PvCotizacionCierrePreviewDto } from './dto/pv-cotizacion-cierre-preview.dto';

type SqlExecutor = {
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
};

type TipoTran = 'CA' | 'VF';

type CotizacionContext = {
  idfol: string;
  suc: string;
  clien: number | null;
  esta: string | null;
  rqfacDefault: boolean;
  ivaIntegrado: number | null;
  itemsCount: number;
  totalBase: number;
};

type CotizacionTotals = {
  subtotal: number;
  iva: number;
  total: number;
  totalBase: number;
  ivaIntegrado: number | null;
  tipotran: TipoTran;
  rqfac: boolean;
};

type FormaNormalizada = {
  form: string;
  impp: number;
  aut: string | null;
};

type RegistroCargoInput = {
  idfol: string;
  suc: string;
  clien: number | null;
  opv: string | null;
  form: string;
  impp: number;
};

type PrintHeaderData = {
  suc: string;
  desc: string | null;
  encar: string | null;
  zona: string | null;
  rfc: string | null;
  direccion: string | null;
  contacto: string | null;
};

type PrintTicketItem = {
  id: string;
  art: string | null;
  upc: string | null;
  des: string | null;
  ctd: number;
  pvta: number;
  importe: number;
  ord: string | null;
};

type PrintTicketItemsGroup = {
  items: PrintTicketItem[];
  itemsGratis: PrintTicketItem[];
};

type PrintFormaItem = {
  idf: string;
  form: string;
  impp: number;
  aut: string | null;
  fcn: string | null;
};

type PrintFooterData = {
  opv: string | null;
  opvNombre: string | null;
  idfol: string;
  fcnm: string | null;
  clienteId: number | null;
  clienteNombre: string | null;
};

type PrintOrdDetail = {
  iordp: string;
  art: string | null;
  job: string | null;
  esf: string | null;
  cil: string | null;
  eje: string | null;
};

type PrintOrdHeader = {
  iord: string;
  tipo: string | null;
  opv: string | null;
  fcns: string | null;
  fcnm: string | null;
  estatus: number | null;
  ncliente: string | null;
  art: string | null;
  desc: string | null;
  ctd: number | null;
  comad: string | null;
  details: PrintOrdDetail[];
};

@Injectable()
export class PvCotizacionesCierreService {
  private static readonly CTA_CTRL_CTAS_CARGO_CREDITO = '101001002';
  private static readonly CMOV_CARGO_CREDITO_CLIENTE = 602;
  private readonly logger = new Logger(PvCotizacionesCierreService.name);
  private static readonly NDOC_BASE = 6000000;
  private static readonly FORMAS_CARGO_CTRL_CTAS = new Set([
    'CREDITO',
    'DEUDOR',
  ]);
  private static readonly FORMA_CREDITO = 'CREDITO';
  private static readonly NDOC_LOCK_RESOURCE = 'PV_CIERRE_NDOC_602';

  private static readonly FORMAS_PERMITIDAS = new Set([
    'EFECTIVO',
    'TARJETA',
    'CHEQUE',
    'TRANSFERENCIA',
    'DEPOSITO 3RO',
    'CREDITO',
    'DEUDOR',
  ]);

  private static readonly FORMAS_AUT_REQUERIDA = new Set([
    'TARJETA',
    'CHEQUE',
    'TRANSFERENCIA',
    'DEPOSITO 3RO',
  ]);

  private static readonly FORMAS_NO_EFECTIVO = new Set([
    'TARJETA',
    'CHEQUE',
    'TRANSFERENCIA',
    'DEPOSITO 3RO',
    'CREDITO',
    'DEUDOR',
  ]);
  private static readonly FORMAS_CA_PERMITIDAS = new Set([
    'EFECTIVO',
    'CREDITO',
  ]);

  private static readonly ESTADOS_BLOQUEADOS = [
    'TRANSMITIR',
    'FINAL',
    'PROCES',
    'CERRAD',
    'CANCEL',
    'ENVIAD',
    'FACTUR',
    'TERMIN',
  ];

  constructor(private readonly dataSource: DataSource) {}

  async getContext(idfolRaw: string, user: JwtPayload) {
    const idfol = this.normalizeIdfol(idfolRaw);
    const context = await this.resolveContext(this.dataSource, idfol, user);
    return {
      ok: true,
      ...context,
    };
  }

  async preview(
    idfolRaw: string,
    dto: PvCotizacionCierrePreviewDto,
    user: JwtPayload,
  ) {
    const idfol = this.normalizeIdfol(idfolRaw);
    const tipotran = this.normalizeTipoTran(dto.tipotran);
    const context = await this.resolveContext(
      this.dataSource,
      idfol,
      user,
      dto.suc,
    );
    const rqfac =
      tipotran === 'CA' ? false : Boolean(dto.rqfac ?? context.rqfacDefault);
    const totals = this.calculateTotals({
      totalBase: context.totalBase,
      ivaIntegrado: context.ivaIntegrado,
      tipotran,
      rqfac,
    });

    return {
      ok: true,
      context,
      totals,
    };
  }

  async getPrintPreview(idfolRaw: string, user: JwtPayload) {
    const idfol = this.normalizeIdfol(idfolRaw);
    const context = await this.resolveContext(
      this.dataSource,
      idfol,
      user,
      undefined,
      false,
      false,
    );

    const folioRows = await this.dataSource.query(
      `
      SELECT TOP 1
        IDFOL,
        SUC,
        CLIEN,
        OPV,
        OPVM,
        FCN,
        FCNM,
        AUT,
        REQF
      FROM dbo.PV_CTR_FOL_ASVR
      WHERE IDFOL = @0
      `,
      [context.idfol],
    );
    if (!folioRows?.length) {
      throw new NotFoundException(`La cotizacion ${context.idfol} no existe`);
    }
    const folio = (folioRows[0] ?? {}) as Record<string, unknown>;
    const tipotran = this.normalizeTipoTranFromFolio(folio.AUT);
    const rqfac =
      tipotran === 'CA' ? false : (this.toInt(folio.REQF) ?? 0) === 1;

    const totals = this.calculateTotals({
      totalBase: context.totalBase,
      ivaIntegrado: context.ivaIntegrado,
      tipotran,
      rqfac,
    });

    const [header, ticketItems, formas, ords] = await Promise.all([
      this.loadPrintHeader(this.dataSource, context.suc),
      this.loadPrintTicketItems(this.dataSource, context.idfol),
      this.loadPrintFormas(this.dataSource, context.idfol),
      this.loadPrintOrds(this.dataSource, context.idfol),
    ]);

    const sumPagos = this.round2(
      formas.reduce((acc, item) => acc + item.impp, 0),
    );
    const faltante = this.round2(Math.max(totals.total - sumPagos, 0));
    const cambio = this.round2(Math.max(sumPagos - totals.total, 0));

    const opv =
      this.normalizeText(folio.OPVM) || this.normalizeText(folio.OPV) || null;
    const clienteId = context.clien;
    const [opvNombre, clienteNombre] = await Promise.all([
      this.loadOpvNombre(this.dataSource, opv),
      this.loadClienteNombre(this.dataSource, clienteId),
    ]);

    const footer: PrintFooterData = {
      opv,
      opvNombre,
      idfol: context.idfol,
      fcnm: this.toIsoDateTime(folio.FCNM),
      clienteId,
      clienteNombre,
    };

    return {
      ok: true,
      idfol: context.idfol,
      header,
      items: ticketItems.items,
      itemsGratis: ticketItems.itemsGratis,
      totals: {
        ...totals,
        sumPagos,
        faltante,
        cambio,
      },
      formas,
      footer,
      ords,
    };
  }

  async close(idfolRaw: string, dto: PvCotizacionCierreDto, user: JwtPayload) {
    const idfol = this.normalizeIdfol(idfolRaw);
    const tipotran = this.normalizeTipoTran(dto.tipotran);
    const rqfac = tipotran === 'CA' ? false : Boolean(dto.rqfac);
    const opv =
      this.normalizeText(dto.idopv) ||
      this.normalizeText(user?.username) ||
      null;
    const formas = this.normalizeFormas(dto.formas ?? []);
    if (!formas.length) {
      throw new BadRequestException(
        'Debe registrar al menos una forma de pago',
      );
    }
    this.assertCreditoNoCombinado(formas);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // El SP realiza el cierre transaccional; aqui solo prevalidamos acceso/contexto.
      await this.resolveContext(queryRunner, idfol, user, dto.suc, false);
      const procedureName = 'dbo.sp_pv_cotizacion_cerrar';
      const hasProcedure = await this.procedureExists(
        queryRunner,
        procedureName,
      );
      if (!hasProcedure) {
        throw new ConflictException(
          `No existe ${procedureName}. Ejecute el script sql/sp_pv_cotizacion_cerrar_create.sql`,
        );
      }
      const result = await this.executeCloseWithStoredProcedure(queryRunner, {
        idfol,
        suc: this.normalizeText(dto.suc) || null,
        tipotran,
        rqfac,
        opv,
        formas,
      });
      await this.executeMb51Transmission(queryRunner, {
        idfol: result.idfol,
        user: opv,
      });

      return result;
    } catch (error) {
      throw this.mapCloseError(error);
    } finally {
      await queryRunner.release();
    }
  }

  async retryMb51(idfolRaw: string, user: JwtPayload) {
    const idfol = this.normalizeIdfol(idfolRaw);
    const opv = this.normalizeText(user?.username) || null;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const ctx = await this.resolveContext(
        queryRunner,
        idfol,
        user,
        undefined,
        false,
        false, // Validamos estado manualmente para permitir PAGADO/MB51PROCES/TRANSMITIR
      );
      const estado = this.normalizeUpper(ctx.esta ?? '');
      if (
        estado !== 'PAGADO' &&
        estado !== 'MB51PROCES' &&
        estado !== 'TRANSMITIR'
      ) {
        throw new ConflictException(
          `Reintento MB51 no permitido en estado ${ctx.esta ?? 'N/D'}. Solo PAGADO/MB51PROCES/TRANSMITIR.`,
        );
      }

      const result = await this.executeMb51Transmission(queryRunner, {
        idfol: ctx.idfol,
        user: opv,
      });

      const estadoResult = this.normalizeUpper(ctx.esta ?? '') || 'PAGADO';
      return {
        ok: true,
        idfol: ctx.idfol,
        delta: result.delta,
        afterCount: result.afterCount,
        estado: estadoResult,
      };
    } catch (error) {
      throw this.mapCloseError(error);
    } finally {
      await queryRunner.release();
    }
  }

  private normalizeIdfol(value: string) {
    const idfol = this.normalizeText(value);
    if (!idfol) {
      throw new BadRequestException('IDFOL es requerido');
    }
    return idfol;
  }

  private normalizeText(value: unknown) {
    const text = String(value ?? '').trim();
    return text.length ? text : '';
  }

  private normalizeUpper(value: unknown) {
    return this.normalizeText(value).toUpperCase();
  }

  private normalizeTipoTran(value: string): TipoTran {
    const type = this.normalizeUpper(value);
    if (type === 'CA' || type === 'VF') return type;
    throw new BadRequestException(
      'tipotran invalido. Valores permitidos: CA, VF',
    );
  }

  private normalizeTipoTranFromFolio(value: unknown): TipoTran {
    const type = this.normalizeUpper(value ?? '');
    return type === 'CA' ? 'CA' : 'VF';
  }

  private toIsoDateTime(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return value.toISOString();
    }
    const text = this.normalizeText(value);
    if (!text) return null;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return text;
    return parsed.toISOString();
  }

  private async loadPrintHeader(
    executor: SqlExecutor,
    suc: string,
  ): Promise<PrintHeaderData> {
    const rows = await executor.query(
      `
      SELECT TOP 1
        SUC,
        [DESC],
        ENCAR,
        ZONA,
        RFC,
        DIRECCION,
        CONTACTO
      FROM dbo.DAT_SUC
      WHERE SUC = @0
      `,
      [suc],
    );
    const row = (rows?.[0] ?? {}) as Record<string, unknown>;
    return {
      suc: this.normalizeText(row.SUC) || suc,
      desc: this.normalizeText(row.DESC) || null,
      encar: this.normalizeText(row.ENCAR) || null,
      zona: this.normalizeText(row.ZONA) || null,
      rfc: this.normalizeText(row.RFC) || null,
      direccion: this.normalizeText(row.DIRECCION) || null,
      contacto: this.normalizeText(row.CONTACTO) || null,
    };
  }

  private async loadPrintTicketItems(
    executor: SqlExecutor,
    idfol: string,
  ): Promise<PrintTicketItemsGroup> {
    const colsSet = await this.loadTableColumns(executor, 'dbo.PV_TICKET_LOG');
    const hasTipoPromo = colsSet.has('TIPOPROMO');
    const tipoPromoSelect = hasTipoPromo
      ? `LTRIM(RTRIM(ISNULL(TIPOPROMO, ''))) AS TIPOPROMO`
      : `CAST('' AS NVARCHAR(50)) AS TIPOPROMO`;

    const rows = await executor.query(
      `
      SELECT
        ID,
        ART,
        UPC,
        DES,
        CTD,
        PVTA,
        PVTAT,
        ORD,
        ${tipoPromoSelect}
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @0
      ORDER BY ID ASC
      `,
      [idfol],
    );

    const items: PrintTicketItem[] = [];
    const itemsGratis: PrintTicketItem[] = [];
    (rows ?? [])
      .map((raw) => raw as Record<string, unknown>)
      .forEach((row, index) => {
        const ctd = this.toNumber(row.CTD) ?? 0;
        const pvta = this.round2(this.toNumber(row.PVTA) ?? 0);
        const pvtat = this.toNumber(row.PVTAT);
        const importe = this.round2(pvtat ?? ctd * pvta);
        const item = {
          id: this.normalizeText(row.ID) || `ROW-${index + 1}`,
          art: this.normalizeText(row.ART) || null,
          upc: this.normalizeText(row.UPC) || null,
          des: this.normalizeText(row.DES) || null,
          ctd: this.round2(ctd),
          pvta,
          importe,
          ord: this.normalizeText(row.ORD) || null,
        } satisfies PrintTicketItem;
        const tipoPromo = this.normalizeUpper(row.TIPOPROMO);
      if (tipoPromo === 'ART_GRATIS') {
        itemsGratis.push(item);
      } else {
        items.push(item);
      }
      });

    return { items, itemsGratis };
  }

  private async loadPrintFormas(
    executor: SqlExecutor,
    idfol: string,
  ): Promise<PrintFormaItem[]> {
    const tableName = await this.resolveFolioFormTable(executor);
    const colsSet = await this.loadTableColumns(executor, tableName);
    if (!colsSet.has('FORM')) return [];

    const selectedCols = ['IDF', 'FORM', 'IMPP', 'IMPD', 'AUT', 'FCN']
      .map((name) => this.normalizeUpper(name))
      .filter((name) => colsSet.has(name))
      .map((name) => `[${name}]`);
    if (!selectedCols.length) return [];

    let orderBy = '[FORM] ASC';
    if (colsSet.has('FCN')) {
      orderBy = '[FCN] ASC';
    } else if (colsSet.has('IDF')) {
      orderBy = '[IDF] ASC';
    }

    const rows = await executor.query(
      `
      SELECT
        ${selectedCols.join(',\n        ')}
      FROM ${tableName}
      WHERE IDFOL = @0
      ORDER BY ${orderBy}
      `,
      [idfol],
    );

    return (rows ?? [])
      .map((raw) => raw as Record<string, unknown>)
      .map((row, index) => {
        const imppCol = this.toNumber(this.getRowValue(row, 'IMPP'));
        const impdCol = this.toNumber(this.getRowValue(row, 'IMPD'));
        const imppRaw =
          imppCol != null && imppCol > 0 ? imppCol : (impdCol ?? imppCol ?? 0);
        return {
          idf:
            this.normalizeText(this.getRowValue(row, 'IDF') ?? '') ||
            `F-${index + 1}`,
          form: this.normalizeText(this.getRowValue(row, 'FORM') ?? ''),
          impp: this.round2(imppRaw),
          aut: this.normalizeText(this.getRowValue(row, 'AUT') ?? '') || null,
          fcn: this.toIsoDateTime(this.getRowValue(row, 'FCN')),
        } satisfies PrintFormaItem;
      })
      .filter((row) => row.form && row.impp > 0);
  }

  private async loadPrintOrds(
    executor: SqlExecutor,
    idfol: string,
  ): Promise<PrintOrdHeader[]> {
    if (!(await this.tableExists(executor, 'dbo.PV_CTR_ORDS'))) return [];

    const ordRows = await executor.query(
      `
      SELECT
        IORD,
        TIPO,
        OPV,
        FCNS,
        FCNM,
        ESTATUS,
        NCLIENTE,
        ART,
        DESCART,
        CTD,
        COMAD
      FROM dbo.PV_CTR_ORDS
      WHERE IDFOL = @0
      ORDER BY FCNM ASC, IORD ASC
      `,
      [idfol],
    );

    const headers = (ordRows ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        iord: this.normalizeText(row.IORD),
        tipo: this.normalizeText(row.TIPO) || null,
        opv: this.normalizeText(row.OPV) || null,
        fcns: this.toIsoDateTime(row.FCNS),
        fcnm: this.toIsoDateTime(row.FCNM),
        estatus: this.toInt(row.ESTATUS),
        ncliente: this.normalizeText(row.NCLIENTE) || null,
        art: this.normalizeText(row.ART) || null,
        desc: this.normalizeText(row.DESCART) || null,
        ctd: this.toNumber(row.CTD),
        comad: this.normalizeText(row.COMAD) || null,
        details: [] as PrintOrdDetail[],
      } satisfies PrintOrdHeader;
    });

    const byIord = new Map<string, PrintOrdHeader>();
    for (const ord of headers) {
      if (ord.iord) byIord.set(this.normalizeUpper(ord.iord), ord);
    }
    if (
      !byIord.size ||
      !(await this.tableExists(executor, 'dbo.PV_CTR_ORDS_DET'))
    ) {
      return headers.filter((item) => item.iord);
    }

    const detailRows = await executor.query(
      `
      SELECT
        det.IORDP,
        det.IORD,
        det.ART,
        det.JOB,
        det.ESF,
        det.CIL,
        det.EJE
      FROM dbo.PV_CTR_ORDS_DET det
      INNER JOIN dbo.PV_CTR_ORDS ord
        ON ord.IORD = det.IORD
      WHERE ord.IDFOL = @0
      ORDER BY det.IORD ASC, det.IORDP ASC
      `,
      [idfol],
    );

    for (const raw of detailRows ?? []) {
      const row = raw as Record<string, unknown>;
      const iord = this.normalizeText(row.IORD);
      if (!iord) continue;
      const target = byIord.get(this.normalizeUpper(iord));
      if (!target) continue;
      target.details.push({
        iordp: this.normalizeText(row.IORDP),
        art: this.normalizeText(row.ART) || null,
        job: this.normalizeText(row.JOB) || null,
        esf: this.normalizeText(row.ESF) || null,
        cil: this.normalizeText(row.CIL) || null,
        eje: this.normalizeText(row.EJE) || null,
      });
    }

    return headers.filter((item) => item.iord);
  }

  private async loadOpvNombre(
    executor: SqlExecutor,
    opv: string | null,
  ): Promise<string | null> {
    const key = this.normalizeText(opv);
    if (!key) return null;
    if (!(await this.tableExists(executor, 'dbo.PV_OPV'))) return null;

    const colsSet = await this.loadTableColumns(executor, 'dbo.PV_OPV');
    if (!colsSet.has('OPV')) return null;

    let nameExpr = `LTRIM(RTRIM(ISNULL([OPV], '')))`;
    if (colsSet.has('NOMB') || colsSet.has('APELP') || colsSet.has('APELM')) {
      const parts: string[] = [];
      if (colsSet.has('NOMB')) parts.push(`ISNULL([NOMB], '')`);
      if (colsSet.has('APELP')) parts.push(`ISNULL([APELP], '')`);
      if (colsSet.has('APELM')) parts.push(`ISNULL([APELM], '')`);
      nameExpr = `LTRIM(RTRIM(CONCAT(${parts.join(", ' ', ")})))`;
    } else if (colsSet.has('NOMBRE')) {
      nameExpr = `LTRIM(RTRIM(ISNULL([NOMBRE], '')))`;
    } else if (colsSet.has('NOM')) {
      nameExpr = `LTRIM(RTRIM(ISNULL([NOM], '')))`;
    }

    const rows = await executor.query(
      `
      SELECT TOP 1
        ${nameExpr} AS OPV_NOMBRE
      FROM dbo.PV_OPV
      WHERE LTRIM(RTRIM([OPV])) = @0
      `,
      [key],
    );
    return this.normalizeText((rows?.[0] ?? {})['OPV_NOMBRE']) || null;
  }

  private async loadClienteNombre(
    executor: SqlExecutor,
    clien: number | null,
  ): Promise<string | null> {
    const clientId = this.toNumber(clien);
    if (clientId == null) return null;

    const rows = await executor.query(
      `
      SELECT TOP 1
        RazonSocialReceptor AS CLIENTE_NOMBRE
      FROM dbo.FACT_CLIENT_SHP
      WHERE IDC = @0
      `,
      [clientId],
    );
    return this.normalizeText((rows?.[0] ?? {})['CLIENTE_NOMBRE']) || null;
  }

  private toNumber(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toInt(value: unknown) {
    const num = this.toNumber(value);
    return num == null ? null : Math.trunc(num);
  }

  private round2(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private isAdmin(user?: JwtPayload | null) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private assertUserSucAccess(user: JwtPayload, suc: string) {
    if (this.isAdmin(user)) return;

    const userSuc = this.normalizeText(user?.suc ?? '');
    if (!userSuc || userSuc === '000') return;

    if (userSuc !== suc) {
      throw new ForbiddenException(
        `No autorizado para operar el folio de la sucursal ${suc}`,
      );
    }
  }

  private isEstadoBloqueado(estado: string | null) {
    const normalized = this.normalizeUpper(estado ?? '');
    if (!normalized) return false;
    return PvCotizacionesCierreService.ESTADOS_BLOQUEADOS.some((token) =>
      normalized.includes(token),
    );
  }

  private async resolveContext(
    executor: SqlExecutor,
    idfol: string,
    user: JwtPayload,
    sucBody?: string,
    lockHeader = false,
    validateEstado = true,
  ): Promise<CotizacionContext> {
    const lockHint = lockHeader ? ' WITH (UPDLOCK, HOLDLOCK, ROWLOCK)' : '';
    const folioRows = await executor.query(
      `
      SELECT TOP 1 *
      FROM dbo.PV_CTR_FOL_ASVR${lockHint}
      WHERE IDFOL = @0
         OR IDFOLINICIAL = @0
      ORDER BY CASE WHEN IDFOL = @0 THEN 0 ELSE 1 END, FCN DESC, FCNM DESC
      `,
      [idfol],
    );
    if (!folioRows?.length) {
      throw new NotFoundException(`La cotizacion ${idfol} no existe`);
    }

    const folio = folioRows[0] as Record<string, unknown>;
    const currentIdfol = this.normalizeText(folio.IDFOL);
    if (!currentIdfol) {
      throw new NotFoundException(`La cotizacion ${idfol} no existe`);
    }
    const suc = this.normalizeText(folio.SUC);
    if (!suc) {
      throw new BadRequestException(
        `La cotizacion ${currentIdfol} no tiene sucursal asignada`,
      );
    }

    if (
      sucBody &&
      this.normalizeText(sucBody) &&
      this.normalizeText(sucBody) !== suc
    ) {
      throw new BadRequestException(
        `La sucursal ${sucBody} no corresponde al folio ${idfol}`,
      );
    }

    this.assertUserSucAccess(user, suc);

    const esta = this.normalizeText(folio.ESTA) || null;
    if (validateEstado && this.isEstadoBloqueado(esta)) {
      throw new ConflictException(
        `La cotizacion ${currentIdfol} ya no permite cierre en estado ${esta}`,
      );
    }

    const ticketRows = await executor.query(
      `
      SELECT
        COUNT(1) AS ITEMS_COUNT,
        SUM(ISNULL(CTD, 0) * ISNULL(PVTA, 0)) AS TOTAL_BASE
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @0
      `,
      [currentIdfol],
    );
    const ticketStats = (ticketRows?.[0] ?? {}) as Record<string, unknown>;
    const itemsCount = this.toInt(ticketStats.ITEMS_COUNT) ?? 0;
    if (itemsCount <= 0) {
      throw new BadRequestException(
        `La cotizacion ${currentIdfol} no tiene articulos para cierre`,
      );
    }

    const totalBase = this.round2(this.toNumber(ticketStats.TOTAL_BASE) ?? 0);
    if (totalBase <= 0) {
      throw new BadRequestException(
        `La cotizacion ${currentIdfol} tiene total base invalido`,
      );
    }

    const ivaRows = await executor.query(
      `
      SELECT TOP 1 IVA_INTEGRADO
      FROM dbo.DAT_SUC
      WHERE SUC = @0
      `,
      [suc],
    );
    if (!ivaRows?.length) {
      throw new NotFoundException(
        `No existe configuracion de sucursal en DAT_SUC para ${suc}`,
      );
    }

    const ivaIntegrado =
      this.toInt((ivaRows[0] as Record<string, unknown>).IVA_INTEGRADO) ?? null;

    const clien = this.toInt(folio.CLIEN);
    const rqfacDefault = (this.toInt(folio.REQF) ?? 0) === 1;

    return {
      idfol: currentIdfol,
      suc,
      clien,
      esta,
      rqfacDefault,
      ivaIntegrado,
      itemsCount,
      totalBase,
    };
  }

  private calculateTotals(input: {
    totalBase: number;
    ivaIntegrado: number | null;
    tipotran: TipoTran;
    rqfac: boolean;
  }): CotizacionTotals {
    const totalBase = this.round2(input.totalBase);
    let subtotal = 0;
    let iva = 0;
    let total = 0;

    if (input.tipotran === 'CA') {
      subtotal = totalBase;
      iva = 0;
      total = totalBase;
    } else {
      const ivaIntegrado = Number(input.ivaIntegrado ?? 1) === -1;
      if (ivaIntegrado) {
        total = totalBase;
        subtotal = this.round2(total / 1.16);
        iva = this.round2(total - subtotal);
      } else {
        if (input.rqfac) {
          subtotal = totalBase;
          iva = this.round2(subtotal * 0.16);
          total = this.round2(subtotal + iva);
        } else {
          total = totalBase;
          subtotal = this.round2(total / 1.16);
          iva = this.round2(total - subtotal);
        }
      }
    }

    return {
      subtotal: this.round2(subtotal),
      iva: this.round2(iva),
      total: this.round2(total),
      totalBase,
      ivaIntegrado: input.ivaIntegrado,
      tipotran: input.tipotran,
      rqfac: input.tipotran === 'CA' ? false : input.rqfac,
    };
  }

  private normalizeForma(value: string) {
    const raw = this.normalizeUpper(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '');

    const aliases: Record<string, string> = {
      EFECTIVO: 'EFECTIVO',
      CASH: 'EFECTIVO',
      TARJETA: 'TARJETA',
      CARD: 'TARJETA',
      CHEQUE: 'CHEQUE',
      TRANSFERENCIA: 'TRANSFERENCIA',
      TRANSFER: 'TRANSFERENCIA',
      SPEI: 'TRANSFERENCIA',
      DEPOSITO3RO: 'DEPOSITO 3RO',
      DEPOSITO3ROS: 'DEPOSITO 3RO',
      DEPOSITOTERCERO: 'DEPOSITO 3RO',
      CREDITO: 'CREDITO',
      DEUDOR: 'DEUDOR',
    };

    const mapped = aliases[raw];
    if (!mapped || !PvCotizacionesCierreService.FORMAS_PERMITIDAS.has(mapped)) {
      throw new BadRequestException(`Forma de pago no permitida: ${value}`);
    }
    return mapped;
  }

  private normalizeFormas(
    formas: PvCotizacionCierreFormaDto[],
  ): FormaNormalizada[] {
    return formas.map((forma) => {
      const form = this.normalizeForma(forma.form);
      const impp = this.round2(this.toNumber(forma.impp) ?? 0);
      if (impp <= 0) {
        throw new BadRequestException(
          `Importe invalido para forma ${forma.form}`,
        );
      }
      const autText = this.normalizeText(forma.aut ?? '');
      return {
        form,
        impp,
        aut: autText || null,
      };
    });
  }

  private assertCreditoNoCombinado(formas: FormaNormalizada[]) {
    const creditoCount = formas.filter(
      (item) => item.form === PvCotizacionesCierreService.FORMA_CREDITO,
    ).length;
    if (!creditoCount) return;

    if (formas.length > 1 || creditoCount > 1) {
      throw new BadRequestException(
        'La forma CREDITO no se puede combinar con otras formas de pago',
      );
    }
  }

  private async loadExistingForms(
    executor: SqlExecutor,
    idfol: string,
    tableName: string,
  ) {
    const rows = await executor.query(
      `
      SELECT FORM
      FROM ${tableName}
      WHERE IDFOL = @0
      `,
      [idfol],
    );
    return (rows ?? []).map((row) =>
      this.normalizeText((row as Record<string, unknown>).FORM),
    );
  }

  private async validateFormas(input: {
    executor: SqlExecutor;
    idfol: string;
    tipotran: TipoTran;
    rqfac: boolean;
    total: number;
    clien: number | null;
    formas: FormaNormalizada[];
    existingForms: string[];
  }) {
    const formas = input.formas;
    if (!formas.length) {
      throw new BadRequestException(
        'Debe registrar al menos una forma de pago',
      );
    }

    const normalizedExisting = input.existingForms
      .filter((item) => this.normalizeText(item))
      .map((item) => this.normalizeForma(item));
    const existingSet = new Set(normalizedExisting);
    const incomingSet = new Set(formas.map((item) => item.form));

    if (input.tipotran === 'CA') {
      const formasInvalidasCa = formas.filter(
        (item) =>
          !PvCotizacionesCierreService.FORMAS_CA_PERMITIDAS.has(item.form),
      );
      if (formasInvalidasCa.length > 0) {
        throw new BadRequestException(
          'Para cierre tipo CA solo se permite EFECTIVO o CREDITO',
        );
      }
      if (incomingSet.size > 1) {
        throw new BadRequestException(
          'Para cierre tipo CA solo se permite una forma de pago',
        );
      }
      if (existingSet.size > 1) {
        throw new ConflictException(
          'El folio ya tiene multiples formas registradas y no permite cierre CA',
        );
      }
      if (existingSet.size === 1) {
        const existingForm = Array.from(existingSet)[0];
        const incomingForm = Array.from(incomingSet)[0];
        if (existingForm !== incomingForm) {
          throw new BadRequestException(
            `En cierre CA debe mantenerse la forma ${existingForm}`,
          );
        }
      }
    }
    this.assertCreditoNoCombinado(formas);

    if (PvCotizacionesCierreService.FORMAS_NO_EFECTIVO.size > 0) {
      const hasNoEfectivo = formas.some((item) =>
        PvCotizacionesCierreService.FORMAS_NO_EFECTIVO.has(item.form),
      );
      if (hasNoEfectivo && Number(input.clien ?? 0) === 1) {
        throw new BadRequestException(
          'Para formas no efectivo el cliente no puede ser 1',
        );
      }
    }
    if (input.rqfac && Number(input.clien ?? 0) === 1) {
      throw new BadRequestException(
        'Para cierre con factura el cliente no puede ser 1',
      );
    }

    for (const forma of formas) {
      const aut = this.normalizeText(forma.aut ?? '');
      const requiereAut = PvCotizacionesCierreService.FORMAS_AUT_REQUERIDA.has(
        forma.form,
      );

      if (requiereAut && !aut) {
        throw new BadRequestException(
          `La forma ${forma.form} requiere autorizacion/referencia`,
        );
      }
      if (!requiereAut && aut) {
        throw new BadRequestException(
          `La forma ${forma.form} no permite autorizacion/referencia`,
        );
      }
    }

    await this.validateReferenciasCierre(input.executor, input.idfol, formas);

    const sumPagos = this.round2(
      formas.reduce((acc, item) => acc + (this.toNumber(item.impp) ?? 0), 0),
    );
    const total = this.round2(input.total);
    const epsilon = 0.0001;

    if (sumPagos + epsilon < total) {
      throw new BadRequestException(
        `El total pagado (${sumPagos.toFixed(2)}) es menor al total (${total.toFixed(2)})`,
      );
    }
    if (sumPagos > total + epsilon) {
      throw new BadRequestException(
        `El total pagado (${sumPagos.toFixed(2)}) no puede exceder el total (${total.toFixed(2)})`,
      );
    }

    const creditoSolicitado = this.round2(
      formas
        .filter((item) => item.form === 'CREDITO')
        .reduce((acc, item) => acc + item.impp, 0),
    );
    if (creditoSolicitado > 0) {
      await this.validateCreditoDisponible(
        input.executor,
        input.clien,
        creditoSolicitado,
      );
    }

    const cambio = this.round2(Math.max(sumPagos - total, 0));
    return { sumPagos, cambio };
  }

  private async validateReferenciasCierre(
    executor: SqlExecutor,
    idfol: string,
    formas: FormaNormalizada[],
  ) {
    const referencias = await executor.query(
      `
      SELECT
        IDREF,
        IDFOL,
        TIPO,
        ESTATUS,
        RfcEmisor,
        IMPT
      FROM dbo.REF_DETALLE
      WHERE IDFOL = @0
      `,
      [idfol],
    );

    const byIdref = new Map<
      string,
      {
        idref: string;
        idfol: string;
        tipo: string;
        estatus: string;
        rfcEmisor: string;
        impt: number | null;
      }
    >();

    for (const row of referencias ?? []) {
      const record = row as Record<string, unknown>;
      const idref = this.normalizeText(record.IDREF);
      if (!idref) continue;
      byIdref.set(this.normalizeUpper(idref), {
        idref,
        idfol: this.normalizeText(record.IDFOL),
        tipo: this.normalizeUpper(record.TIPO),
        estatus: this.normalizeUpper(record.ESTATUS),
        rfcEmisor: this.normalizeText(
          record.RfcEmisor ?? record.RFCEMISOR ?? '',
        ),
        impt: this.toNumber(record.IMPT),
      });
    }

    const formasConRef = formas.filter((item) =>
      PvCotizacionesCierreService.FORMAS_AUT_REQUERIDA.has(item.form),
    );

    const usedRefs = new Set<string>();
    for (const forma of formasConRef) {
      const aut = this.normalizeText(forma.aut ?? '');
      if (!aut) {
        throw new BadRequestException(
          `Debe asignar referencia para ${forma.form}`,
        );
      }

      const key = this.normalizeUpper(aut);
      if (usedRefs.has(key)) {
        throw new BadRequestException(
          'No se puede reutilizar la misma referencia en multiples formas de pago',
        );
      }
      usedRefs.add(key);

      const ref = byIdref.get(key);
      if (!ref) {
        throw new BadRequestException(
          `Debe asignar referencia para ${forma.form}`,
        );
      }
      if (this.normalizeUpper(ref.idfol) !== this.normalizeUpper(idfol)) {
        throw new BadRequestException(
          `Debe asignar referencia para ${forma.form}`,
        );
      }
      if (ref.estatus !== 'PROCESADO') {
        throw new BadRequestException(
          `Debe asignar referencia para ${forma.form}`,
        );
      }
      if (ref.tipo && ref.tipo !== this.normalizeUpper(forma.form)) {
        throw new BadRequestException(
          `La referencia ${ref.idref} no corresponde a ${forma.form}`,
        );
      }
      if (!ref.rfcEmisor || !(ref.impt != null && Number.isFinite(ref.impt))) {
        throw new BadRequestException(
          `La referencia ${ref.idref} no tiene datos completos`,
        );
      }
    }

    const unusedRefs = Array.from(byIdref.values()).filter((ref) => {
      if (!ref.idref) return false;
      const status = this.normalizeUpper(ref.estatus);
      const isOpenRef = status === 'CAPTURADO' || status === 'PROCESADO';
      return isOpenRef && !usedRefs.has(this.normalizeUpper(ref.idref));
    });
    if (unusedRefs.length > 0) {
      throw new BadRequestException(
        'Existen referencias ligadas al folio sin utilizar; elimine las referencias no usadas antes de finalizar',
      );
    }
  }

  private async insertFormaPago(
    executor: SqlExecutor,
    input: {
      tableName: string;
      tableColumns: Set<string>;
      idf: string;
      idfol: string;
      forma: FormaNormalizada;
      impc: number;
    },
  ) {
    const cols = ['IDF', 'IDFOL', 'FCN', 'FORM', 'IMPP', 'IMPC'];
    const values = ['@0', '@1', 'GETDATE()', '@2', '@3', '@4'];
    const params: unknown[] = [
      input.idf,
      input.idfol,
      input.forma.form,
      input.forma.impp,
      input.impc,
    ];

    if (input.tableColumns.has('IMPA')) {
      cols.push('IMPA');
      values.push(`@${params.length}`);
      params.push(0);
    }

    if (input.tableColumns.has('IMPD')) {
      cols.push('IMPD');
      values.push(`@${params.length}`);
      params.push(input.forma.impp);
    }

    if (input.tableColumns.has('AUT')) {
      cols.push('AUT');
      values.push(`@${params.length}`);
      params.push(this.resolveAutForForma(input.forma, input.idfol));
    }

    await executor.query(
      `
      INSERT INTO ${input.tableName} (
        ${cols.join(',\n        ')}
      )
      VALUES (
        ${values.join(',\n        ')}
      )
      `,
      params,
    );
  }

  private async updateFolioHeader(
    executor: SqlExecutor,
    input: {
      idfol: string;
      total: number;
      tipotran: TipoTran;
      rqfac: boolean;
      opv: string | null;
    },
  ) {
    const columns = await this.loadTableColumns(
      executor,
      'dbo.PV_CTR_FOL_ASVR',
    );
    const sets: string[] = ['ESTA = @1', 'IMPT = @2'];
    const params: unknown[] = [
      input.idfol,
      'TRANSMITIR',
      this.round2(input.total),
    ];
    let index = 3;

    const rqfacColumn = this.pickFirstExistingColumn(columns, [
      'REQF',
      'RQFAC',
    ]);
    if (rqfacColumn) {
      sets.push(`[${rqfacColumn}] = @${index}`);
      params.push(input.rqfac ? 1 : 0);
      index += 1;
    }

    if (columns.has('AUT')) {
      sets.push(`AUT = @${index}`);
      params.push(input.tipotran);
      index += 1;
    }

    if (columns.has('FCNM')) {
      sets.push('FCNM = GETDATE()');
    }

    if (columns.has('OPVM')) {
      sets.push(`OPVM = @${index}`);
      params.push(input.opv);
      index += 1;
    }

    const sql = `
      UPDATE dbo.PV_CTR_FOL_ASVR
      SET
        ${sets.join(',\n        ')}
      WHERE IDFOL = @0
    `;
    await executor.query(sql, params);
  }

  private async updateOrdenesStatus(executor: SqlExecutor, idfol: string) {
    const columns = await this.loadTableColumns(executor, 'dbo.PV_CTR_FOL_ASVR');
    const rqfacColumn = this.pickFirstExistingColumn(columns, ['REQF', 'RQFAC']);
    let rqfac = 0;
    if (rqfacColumn) {
      const folioRows = await executor.query(
        `
        SELECT TOP 1 ISNULL(TRY_CONVERT(INT, [${rqfacColumn}]), 0) AS RQFAC
        FROM dbo.PV_CTR_FOL_ASVR
        WHERE UPPER(LTRIM(RTRIM(ISNULL(IDFOL, '')))) = UPPER(LTRIM(RTRIM(ISNULL(@0, ''))))
        ORDER BY ISNULL(FCNM, FCN) DESC
        `,
        [idfol],
      );
      rqfac = this.toInt((folioRows?.[0] ?? {})['RQFAC']) ?? 0;
    }

    await executor.query(
      `
      UPDATE dbo.PV_CTR_ORDS
      SET ESTATUS = @1, RQFAC = @2
      WHERE IDFOL = @0
      `,
      [idfol, 2, rqfac],
    );
  }

  private async resolveFolioFormTable(executor: SqlExecutor) {
    const hasSvr = await this.tableExists(executor, 'dbo.PV_CTR_FOL_FORM_SVR');
    if (hasSvr) return 'dbo.PV_CTR_FOL_FORM_SVR';
    const hasLegacy = await this.tableExists(executor, 'dbo.PV_CTR_FOL_FORM');
    if (hasLegacy) return 'dbo.PV_CTR_FOL_FORM';
    throw new NotFoundException(
      'No existe tabla de formas de pago (PV_CTR_FOL_FORM_SVR/PV_CTR_FOL_FORM)',
    );
  }

  private resolveAutForForma(forma: FormaNormalizada, idfol: string) {
    if (PvCotizacionesCierreService.FORMAS_CARGO_CTRL_CTAS.has(forma.form)) {
      return idfol;
    }
    return forma.aut;
  }

  private async registerCargoCreditoDeudor(
    executor: SqlExecutor,
    input: RegistroCargoInput,
  ) {
    const clientId = Number(input.clien ?? NaN);
    if (!Number.isFinite(clientId) || clientId <= 0) {
      throw new BadRequestException(
        `No se puede aplicar forma ${input.form} sin cliente valido`,
      );
    }

    const ndoc = await this.generateNextNdoc(executor);
    await this.insertDatCtrDocIfAvailable(executor, {
      ndoc,
      idfol: input.idfol,
      clientId,
      form: input.form,
      impp: input.impp,
      suc: input.suc,
      opv: input.opv,
    });
    await this.insertDatCtrlCtasCargo(executor, {
      ndoc,
      idfol: input.idfol,
      clientId,
      form: input.form,
      impp: input.impp,
      suc: input.suc,
      opv: input.opv,
    });
  }

  private async generateNextNdoc(executor: SqlExecutor) {
    const lockRows = await executor.query(
      `
      DECLARE @res int;
      EXEC @res = sp_getapplock
        @Resource = @0,
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 15000;
      SELECT @res AS LOCK_RESULT;
      `,
      [PvCotizacionesCierreService.NDOC_LOCK_RESOURCE],
    );
    const lockResult = this.toInt((lockRows?.[0] ?? {})['LOCK_RESULT']) ?? -1;
    if (lockResult < 0) {
      throw new ConflictException(
        'No se pudo asegurar consecutivo NDOC para cierre',
      );
    }

    let maxNum = PvCotizacionesCierreService.NDOC_BASE;
    const maxCtrlRows = await executor.query(
      `
      SELECT MAX(
        TRY_CAST(SUBSTRING(LTRIM(RTRIM(NDOC)), 2, 50) AS bigint)
      ) AS MAX_NUM
      FROM dbo.DAT_CTRL_CTAS WITH (UPDLOCK, HOLDLOCK)
      WHERE LTRIM(RTRIM(ISNULL(NDOC, ''))) LIKE 'N%'
      `,
    );
    const maxCtrl = this.toNumber((maxCtrlRows?.[0] ?? {})['MAX_NUM']);
    if (maxCtrl != null) {
      maxNum = Math.max(maxNum, Math.trunc(maxCtrl));
    }

    if (await this.tableExists(executor, 'dbo.DAT_CTR_DOC')) {
      const maxDocRows = await executor.query(
        `
        SELECT MAX(
          TRY_CAST(SUBSTRING(LTRIM(RTRIM(NDOC)), 2, 50) AS bigint)
        ) AS MAX_NUM
        FROM dbo.DAT_CTR_DOC WITH (UPDLOCK, HOLDLOCK)
        WHERE LTRIM(RTRIM(ISNULL(NDOC, ''))) LIKE 'N%'
        `,
      );
      const maxDoc = this.toNumber((maxDocRows?.[0] ?? {})['MAX_NUM']);
      if (maxDoc != null) {
        maxNum = Math.max(maxNum, Math.trunc(maxDoc));
      }
    }

    const next = Math.max(maxNum, PvCotizacionesCierreService.NDOC_BASE) + 1;
    return `N${next}`;
  }

  private async insertDatCtrDocIfAvailable(
    executor: SqlExecutor,
    input: {
      ndoc: string;
      idfol: string;
      clientId: number;
      form: string;
      impp: number;
      suc: string;
      opv: string | null;
    },
  ) {
    const tableName = 'dbo.DAT_CTR_DOC';
    if (!(await this.tableExists(executor, tableName))) {
      return;
    }

    const colsSet = await this.loadTableColumns(executor, tableName);
    if (!colsSet.has('NDOC')) {
      return;
    }

    const cols: string[] = ['NDOC'];
    const values: string[] = ['@0'];
    const params: unknown[] = [input.ndoc];

    const pushValue = (column: string, value: unknown) => {
      cols.push(column);
      values.push(`@${params.length}`);
      params.push(value);
    };
    const pushNow = (column: string) => {
      cols.push(column);
      values.push('GETDATE()');
    };
    const classColumn = colsSet.has('CMOV')
      ? 'CMOV'
      : colsSet.has('CLSD')
        ? 'CLSD'
        : null;
    const rtxt = `Cargo ${input.form.toLowerCase()} ticket ${input.idfol}`;

    if (colsSet.has('IDFOL')) pushValue('IDFOL', input.idfol);
    if (colsSet.has('CLIENT')) pushValue('CLIENT', input.clientId);
    if (colsSet.has('CTA')) {
      pushValue('CTA', PvCotizacionesCierreService.CTA_CTRL_CTAS_CARGO_CREDITO);
    }
    if (classColumn != null) {
      pushValue(
        classColumn,
        PvCotizacionesCierreService.CMOV_CARGO_CREDITO_CLIENTE,
      );
    }
    if (colsSet.has('IMPT')) pushValue('IMPT', this.round2(input.impp));
    if (colsSet.has('SUC')) pushValue('SUC', input.suc);
    if (colsSet.has('OPV')) pushValue('OPV', input.opv);
    if (colsSet.has('IDOPV')) pushValue('IDOPV', input.opv);
    if (colsSet.has('TIPO')) pushValue('TIPO', input.form);
    if (colsSet.has('RTXT')) pushValue('RTXT', rtxt);
    if (colsSet.has('FCND')) pushNow('FCND');
    if (colsSet.has('FCN')) pushNow('FCN');
    if (colsSet.has('FCNR')) pushNow('FCNR');
    if (colsSet.has('FECHA')) pushNow('FECHA');

    await executor.query(
      `
      INSERT INTO ${tableName} (
        ${cols.map((c) => `[${c}]`).join(',\n        ')}
      )
      VALUES (
        ${values.join(',\n        ')}
      )
      `,
      params,
    );
  }

  private async insertDatCtrlCtasCargo(
    executor: SqlExecutor,
    input: {
      ndoc: string;
      idfol: string;
      clientId: number;
      form: string;
      impp: number;
      suc: string;
      opv: string | null;
    },
  ) {
    const tableName = 'dbo.DAT_CTRL_CTAS';
    const colsSet = await this.loadTableColumns(executor, tableName);
    const classColumn = colsSet.has('CMOV')
      ? 'CMOV'
      : colsSet.has('CLSD')
        ? 'CLSD'
        : null;
    const required = ['CTA', 'CLIENT', 'IMPT', 'NDOC', 'IDFOL'];
    const missing = required.filter((col) => !colsSet.has(col));
    if (missing.length > 0 || classColumn == null) {
      if (classColumn == null) {
        missing.push('CMOV/CLSD');
      }
      throw new ConflictException(
        `DAT_CTRL_CTAS no contiene columnas requeridas: ${missing.join(', ')}`,
      );
    }

    const cols: string[] = ['CTA', 'CLIENT', classColumn, 'IMPT', 'NDOC'];
    const values: string[] = ['@0', '@1', '@2', '@3', '@4'];
    const params: unknown[] = [
      PvCotizacionesCierreService.CTA_CTRL_CTAS_CARGO_CREDITO,
      input.clientId,
      PvCotizacionesCierreService.CMOV_CARGO_CREDITO_CLIENTE,
      -this.round2(input.impp),
      input.ndoc,
    ];

    const pushValue = (column: string, value: unknown) => {
      cols.push(column);
      values.push(`@${params.length}`);
      params.push(value);
    };
    const pushNow = (column: string) => {
      cols.push(column);
      values.push('GETDATE()');
    };
    const rtxt = `Cargo ${input.form.toLowerCase()} ticket ${input.idfol}`;

    if (colsSet.has('IDFOL')) pushValue('IDFOL', input.idfol);
    if (colsSet.has('SUC')) pushValue('SUC', input.suc);
    if (colsSet.has('OPV')) pushValue('OPV', input.opv);
    if (colsSet.has('IDOPV')) pushValue('IDOPV', input.opv);
    if (colsSet.has('TIPO')) pushValue('TIPO', input.form);
    if (colsSet.has('RTXT')) pushValue('RTXT', rtxt);
    if (colsSet.has('FCND')) pushNow('FCND');
    if (colsSet.has('FCN')) pushNow('FCN');
    if (colsSet.has('FCNR')) pushNow('FCNR');
    if (colsSet.has('FECHA')) pushNow('FECHA');

    await executor.query(
      `
      INSERT INTO ${tableName} (
        ${cols.map((c) => `[${c}]`).join(',\n        ')}
      )
      VALUES (
        ${values.join(',\n        ')}
      )
      `,
      params,
    );
  }

  private async tableExists(executor: SqlExecutor, tableName: string) {
    const rows = await executor.query(
      `SELECT CASE WHEN OBJECT_ID(@0) IS NULL THEN 0 ELSE 1 END AS EXISTS_TABLE`,
      [tableName],
    );
    return (this.toInt((rows?.[0] ?? {})['EXISTS_TABLE']) ?? 0) === 1;
  }

  private async loadTableColumns(executor: SqlExecutor, tableName: string) {
    const rows = await executor.query(
      `
      SELECT UPPER(name) AS COL
      FROM sys.columns
      WHERE object_id = OBJECT_ID(@0)
      `,
      [tableName],
    );

    return new Set(
      (rows ?? []).map((row) =>
        this.normalizeUpper((row as Record<string, unknown>).COL),
      ),
    );
  }

  private pickFirstExistingColumn(columns: Set<string>, candidates: string[]) {
    for (const candidate of candidates) {
      const normalized = this.normalizeUpper(candidate);
      if (columns.has(normalized)) return normalized;
    }
    return null;
  }

  private async validateCreditoDisponible(
    executor: SqlExecutor,
    clien: number | null,
    creditoSolicitado: number,
  ) {
    if (!Number.isFinite(Number(clien ?? NaN))) {
      throw new BadRequestException(
        'No se puede aplicar forma CREDITO sin cliente valido',
      );
    }

    const clientId = Number(clien);
    const clientRows = await executor.query(
      `
      SELECT TOP 1 L_CRED
      FROM dbo.FACT_CLIENT_SHP
      WHERE IDC = @0
      `,
      [clientId],
    );
    if (!clientRows?.length) {
      throw new NotFoundException(`Cliente ${clientId} no existe`);
    }

    const clientRow = (clientRows[0] ?? {}) as Record<string, unknown>;
    const limite = this.round2(this.toNumber(clientRow.L_CRED) ?? 0);
    if (limite <= 0) {
      throw new BadRequestException(
        `Cliente ${clientId} no tiene limite de credito disponible`,
      );
    }

    const saldoVigente = await this.loadSaldoVigenteCtrlCtas(
      executor,
      clientId,
    );
    const disponible = this.round2(Math.max(limite - saldoVigente, 0));
    if (disponible + 0.0001 < creditoSolicitado) {
      throw new BadRequestException(
        `Credito insuficiente. Disponible ${disponible.toFixed(2)}, solicitado ${creditoSolicitado.toFixed(2)}`,
      );
    }
  }

  private async loadSaldoVigenteCtrlCtas(
    executor: SqlExecutor,
    clientId: number,
  ) {
    const rows = await executor.query(
      `
      SELECT SUM(ISNULL(IMPT, 0)) AS SALDO_NETO
      FROM dbo.DAT_CTRL_CTAS
      WHERE CTA = @0
        AND CLIENT = @1
      `,
      [PvCotizacionesCierreService.CTA_CTRL_CTAS_CARGO_CREDITO, clientId],
    );
    const saldoNeto = this.toNumber((rows?.[0] ?? {})['SALDO_NETO']) ?? 0;
    const creditoEjercido = Math.max(-saldoNeto, 0);
    return this.round2(creditoEjercido);
  }

  private async procedureExists(executor: SqlExecutor, procedureName: string) {
    const rows = await executor.query(
      `
      SELECT CASE
        WHEN OBJECT_ID(@0, 'P') IS NULL THEN 0
        ELSE 1
      END AS HAS_PROCEDURE
      `,
      [procedureName],
    );
    return (this.toInt((rows?.[0] ?? {})['HAS_PROCEDURE']) ?? 0) === 1;
  }

  private getRowValue(
    row: Record<string, unknown>,
    key: string,
  ): unknown | undefined {
    const target = key.toUpperCase();
    for (const [rawKey, value] of Object.entries(row)) {
      if (rawKey.toUpperCase() === target) return value;
    }
    return undefined;
  }

  private async executeCloseWithStoredProcedure(
    executor: SqlExecutor,
    input: {
      idfol: string;
      suc: string | null;
      tipotran: TipoTran;
      rqfac: boolean;
      opv: string | null;
      formas: FormaNormalizada[];
    },
  ) {
    const formasJson = JSON.stringify(
      input.formas.map((item) => ({
        form: item.form,
        impp: this.round2(item.impp),
        aut: item.aut,
      })),
    );

    const rows = await executor.query(
      `
      EXEC dbo.sp_pv_cotizacion_cerrar
        @IDFOL = @0,
        @SUC = @1,
        @TIPOTRAN = @2,
        @RQFAC = @3,
        @IDOPV = @4,
        @FORMAS_JSON = @5
      `,
      [
        input.idfol,
        input.suc,
        input.tipotran,
        input.rqfac ? 1 : 0,
        input.opv,
        formasJson,
      ],
    );

    const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
    if (!row) {
      throw new ConflictException(
        'El SP de cierre no devolvio resultado de totales',
      );
    }

    const tipotranRes =
      this.normalizeTipoTran(
        String(this.getRowValue(row, 'tipotran') ?? input.tipotran),
      ) ?? input.tipotran;
    const rqfacValue = this.toInt(this.getRowValue(row, 'rqfac'));
    const rqfacRes =
      rqfacValue == null
        ? Boolean(this.getRowValue(row, 'rqfac') ?? input.rqfac)
        : rqfacValue === 1;
    const totalBase = this.round2(
      this.toNumber(this.getRowValue(row, 'totalBase')) ?? 0,
    );
    const subtotal = this.round2(
      this.toNumber(this.getRowValue(row, 'subtotal')) ?? 0,
    );
    const iva = this.round2(this.toNumber(this.getRowValue(row, 'iva')) ?? 0);
    const total = this.round2(
      this.toNumber(this.getRowValue(row, 'total')) ?? 0,
    );
    const ivaIntegrado = this.toInt(this.getRowValue(row, 'ivaIntegrado'));
    const sumPagos = this.round2(
      this.toNumber(this.getRowValue(row, 'sumPagos')) ?? 0,
    );
    const cambio = this.round2(
      this.toNumber(this.getRowValue(row, 'cambio')) ?? 0,
    );
    const idfolRes =
      this.normalizeText(this.getRowValue(row, 'idfol') ?? '') || input.idfol;

    return {
      ok: true,
      idfol: idfolRes,
      tipotran: tipotranRes,
      rqfac: tipotranRes === 'CA' ? false : rqfacRes,
      totales: {
        subtotal,
        iva,
        total,
        totalBase,
        ivaIntegrado,
        tipotran: tipotranRes,
        rqfac: tipotranRes === 'CA' ? false : rqfacRes,
      },
      sumPagos,
      cambio,
    };
  }

  private async executeMb51Transmission(
    executor: SqlExecutor,
    input: {
      idfol: string;
      user: string | null;
    },
  ): Promise<{ delta: number; afterCount: number }> {
    const procedureName = 'dbo.sp_mb51_transmitir_folio';
    const exists = await this.procedureExists(executor, procedureName);
    if (!exists) {
      throw new ConflictException(
        `No existe ${procedureName}. Ejecute el script sql/mb51transmicion.sql`,
      );
    }

    const before = await executor.query(
      `SELECT COUNT(1) AS c FROM dbo.DAT_MB51 WHERE DOCP=@0 AND CLSM IN (201,202)`,
      [input.idfol],
    );

    try {
      await executor.query(
        `
        EXEC dbo.sp_mb51_transmitir_folio
          @IDFOL = @0,
          @USER = @1
        `,
        [input.idfol, input.user],
      );
    } catch (err) {
      this.logger.error(`MB51 transmit error for ${input.idfol}`, err as any);
      throw err;
    }

    const after = await executor.query(
      `SELECT COUNT(1) AS c FROM dbo.DAT_MB51 WHERE DOCP=@0 AND CLSM IN (201,202)`,
      [input.idfol],
    );

    const beforeCount = Number(before?.[0]?.c ?? 0);
    const afterCount = Number(after?.[0]?.c ?? 0);
    const delta = afterCount - beforeCount;

    if (afterCount === 0) {
      const msg = `MB51 transmit completed but no rows inserted for ${input.idfol}. Revisa MB51_CONFLICT_LOG o CTOP en DAT_ART.`;
      this.logger.warn(msg);
      throw new ConflictException(msg);
    }

    if (delta <= 0) {
      const msg = `MB51 transmit idempotent for ${input.idfol}: afterCount=${afterCount}, delta=${delta}.`;
      this.logger.warn(msg);
    } else {
      this.logger.log(`MB51 transmit inserted ${delta} rows for ${input.idfol}`);
    }

    return { delta, afterCount };
  }

  private mapCloseError(error: unknown) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      return error;
    }

    if (error instanceof QueryFailedError) {
      const message = this.extractSqlMessage(error);
      if (message) {
        if (message.includes('No existe dbo.sp_pv_cotizacion_cerrar')) {
          return new ConflictException(message);
        }
        if (message.includes('La cotizacion no existe')) {
          return new NotFoundException(message);
        }
        return new BadRequestException(message);
      }
      return new BadRequestException('Error SQL al cerrar cotizacion');
    }

    const message = this.normalizeText((error as any)?.message ?? '');
    if (
      message.toUpperCase().includes('TRANSACTION HAS BEEN ABORTED') ||
      (error as any)?.code === 'EABORT'
    ) {
      return new BadRequestException(
        'La transaccion fue abortada por SQL Server. Revise las validaciones del cierre e intente nuevamente.',
      );
    }

    if (error instanceof Error) return error;
    return new InternalServerErrorException(
      'Error interno al cerrar cotizacion',
    );
  }

  private extractSqlMessage(error: QueryFailedError) {
    const errAny = error as any;
    const driver = errAny?.driverError ?? errAny?.originalError ?? null;
    const driverMessage = this.normalizeText(driver?.message ?? '');
    const baseMessage = this.normalizeText(errAny?.message ?? '');

    const raw = driverMessage || baseMessage;
    if (!raw) return '';

    return raw
      .replace(/^QueryFailedError:\s*/i, '')
      .replace(/^RequestError:\s*/i, '')
      .replace(/\s+\bat line \d+\b/i, '')
      .trim();
  }
}
