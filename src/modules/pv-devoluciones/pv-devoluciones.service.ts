import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError, QueryRunner } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { inferOrigenAut } from '../pvctrfolasvr/pv-folio-homologation.util';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { ListDevolucionesQueryDto } from './dto/list-devoluciones-query.dto';
import { PagoFinalizarFormaDto } from './dto/pago-finalizar-forma.dto';
import { PagoFinalizarDto } from './dto/pago-finalizar.dto';
import { PagoPreviewRequestDto } from './dto/pago-preview-request.dto';
import { UpdateCtddDto } from './dto/update-ctdd.dto';

type SqlExecutor = {
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
};

type FolioInfo = {
  idfol: string;
  idfolInicial: string;
  suc: string;
  aut: string;
  esta: string | null;
  reqf: boolean;
  clien: number | null;
  ter: string | null;
  opv: string | null;
  opvm: string | null;
  idfolOrig: string | null;
  origenAut: 'CA' | 'VF' | null;
};

type DevolucionContext = {
  idfolDev: string;
  idfolInicial: string;
  idfolOrig: string;
  suc: string;
  clien: number | null;
  autDev: string;
  autOrig: string;
  estaDev: string | null;
  rqfacDefault: boolean;
  tipotran: 'CA' | 'VF';
  origenAut: 'CA' | 'VF';
  opv: string | null;
  opvm: string | null;
};

type DevolucionLine = {
  id: string;
  idfolDev: string;
  idfolOrig: string;
  idlineOrig: string | null;
  art: string | null;
  upc: string | null;
  des: string | null;
  ctd: number;
  pvta: number;
  pvtat: number;
  ord: string | null;
  ctddf: number;
  difd: number;
  ctdd: number | null;
  ordBloqueante: boolean;
};

type TotalesDevolucion = {
  subtotal: number;
  iva: number;
  total: number;
  totalBase: number;
  ivaIntegrado: number | null;
  tipotran: 'CA' | 'VF';
  rqfac: boolean;
};

type FormaNormalizada = {
  form: string;
  impp: number;
  aut: string | null;
};

type SupervisorInfo = {
  idUsuario: number;
  username: string;
  roleCode: string;
  suc: string | null;
};

@Injectable()
export class PvDevolucionesService {
  private static readonly FORMAS_PERMITIDAS = new Set([
    'EFECTIVO',
    'TARJETA',
    'CHEQUE',
    'TRANSFERENCIA',
    'DEPOSITO 3RO',
    'CREDITO',
    'DEUDOR',
  ]);

  private static readonly DEV_AUT_INICIALES = new Set(['DCA', 'DVF']);
  private static readonly DEV_AUT_FINALES = new Set(['DCA', 'DVF']);
  private static readonly DEV_AUT_ALL = new Set(['DCA', 'DVF']);
  private static readonly ORIG_AUT_VALIDOS = new Set(['VF', 'CA']);

  private static readonly CTA_CTRL_CTAS = '101001002';
  private static readonly CMOV_DEV_ABONO_ANULACION = 601;
  private static readonly NDOC_BASE = 6100000;
  private static readonly NDOC_LOCK_RESOURCE = 'PV_DEV_NDOC';
  private static readonly FACTURADO_STATUS = 'FACTURADO';
  private static readonly EPSILON = 0.0001;

  private readonly ordBlockThreshold: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    configService: ConfigService,
  ) {
    const raw = Number(configService.get('PV_DEV_ORD_BLOCK_THRESHOLD') ?? 5);
    this.ordBlockThreshold =
      Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 5;
  }

  async list(query: ListDevolucionesQueryDto, user: JwtPayload) {
    const isAdmin = this.isAdmin(user);
    const userSuc = this.normalizeText(user?.suc ?? '');
    const requestedSuc = this.normalizeText(query.suc);
    const suc = requestedSuc || userSuc;
    if (!suc) {
      throw new BadRequestException(
        'Debe indicar sucursal para listar devoluciones',
      );
    }
    this.assertUserSucAccess(user, suc);

    const actorOpv = this.resolveOpv(user);
    if (!actorOpv) {
      throw new BadRequestException(
        'No se pudo resolver OPV para listar devoluciones',
      );
    }
    const requestedOpv = this.normalizeText(query.opv);
    const opv = requestedOpv || actorOpv;
    if (
      !isAdmin &&
      requestedOpv &&
      this.normalizeUpper(requestedOpv) !== this.normalizeUpper(actorOpv)
    ) {
      throw new ForbiddenException(
        'No autorizado para consultar devoluciones de otro OPV',
      );
    }

    const search = this.normalizeText(query.search);
    const searchLike = `%${search}%`;

    const rows = await this.dataSource.query(
      `
      SELECT
        a.*,
        c.RazonSocialReceptor
      FROM dbo.PV_CTR_FOL_ASVR a
      LEFT JOIN dbo.FACT_CLIENT_SHP c ON a.CLIEN = c.IDC
      WHERE a.SUC = @0
        AND (
              (a.OPV  = @1 AND a.ESTA IN ('PENDIENTE','EDITANDO','PAGADO') AND a.AUT IN ('DCA','DVF'))
           OR (a.OPVM = @1 AND a.ESTA IN ('PENDIENTE','EDITANDO','PAGADO') AND a.AUT IN ('DCA','DVF'))
        )
        AND (
          @2 = ''
          OR a.IDFOL LIKE @3
          OR ISNULL(c.RazonSocialReceptor, '') LIKE @3
          OR CAST(ISNULL(a.CLIEN, 0) AS NVARCHAR(50)) LIKE @3
        )
      ORDER BY a.FCN DESC, a.TRA DESC;
      `,
      [suc, opv, search, searchLike],
    );

    return {
      ok: true,
      ordBlockThreshold: this.ordBlockThreshold,
      items: rows ?? [],
    };
  }

  async create(dto: CreateDevolucionDto, user: JwtPayload, ip: string | null) {
    const idfolOrig = this.normalizeIdfol(dto.idfolOrig, 'idfolOrig');
    const authPassword = this.normalizeText(dto.authPassword);
    if (!authPassword) {
      throw new BadRequestException('authPassword es requerido');
    }

    const opvActor = this.resolveOpv(user);
    if (!opvActor) {
      throw new BadRequestException(
        'No se pudo resolver OPV del usuario actual',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await this.ensureStagingTable(queryRunner);
      await this.ensureFacturacionTable(queryRunner);

      const supervisor = await this.validateSupervisor(
        authPassword,
        queryRunner,
      );
      const original = await this.loadFolio(queryRunner, idfolOrig, true);
      this.assertFolioOriginalDevolvible(original);
      this.assertUserSucAccess(user, original.suc);
      await this.assertFolioNoFacturado(queryRunner, idfolOrig);

      const autDev = this.resolveAutDevolucionInicial(original.aut);
      const idfolDev = await this.generateFolioWithProcedure(queryRunner, {
        suc: original.suc,
        opv: opvActor,
        ter: original.ter,
      });

      // sp_pvctrfolasvr_create maneja su propia transacción interna; evitamos
      // envolver su EXEC en la transacción TypeORM para no desbalancear @@TRANCOUNT.
      await queryRunner.startTransaction();

      await this.prepareDevolucionHeader(queryRunner, {
        idfolDev,
        idfolOrig,
        clien: original.clien,
        reqf: original.reqf,
        autDev,
      });

      const inserted = await this.seedStagingLines(queryRunner, {
        idfolDev,
        idfolOrig,
      });
      if (inserted <= 0) {
        throw new ConflictException(
          `El folio ${idfolOrig} no tiene renglones disponibles para devolución`,
        );
      }

      await queryRunner.commitTransaction();

      await this.audit.log({
        IDUSUARIO: supervisor.idUsuario,
        ACTION: 'PV_DEV_CREATE',
        MODULO: 'punto-venta',
        ENTIDAD: 'PV_CTR_FOL_ASVR',
        ENTIDAD_ID: idfolDev,
        SUC: original.suc,
        METADATA_JSON: JSON.stringify({
          idfolDev,
          idfolOrig,
          autDev,
          supervisor: {
            idUsuario: supervisor.idUsuario,
            username: supervisor.username,
            roleCode: supervisor.roleCode,
          },
          requestedBy: {
            idUsuario: Number(user.sub ?? 0) || null,
            username: user.username ?? null,
          },
        }),
        IP: ip,
      });

      return this.detail(idfolDev, user);
    } catch (error) {
      await this.rollbackTransactionSafe(queryRunner);
      throw this.mapError(error, 'No se pudo crear la devolución');
    } finally {
      await queryRunner.release();
    }
  }

  async detail(idfolDevRaw: string, user: JwtPayload) {
    const idfolDev = this.normalizeIdfol(idfolDevRaw, 'idfolDev');
    await this.ensureStagingTable(this.dataSource);
    const context = await this.loadDevolucionContext(this.dataSource, idfolDev);
    this.assertUserSucAccess(user, context.suc);

    const lines = await this.loadStagingLines(
      this.dataSource,
      context.idfolDev,
      context.idfolOrig,
    );

    return {
      ok: true,
      ordBlockThreshold: this.ordBlockThreshold,
      header: this.buildDevolucionContextPayload(context),
      lines,
      summary: this.buildSummary(lines),
    };
  }

  async devolverTodo(idfolDevRaw: string, user: JwtPayload) {
    const idfolDev = this.normalizeIdfol(idfolDevRaw, 'idfolDev');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.ensureStagingTable(queryRunner);
      const context = await this.loadDevolucionContext(
        queryRunner,
        idfolDev,
        true,
      );
      this.assertUserSucAccess(user, context.suc);
      this.assertDevolucionEditable(context);

      await queryRunner.query(
        `
        UPDATE det
        SET CTDD = CASE
          WHEN blk.ORD_BLOQ = 1 THEN NULL
          ELSE det.DIFD
        END
        FROM dbo.PV_DEV_DET_TMP det
        OUTER APPLY (
          SELECT TOP 1 1 AS ORD_BLOQ
          FROM dbo.PV_CTR_ORDS o
          WHERE o.IDFOL = @1
            AND LTRIM(RTRIM(ISNULL(o.IORD, ''))) = LTRIM(RTRIM(ISNULL(det.ORD, '')))
            AND ISNULL(o.ESTSEGU, 0) >= @2
        ) blk
        WHERE det.IDFOLDEV = @0
        `,
        [idfolDev, context.idfolOrig, this.ordBlockThreshold],
      );

      await queryRunner.commitTransaction();
      return this.detail(idfolDev, user);
    } catch (error) {
      await this.rollbackTransactionSafe(queryRunner);
      throw this.mapError(error, 'No se pudo aplicar Devolver TODO');
    } finally {
      await queryRunner.release();
    }
  }

  async updateLinea(
    idfolDevRaw: string,
    lineIdRaw: string,
    dto: UpdateCtddDto,
    user: JwtPayload,
  ) {
    const idfolDev = this.normalizeIdfol(idfolDevRaw, 'idfolDev');
    const lineId = this.normalizeText(lineIdRaw);
    if (!lineId) throw new BadRequestException('lineId es requerido');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.ensureStagingTable(queryRunner);
      const context = await this.loadDevolucionContext(
        queryRunner,
        idfolDev,
        true,
      );
      this.assertUserSucAccess(user, context.suc);
      this.assertDevolucionEditable(context);

      const lineRows = await queryRunner.query(
        `
        SELECT TOP 1 *
        FROM dbo.PV_DEV_DET_TMP WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
        WHERE ID = @0
          AND IDFOLDEV = @1
        `,
        [lineId, idfolDev],
      );
      if (!lineRows?.length) {
        throw new NotFoundException(
          `La línea ${lineId} no existe en ${idfolDev}`,
        );
      }
      const lineRaw = lineRows[0] as Record<string, unknown>;
      const difd = this.round4(this.toNumber(lineRaw.DIFD) ?? 0);
      const ctd = this.round4(this.toNumber(lineRaw.CTD) ?? 0);
      const ord = this.normalizeText(lineRaw.ORD);

      let nextCtdd: number | null = dto.ctdd;
      if (nextCtdd != null) {
        nextCtdd = this.round4(Number(nextCtdd));
        if (!Number.isFinite(nextCtdd) || nextCtdd <= 0) {
          nextCtdd = null;
        }
      }

      if (nextCtdd != null && nextCtdd - difd > PvDevolucionesService.EPSILON) {
        throw new ConflictException(
          `CTDD ${nextCtdd} no puede ser mayor al disponible ${difd}`,
        );
      }

      if (nextCtdd != null && ord) {
        const bloqueante = await this.isOrdBloqueante(
          queryRunner,
          context.idfolOrig,
          ord,
        );
        if (bloqueante) {
          throw new ConflictException(
            `La ORD ${ord} está bloqueada (ESTSEGU >= ${this.ordBlockThreshold})`,
          );
        }
        if (Math.abs(nextCtdd - ctd) > PvDevolucionesService.EPSILON) {
          throw new ConflictException(
            `La línea con ORD ${ord} solo permite devolución completa (CTDD=${ctd})`,
          );
        }
      }

      await queryRunner.query(
        `
        UPDATE dbo.PV_DEV_DET_TMP
        SET CTDD = @2
        WHERE ID = @0
          AND IDFOLDEV = @1
        `,
        [lineId, idfolDev, nextCtdd],
      );

      await queryRunner.commitTransaction();
      return this.detail(idfolDev, user);
    } catch (error) {
      await this.rollbackTransactionSafe(queryRunner);
      throw this.mapError(error, 'No se pudo actualizar CTDD');
    } finally {
      await queryRunner.release();
    }
  }

  async prepararDetalle(idfolDevRaw: string, user: JwtPayload) {
    const idfolDev = this.normalizeIdfol(idfolDevRaw, 'idfolDev');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.ensureStagingTable(queryRunner);
      const context = await this.loadDevolucionContext(
        queryRunner,
        idfolDev,
        true,
      );
      this.assertUserSucAccess(user, context.suc);
      this.assertDevolucionEditable(context);

      const lines = await this.loadStagingLines(
        queryRunner,
        context.idfolDev,
        context.idfolOrig,
      );
      const selected = lines.filter((line) => (line.ctdd ?? 0) > 0);
      if (!selected.length) {
        throw new ConflictException(
          'Debe capturar al menos una línea con CTDD > 0',
        );
      }

      await this.validateSelectedLines(queryRunner, context, selected);
      const processNow = await this.loadSqlProcessNow(queryRunner);
      await this.regenerateTicketDevolucion(
        queryRunner,
        context.idfolDev,
        processNow,
      );
      const items = await this.loadTicketDevolucionLines(
        queryRunner,
        context.idfolDev,
      );
      const total = this.round2(
        items.reduce((acc, item) => acc + item.importe, 0),
      );

      await queryRunner.commitTransaction();

      return {
        ok: true,
        ordBlockThreshold: this.ordBlockThreshold,
        context: this.buildDevolucionContextPayload(context),
        items,
        summary: {
          lines: items.length,
          total,
        },
      };
    } catch (error) {
      await this.rollbackTransactionSafe(queryRunner);
      throw this.mapError(error, 'No se pudo preparar detalle de devolución');
    } finally {
      await queryRunner.release();
    }
  }

  async pagoPreview(
    idfolDevRaw: string,
    dto: PagoPreviewRequestDto,
    user: JwtPayload,
  ) {
    const idfolDev = this.normalizeIdfol(idfolDevRaw, 'idfolDev');
    await this.ensureStagingTable(this.dataSource);
    const context = await this.loadDevolucionContext(this.dataSource, idfolDev);
    this.assertUserSucAccess(user, context.suc);

    const lines = await this.loadStagingLines(
      this.dataSource,
      context.idfolDev,
      context.idfolOrig,
    );
    const ivaIntegrado = await this.loadIvaIntegrado(
      this.dataSource,
      context.suc,
    );
    const totalBase = this.calculateTotalBase(lines);
    const rqfac =
      context.tipotran === 'CA'
        ? false
        : Boolean(dto.rqfac ?? context.rqfacDefault);
    const totals = this.calculateTotals({
      totalBase,
      ivaIntegrado,
      tipotran: context.tipotran,
      rqfac,
    });
    const formasSugeridas = await this.suggestFormasPago(
      this.dataSource,
      context.idfolOrig,
      context.idfolDev,
      totals.total,
    );

    return {
      ok: true,
      ordBlockThreshold: this.ordBlockThreshold,
      context: this.buildDevolucionContextPayload(context),
      totals,
      formasSugeridas,
      linesSelected: lines.filter((line) => (line.ctdd ?? 0) > 0).length,
    };
  }

  async pagoFinalizar(
    idfolDevRaw: string,
    dto: PagoFinalizarDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const idfolDev = this.normalizeIdfol(idfolDevRaw, 'idfolDev');
    const formas = this.normalizeFormas(dto.formas ?? []);
    if (!formas.length) {
      throw new BadRequestException('Debe registrar al menos una forma');
    }

    const opvActor = this.resolveOpv(user);
    if (!opvActor) {
      throw new BadRequestException(
        'No se pudo resolver OPV del usuario actual',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.ensureStagingTable(queryRunner);
      await this.ensureFacturacionTable(queryRunner);
      const context = await this.loadDevolucionContext(
        queryRunner,
        idfolDev,
        true,
      );
      this.assertUserSucAccess(user, context.suc);
      this.assertDevolucionEditable(context);

      await this.assertFolioNoFacturado(queryRunner, context.idfolOrig);

      const lines = await this.loadStagingLines(
        queryRunner,
        context.idfolDev,
        context.idfolOrig,
      );
      const selected = lines.filter((line) => (line.ctdd ?? 0) > 0);
      if (!selected.length) {
        throw new ConflictException(
          'Debe capturar al menos una línea con CTDD > 0',
        );
      }
      await this.validateSelectedLines(queryRunner, context, selected);

      const ivaIntegrado = await this.loadIvaIntegrado(
        queryRunner,
        context.suc,
      );
      const rqfac =
        context.tipotran === 'CA'
          ? false
          : Boolean(dto.rqfac ?? context.rqfacDefault);
      const totalBase = this.calculateTotalBase(lines);
      const totals = this.calculateTotals({
        totalBase,
        ivaIntegrado,
        tipotran: context.tipotran,
        rqfac,
      });

      const sumPagos = this.round2(
        formas.reduce((acc, item) => acc + item.impp, 0),
      );
      const hasEfectivo = formas.some((item) => item.form === 'EFECTIVO');

      if (sumPagos + PvDevolucionesService.EPSILON < totals.total) {
        throw new ConflictException(
          `Las formas no cubren el total de la devolución (${totals.total.toFixed(2)})`,
        );
      }
      if (
        !hasEfectivo &&
        sumPagos - totals.total > PvDevolucionesService.EPSILON
      ) {
        throw new ConflictException(
          'El total de formas excede el total de devolución y no incluye EFECTIVO',
        );
      }

      const cambio = this.round2(Math.max(sumPagos - totals.total, 0));
      const autFinal = this.resolveAutDevolucionFinal(context.autDev);
      const nart = this.round4(
        selected.reduce((acc, item) => acc + (item.ctdd ?? 0), 0),
      );
      const finalizedAt = await this.loadSqlProcessNow(queryRunner);

      await this.insertFactIdfolDev(queryRunner, {
        idfolDev: context.idfolDev,
        idfolOrig: context.idfolOrig,
        suc: context.suc,
        opv: opvActor,
        nart,
        imptd: -sumPagos,
        finalizedAt,
      });

      await this.applyActArt(queryRunner, context.idfolDev, finalizedAt);
      await this.regenerateTicketDevolucion(
        queryRunner,
        context.idfolDev,
        finalizedAt,
      );
      await this.rewriteFormasPagoDevolucion(queryRunner, {
        idfolDev: context.idfolDev,
        formas,
        total: totals.total,
        finalizedAt,
      });
      await this.registerCtasMovimientos(queryRunner, {
        idfolDev: context.idfolDev,
        idfolOrig: context.idfolOrig,
        clien: context.clien,
        suc: context.suc,
        opv: opvActor,
        formas,
        finalizedAt,
      });
      await this.updateOrdsAnuladas(
        queryRunner,
        context.idfolDev,
        context.idfolOrig,
      );
      await this.updateDevolucionHeaderFinal(queryRunner, {
        idfolDev: context.idfolDev,
        autFinal,
        total: totals.total,
        rqfac,
        opv: opvActor,
        finalizedAt,
      });

      let idfolFinal = context.idfolDev;
      const tipoVisibleActual = this.extractVisibleFolioType(context.idfolDev);
      if (tipoVisibleActual !== context.tipotran) {
        const nextVisible = await this.generateNextVisibleFolio(queryRunner, {
          suc: context.suc,
          tipoFolio: context.tipotran,
          fecha: finalizedAt,
        });
        await this.switchDevolucionVisibleFolio(queryRunner, {
          idfolActual: context.idfolDev,
          idfolNuevo: nextVisible.idfol,
          traVisible: nextVisible.consec,
          finalizedAt,
        });
        idfolFinal = nextVisible.idfol;
      }

      await queryRunner.commitTransaction();

      await this.audit.log({
        IDUSUARIO: Number(user.sub ?? 0) || null,
        ACTION: 'PV_DEV_FINALIZE',
        MODULO: 'punto-venta',
        ENTIDAD: 'PV_CTR_FOL_ASVR',
        ENTIDAD_ID: idfolFinal,
        SUC: context.suc,
        METADATA_JSON: JSON.stringify({
          idfolDevInicial: context.idfolDev,
          idfolDevFinal: idfolFinal,
          idfolOrig: context.idfolOrig,
          autFinal,
          totales: totals,
          sumPagos,
          cambio,
          formas: formas.map((f) => ({ ...f })),
          opv: opvActor,
        }),
        IP: ip,
      });

      return {
        ok: true,
        idfolDev: idfolFinal,
        total: totals.total,
        cambio,
        status: 'PAGADO',
        aut: autFinal,
        totals,
      };
    } catch (error) {
      await this.rollbackTransactionSafe(queryRunner);
      throw this.mapError(error, 'No se pudo finalizar la devolución');
    } finally {
      await queryRunner.release();
    }
  }

  async printPreview(idfolDevRaw: string, user: JwtPayload) {
    const idfolDev = this.normalizeIdfol(idfolDevRaw, 'idfolDev');
    const context = await this.loadDevolucionContext(this.dataSource, idfolDev);
    this.assertUserSucAccess(user, context.suc);

    const ivaIntegrado = await this.loadIvaIntegrado(
      this.dataSource,
      context.suc,
    );
    const itemRows = await this.dataSource.query(
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
        IDDEV
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @0
      ORDER BY ID ASC
      `,
      [context.idfolDev],
    );
    const items = (itemRows ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const ctd = this.round4(this.toNumber(row.CTD) ?? 0);
      const pvta = this.round2(this.toNumber(row.PVTA) ?? 0);
      return {
        id: this.normalizeText(row.ID),
        art: this.nullableText(row.ART),
        upc: this.nullableText(row.UPC),
        des: this.nullableText(row.DES),
        ctd,
        pvta,
        importe: this.round2(this.toNumber(row.PVTAT) ?? ctd * pvta),
        ord: this.nullableText(row.ORD),
        iddev: this.nullableText(row.IDDEV),
      };
    });

    const totalBase = this.round2(
      items.reduce((acc, item) => acc + item.ctd * item.pvta, 0),
    );
    const totals = this.calculateTotals({
      totalBase,
      ivaIntegrado,
      tipotran: context.tipotran,
      rqfac: context.rqfacDefault,
    });

    const formas = await this.loadFormasFolio(
      this.dataSource,
      context.idfolDev,
    );
    const sumPagos = this.round2(
      formas.reduce((acc, item) => acc + Math.abs(item.impp), 0),
    );
    const cambio = this.round2(Math.max(sumPagos - totals.total, 0));

    const [header, opvNombre, clienteNombre] = await Promise.all([
      this.loadPrintHeader(this.dataSource, context.suc),
      this.loadOpvNombre(this.dataSource, context.opvm ?? context.opv),
      this.loadClienteNombre(this.dataSource, context.clien),
    ]);

    return {
      ok: true,
      idfolDev: context.idfolDev,
      idfolOrig: context.idfolOrig,
      header,
      items,
      totals: {
        ...totals,
        sumPagos,
        cambio,
      },
      formas: formas.map((item) => ({
        ...item,
        impp: Math.abs(item.impp),
      })),
      footer: {
        opv: context.opvm ?? context.opv,
        opvNombre,
        idfolDev: context.idfolDev,
        idfolOrig: context.idfolOrig,
        clienteId: context.clien,
        clienteNombre,
        aut: context.autDev,
        esta: context.estaDev,
      },
    };
  }

  private normalizeIdfol(value: unknown, label: string) {
    const idfol = this.normalizeText(value);
    if (!idfol) throw new BadRequestException(`${label} es requerido`);
    return idfol;
  }

  private normalizeText(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown) {
    return this.normalizeText(value).toUpperCase();
  }

  private nullableText(value: unknown) {
    const text = this.normalizeText(value);
    return text.length ? text : null;
  }

  private toNumber(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toInt(value: unknown) {
    const num = this.toNumber(value);
    return num == null ? null : Math.trunc(num);
  }

  private async loadSqlProcessNow(executor: SqlExecutor): Promise<Date> {
    const rows = await executor.query(
      `
      SELECT
        GETDATE() AS NOW_SQL,
        DATEPART(TZOFFSET, SYSDATETIMEOFFSET()) AS OFFSET_MINUTES
      `,
    );
    const row = (rows?.[0] ?? {}) as Record<string, unknown>;
    const nowRaw = row.NOW_SQL ?? row.now_sql ?? row.now ?? null;
    const nowSql =
      nowRaw instanceof Date
        ? nowRaw
        : new Date(this.normalizeText(nowRaw ?? ''));

    if (Number.isNaN(nowSql.getTime())) {
      throw new InternalServerErrorException(
        'No se pudo resolver fecha actual desde SQL Server',
      );
    }

    const offsetMinutes = this.toInt(
      row.OFFSET_MINUTES ?? row.offset_minutes ?? null,
    );
    if (offsetMinutes != null && offsetMinutes !== -360) {
      throw new ConflictException(
        `Timezone SQL Server inválido (${offsetMinutes} min). Se requiere America/Mexico_City (-360).`,
      );
    }

    return nowSql;
  }

  private round2(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private round4(value: number) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }

  private isAdmin(user?: JwtPayload | null) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private resolveOpv(user: JwtPayload) {
    const fromUsername = this.normalizeText(user?.username ?? '');
    if (fromUsername) return fromUsername;
    const fromSub = Number(user?.sub ?? 0);
    return Number.isFinite(fromSub) && fromSub > 0 ? String(fromSub) : '';
  }

  private assertUserSucAccess(user: JwtPayload, suc: string) {
    if (this.isAdmin(user)) return;

    const userSuc = this.normalizeText(user?.suc ?? '');
    if (!userSuc || userSuc === '000') return;
    if (userSuc !== suc) {
      throw new ForbiddenException(
        `No autorizado para operar la sucursal ${suc}`,
      );
    }
  }

  private assertFolioOriginalDevolvible(folio: FolioInfo) {
    const aut = this.normalizeUpper(folio.aut);
    if (PvDevolucionesService.DEV_AUT_ALL.has(aut)) {
      throw new ConflictException(
        `El folio ${folio.idfol} ya corresponde a una devolución`,
      );
    }
    if (!PvDevolucionesService.ORIG_AUT_VALIDOS.has(aut)) {
      throw new ConflictException(
        `El folio ${folio.idfol} no es devolvible por AUT=${aut || 'N/D'}`,
      );
    }
  }

  private assertDevolucionEditable(context: DevolucionContext) {
    const estado = this.normalizeEstadoOperativoCompat(context.estaDev);
    if (estado === 'PAGADO' || estado === 'TRANSMITIR') {
      throw new ConflictException(
        `La devolución ${context.idfolDev} ya no es editable por estado ${estado}`,
      );
    }
  }

  private resolveAutDevolucionInicial(origAut: string) {
    return this.normalizeUpper(origAut) === 'CA' ? 'DCA' : 'DVF';
  }

  private resolveAutDevolucionFinal(devAut: string) {
    return this.normalizeUpper(devAut) === 'DCA' ? 'DCA' : 'DVF';
  }

  private async ensureStagingTable(executor: SqlExecutor) {
    const exists = await this.tableExists(executor, 'dbo.PV_DEV_DET_TMP');
    if (!exists) {
      throw new ConflictException(
        'No existe dbo.PV_DEV_DET_TMP. Ejecute sql/PV_DEV_DET_TMP_create.sql',
      );
    }
  }

  private async ensureFacturacionTable(executor: SqlExecutor) {
    const exists = await this.tableExists(executor, 'dbo.FAC_SVR_SHAP');
    if (!exists) {
      throw new ConflictException(
        'No existe dbo.FAC_SVR_SHAP para validar facturación',
      );
    }
  }

  private async validateSupervisor(
    authPassword: string,
    executor: SqlExecutor,
  ): Promise<SupervisorInfo> {
    const rows = await executor.query(
      `
      SELECT
        u.IDUSUARIO,
        u.USERNAME,
        u.PASSWORD_HASH,
        u.SUC,
        r.CODIGO AS ROLE_CODE
      FROM dbo.USUARIO u
      LEFT JOIN dbo.ROL r ON r.IDROL = u.IDROL
      WHERE UPPER(ISNULL(u.ESTATUS, '')) = 'ACTIVO'
      `,
    );

    let matchedAny: SupervisorInfo | null = null;
    for (const raw of rows ?? []) {
      const row = raw as Record<string, unknown>;
      const hash = this.normalizeText(row.PASSWORD_HASH);
      if (!hash) continue;
      const valid = await bcrypt.compare(authPassword, hash);
      if (!valid) continue;

      matchedAny = {
        idUsuario: Number(row.IDUSUARIO ?? 0) || 0,
        username: this.normalizeText(row.USERNAME),
        roleCode: this.normalizeUpper(row.ROLE_CODE),
        suc: this.nullableText(row.SUC),
      };
      if (matchedAny.roleCode === 'SUPERPV') {
        return matchedAny;
      }
      throw new ForbiddenException(
        'El usuario autenticado no es supervisor SUPERPV',
      );
    }

    if (!matchedAny) {
      throw new UnauthorizedException('Contraseña de supervisor inválida');
    }
    throw new ForbiddenException(
      'El usuario autenticado no es supervisor SUPERPV',
    );
  }

  private async loadFolio(
    executor: SqlExecutor,
    idfol: string,
    withLock = false,
  ): Promise<FolioInfo> {
    const lockHint = withLock ? ' WITH (UPDLOCK, HOLDLOCK, ROWLOCK)' : '';
    const rows = await executor.query(
      `
      SELECT TOP 1 *
      FROM dbo.PV_CTR_FOL_ASVR${lockHint}
      WHERE IDFOL = @0
         OR IDFOLINICIAL = @0
      ORDER BY CASE WHEN IDFOL = @0 THEN 0 ELSE 1 END, FCN DESC, FCNM DESC
      `,
      [idfol],
    );
    if (!rows?.length) {
      throw new NotFoundException(`El folio ${idfol} no existe`);
    }
    const row = rows[0] as Record<string, unknown>;
    const suc = this.normalizeText(row.SUC);
    if (!suc) {
      throw new BadRequestException(`El folio ${idfol} no tiene SUC válida`);
    }
    const idfolNorm = this.normalizeText(row.IDFOL);
    const homologation = await this.ensureFolioHomologationFields(executor, {
      idfol: idfolNorm,
      aut: row.AUT,
      idfolInicial: row.IDFOLINICIAL,
      origenAut: row.ORIGEN_AUT,
    });

    return {
      idfol: idfolNorm,
      idfolInicial: homologation.idfolInicial,
      suc,
      aut: this.normalizeUpper(row.AUT),
      esta: this.nullableText(row.ESTA),
      reqf: (this.toInt(row.REQF) ?? 0) === 1,
      clien: this.toNumber(row.CLIEN),
      ter: this.nullableText(row.TER),
      opv: this.nullableText(row.OPV),
      opvm: this.nullableText(row.OPVM),
      idfolOrig: this.nullableText(row.IDFOLORIG),
      origenAut: homologation.origenAut,
    };
  }

  private async loadDevolucionContext(
    executor: SqlExecutor,
    idfolDev: string,
    withLock = false,
  ): Promise<DevolucionContext> {
    const lockHint = withLock ? ' WITH (UPDLOCK, HOLDLOCK, ROWLOCK)' : '';
    const rows = await executor.query(
      `
      SELECT TOP 1
        dev.IDFOL      AS IDFOL_DEV,
        dev.IDFOLINICIAL AS IDFOLINICIAL_DEV,
        dev.IDFOLORIG  AS IDFOL_ORIG,
        dev.ORIGEN_AUT AS ORIGEN_AUT_DEV,
        dev.SUC        AS SUC_DEV,
        dev.CLIEN      AS CLIEN_DEV,
        dev.AUT        AS AUT_DEV,
        dev.ESTA       AS ESTA_DEV,
        dev.REQF       AS REQF_DEV,
        dev.OPV        AS OPV_DEV,
        dev.OPVM       AS OPVM_DEV,
        orig.IDFOLINICIAL AS IDFOLINICIAL_ORIG,
        orig.ORIGEN_AUT AS ORIGEN_AUT_ORIG,
        orig.AUT       AS AUT_ORIG,
        orig.REQF      AS REQF_ORIG,
        orig.CLIEN     AS CLIEN_ORIG,
        orig.SUC       AS SUC_ORIG
      FROM dbo.PV_CTR_FOL_ASVR dev${lockHint}
      LEFT JOIN dbo.PV_CTR_FOL_ASVR orig
        ON orig.IDFOL = dev.IDFOLORIG
      WHERE dev.IDFOL = @0
         OR dev.IDFOLINICIAL = @0
      ORDER BY CASE WHEN dev.IDFOL = @0 THEN 0 ELSE 1 END, dev.FCN DESC, dev.FCNM DESC
      `,
      [idfolDev],
    );
    if (!rows?.length) {
      throw new NotFoundException(`La devolución ${idfolDev} no existe`);
    }
    const row = rows[0] as Record<string, unknown>;
    const idfolDevNorm = this.normalizeText(row.IDFOL_DEV);
    const autDev = this.normalizeUpper(row.AUT_DEV);
    if (!PvDevolucionesService.DEV_AUT_ALL.has(autDev)) {
      throw new NotFoundException(
        `El folio ${idfolDev} no es una devolución PV`,
      );
    }

    const idfolOrig = this.normalizeText(row.IDFOL_ORIG);
    if (!idfolOrig) {
      throw new ConflictException(
        `La devolución ${idfolDev} no tiene IDFOLORIG configurado`,
      );
    }

    const suc =
      this.normalizeText(row.SUC_DEV) || this.normalizeText(row.SUC_ORIG);
    if (!suc) {
      throw new BadRequestException(
        `La devolución ${idfolDev} no tiene SUC válida`,
      );
    }

    const devHomologation = await this.ensureFolioHomologationFields(executor, {
      idfol: idfolDevNorm,
      aut: autDev,
      idfolInicial: row.IDFOLINICIAL_DEV,
      origenAut: row.ORIGEN_AUT_DEV,
    });
    const autOrigRaw = this.normalizeUpper(row.AUT_ORIG);
    const origHomologation = await this.ensureFolioHomologationFields(
      executor,
      {
        idfol: idfolOrig,
        aut: autOrigRaw,
        idfolInicial: row.IDFOLINICIAL_ORIG,
        origenAut: row.ORIGEN_AUT_ORIG,
        fallback: devHomologation.origenAut,
      },
    );
    const autOrig =
      autOrigRaw === 'CA' || autOrigRaw === 'VF'
        ? autOrigRaw
        : origHomologation.origenAut;
    const tipotran: 'CA' | 'VF' = origHomologation.origenAut;
    const reqfOrig =
      (this.toInt(row.REQF_ORIG) ?? this.toInt(row.REQF_DEV) ?? 0) === 1;

    return {
      idfolDev: idfolDevNorm,
      idfolInicial: devHomologation.idfolInicial,
      idfolOrig,
      suc,
      clien: this.toNumber(row.CLIEN_DEV) ?? this.toNumber(row.CLIEN_ORIG),
      autDev,
      autOrig,
      estaDev: this.nullableText(row.ESTA_DEV),
      rqfacDefault: tipotran === 'CA' ? false : reqfOrig,
      tipotran,
      origenAut: devHomologation.origenAut,
      opv: this.nullableText(row.OPV_DEV),
      opvm: this.nullableText(row.OPVM_DEV),
    };
  }

  private async assertFolioNoFacturado(
    executor: SqlExecutor,
    idfolOrig: string,
  ) {
    const rows = await executor.query(
      `
      SELECT TOP 1 ESTATUS
      FROM dbo.FAC_SVR_SHAP
      WHERE IDFOL = @0
      `,
      [idfolOrig],
    );
    const estatus = this.normalizeUpper((rows?.[0] ?? {})['ESTATUS']);
    if (estatus === PvDevolucionesService.FACTURADO_STATUS) {
      throw new ConflictException(
        'Ticket facturado, solicite la anulación de factura para poder realizar la devolución',
      );
    }
  }

  private async generateFolioWithProcedure(
    executor: SqlExecutor,
    input: {
      suc: string;
      opv: string;
      ter: string | null;
    },
  ) {
    try {
      const rows = await executor.query(
        `
        DECLARE @IDFOL_OUT NVARCHAR(255);
        DECLARE @TRA_OUT INT;
        EXEC dbo.sp_pvctrfolasvr_create
          @SUC = @0,
          @OPV = @1,
          @TER = @2,
          @IDFOL_OUT = @IDFOL_OUT OUTPUT,
          @TRA_OUT = @TRA_OUT OUTPUT;
        SELECT @IDFOL_OUT AS IDFOL, @TRA_OUT AS TRA;
        `,
        [input.suc, input.opv, input.ter],
      );
      const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
      const idfol = this.normalizeText(row?.IDFOL);
      if (!idfol) {
        throw new ConflictException('No se pudo generar IDFOL de devolución');
      }
      return idfol;
    } catch (error) {
      if (!this.isDuplicateCtrFolError(error)) {
        throw error;
      }

      const fallbackIdfol = await this.generateFolioFallback(executor, input);
      if (!fallbackIdfol) {
        throw new ConflictException('No se pudo generar IDFOL de devolución');
      }
      return fallbackIdfol;
    }
  }

  private async generateFolioFallback(
    executor: SqlExecutor,
    input: {
      suc: string;
      opv: string;
      ter: string | null;
    },
  ) {
    const rows = await executor.query(
      `
      DECLARE @startedTran BIT = 0;
      DECLARE @sucNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@0, '')));
      DECLARE @opvNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@1, '')));
      DECLARE @terNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@2, ''))), '');
      DECLARE @now DATETIME = GETDATE();
      DECLARE @nextTra INT;
      DECLARE @idfol NVARCHAR(255);

      BEGIN TRY
        IF @@TRANCOUNT = 0
        BEGIN
          SET @startedTran = 1;
          BEGIN TRANSACTION;
        END;

        EXEC dbo.sp_pv_next_visible_folio
          @SUC = @sucNorm,
          @TIPO_FOLIO = 'CP',
          @FECHA = CONVERT(DATE, @now),
          @IDFOL_OUT = @idfol OUTPUT,
          @CONSEC_OUT = @nextTra OUTPUT;

        IF ISNULL(LTRIM(RTRIM(@idfol)), '') = ''
          THROW 57031, 'No se pudo generar folio fallback de devolución', 1;

        INSERT INTO dbo.PV_CTR_FOL_ASVR (
          IDFOL,
          CLIEN,
          FCN,
          SUC,
          TER,
          TRA,
          OPV,
          ESTA,
          IMPT,
          FPGO,
          IMPP,
          AUT,
          REQF,
          FCNM,
          OPVM,
          IDFOLINICIAL,
          ORIGEN_AUT
        )
        VALUES (
          @idfol,
          1,
          @now,
          @sucNorm,
          @terNorm,
          CAST(@nextTra AS NVARCHAR(20)),
          @opvNorm,
          'PENDIENTE',
          0,
          NULL,
          0,
          'CP',
          0,
          @now,
          @opvNorm,
          @idfol,
          'CA'
        );

        IF @startedTran = 1 AND @@TRANCOUNT > 0
          COMMIT TRANSACTION;

        SELECT @idfol AS IDFOL, CAST(@nextTra AS NVARCHAR(20)) AS TRA;
      END TRY
      BEGIN CATCH
        IF @startedTran = 1 AND @@TRANCOUNT > 0
          ROLLBACK TRANSACTION;
        THROW;
      END CATCH
      `,
      [input.suc, input.opv, input.ter],
    );

    const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
    return this.normalizeText(row?.IDFOL);
  }

  private isDuplicateCtrFolError(error: unknown) {
    const sqlMessage = this.readErrorMessage(error).toUpperCase();
    return (
      sqlMessage.includes('VIOLATION OF PRIMARY KEY CONSTRAINT') &&
      sqlMessage.includes('PK_CTR_FOL')
    );
  }

  private readErrorMessage(error: unknown) {
    if (error instanceof QueryFailedError) {
      return this.extractSqlMessage(error);
    }
    if (error instanceof Error) {
      return this.normalizeText(error.message);
    }
    return this.normalizeText(String(error ?? ''));
  }

  private async prepareDevolucionHeader(
    executor: SqlExecutor,
    input: {
      idfolDev: string;
      idfolOrig: string;
      clien: number | null;
      reqf: boolean;
      autDev: string;
    },
  ) {
    const cols = await this.loadTableColumns(executor, 'dbo.PV_CTR_FOL_ASVR');
    const sets: string[] = [
      'IDFOLORIG = @1',
      'CLIEN = @2',
      "ESTA = 'PENDIENTE'",
      'AUT = @3',
      'IMPT = 0',
      'FCNM = NULL',
    ];
    const params: unknown[] = [
      input.idfolDev,
      input.idfolOrig,
      input.clien,
      input.autDev,
    ];
    let idx = 4;
    const rqfacCol = this.pickFirstExistingColumn(cols, ['REQF', 'RQFAC']);
    if (rqfacCol) {
      sets.push(`[${rqfacCol}] = @${idx}`);
      params.push(input.reqf ? 1 : 0);
      idx += 1;
    }
    if (cols.has('IDFOLINICIAL')) {
      sets.push("IDFOLINICIAL = COALESCE(NULLIF(IDFOLINICIAL, ''), IDFOL)");
    }
    if (cols.has('ORIGEN_AUT')) {
      sets.push(`ORIGEN_AUT = @${idx}`);
      params.push(this.resolveOrigenAutCategoria({ aut: input.autDev }));
      idx += 1;
    }
    if (cols.has('OPVM')) {
      sets.push('OPVM = NULL');
    }
    await executor.query(
      `
      UPDATE dbo.PV_CTR_FOL_ASVR
      SET
        ${sets.join(',\n        ')}
      WHERE IDFOL = @0
      `,
      params,
    );
  }

  private async seedStagingLines(
    executor: SqlExecutor,
    input: {
      idfolDev: string;
      idfolOrig: string;
    },
  ) {
    await executor.query(
      `
      DELETE FROM dbo.PV_DEV_DET_TMP
      WHERE IDFOLDEV = @0
      `,
      [input.idfolDev],
    );

    await executor.query(
      `
      INSERT INTO dbo.PV_DEV_DET_TMP (
        ID,
        IDFOLDEV,
        IDFOLORIG,
        IDLINE_ORIG,
        ART,
        UPC,
        DES,
        CTD,
        PVTA,
        PVTAT,
        ORD,
        CTDDF,
        DIFD,
        CTDD,
        FCNR
      )
      SELECT
        CAST(NEWID() AS NVARCHAR(36)) AS ID,
        @0 AS IDFOLDEV,
        @1 AS IDFOLORIG,
        CAST(src.ID AS NVARCHAR(255)) AS IDLINE_ORIG,
        src.ART,
        src.UPC,
        src.DES,
        ISNULL(src.CTD, 0) AS CTD,
        ISNULL(src.PVTA, 0) AS PVTA,
        ISNULL(src.PVTAT, ISNULL(src.CTD, 0) * ISNULL(src.PVTA, 0)) AS PVTAT,
        src.ORD,
        ISNULL(src.CTDDF, 0) AS CTDDF,
        ISNULL(src.CTD, 0) - ISNULL(src.CTDDF, 0) AS DIFD,
        NULL AS CTDD,
        GETDATE() AS FCNR
      FROM dbo.PV_TICKET_LOG src
      WHERE src.IDFOL = @1
        AND (ISNULL(src.CTD, 0) - ISNULL(src.CTDDF, 0)) > 0
      `,
      [input.idfolDev, input.idfolOrig],
    );

    const countRows = await executor.query(
      `
      SELECT COUNT(1) AS CNT
      FROM dbo.PV_DEV_DET_TMP
      WHERE IDFOLDEV = @0
      `,
      [input.idfolDev],
    );
    return this.toInt((countRows?.[0] ?? {})['CNT']) ?? 0;
  }

  private async loadStagingLines(
    executor: SqlExecutor,
    idfolDev: string,
    idfolOrig: string,
  ): Promise<DevolucionLine[]> {
    const blockRows = await executor.query(
      `
      SELECT DISTINCT LTRIM(RTRIM(ISNULL(o.IORD, ''))) AS ORD
      FROM dbo.PV_CTR_ORDS o
      WHERE o.IDFOL = @0
        AND ISNULL(o.ESTSEGU, 0) >= @1
        AND LTRIM(RTRIM(ISNULL(o.IORD, ''))) <> ''
      `,
      [idfolOrig, this.ordBlockThreshold],
    );
    const blockedOrds = new Set(
      (blockRows ?? [])
        .map((raw) => this.normalizeUpper((raw as Record<string, unknown>).ORD))
        .filter((value) => value.length > 0),
    );

    const rows = await executor.query(
      `
      SELECT
        ID,
        IDFOLDEV,
        IDFOLORIG,
        IDLINE_ORIG,
        ART,
        UPC,
        DES,
        CTD,
        PVTA,
        PVTAT,
        ORD,
        CTDDF,
        DIFD,
        CTDD
      FROM dbo.PV_DEV_DET_TMP
      WHERE IDFOLDEV = @0
      ORDER BY FCNR ASC, ID ASC
      `,
      [idfolDev],
    );

    return (rows ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const ctd = this.round4(this.toNumber(row.CTD) ?? 0);
      const pvta = this.round2(this.toNumber(row.PVTA) ?? 0);
      const ord = this.nullableText(row.ORD);
      const ordKey = this.normalizeUpper(ord);

      return {
        id: this.normalizeText(row.ID),
        idfolDev: this.normalizeText(row.IDFOLDEV),
        idfolOrig: this.normalizeText(row.IDFOLORIG),
        idlineOrig: this.nullableText(row.IDLINE_ORIG),
        art: this.nullableText(row.ART),
        upc: this.nullableText(row.UPC),
        des: this.nullableText(row.DES),
        ctd,
        pvta,
        pvtat: this.round2(this.toNumber(row.PVTAT) ?? ctd * pvta),
        ord,
        ctddf: this.round4(this.toNumber(row.CTDDF) ?? 0),
        difd: this.round4(this.toNumber(row.DIFD) ?? 0),
        ctdd:
          this.toNumber(row.CTDD) == null
            ? null
            : this.round4(this.toNumber(row.CTDD) ?? 0),
        ordBloqueante: ordKey.length > 0 && blockedOrds.has(ordKey),
      } satisfies DevolucionLine;
    });
  }

  private buildSummary(lines: DevolucionLine[]) {
    const totalSeleccion = this.round2(
      lines.reduce((acc, line) => {
        const ctdd = line.ctdd ?? 0;
        return ctdd > 0 ? acc + ctdd * line.pvta : acc;
      }, 0),
    );

    const totalDisponible = this.round2(
      lines.reduce((acc, line) => {
        return line.difd > 0 ? acc + line.difd * line.pvta : acc;
      }, 0),
    );

    return {
      lines: lines.length,
      linesSelected: lines.filter((line) => (line.ctdd ?? 0) > 0).length,
      totalSeleccion,
      totalDisponible,
    };
  }

  private calculateTotalBase(lines: DevolucionLine[]) {
    return this.round2(
      lines.reduce((acc, line) => {
        const ctdd = line.ctdd ?? 0;
        return ctdd > 0 ? acc + ctdd * line.pvta : acc;
      }, 0),
    );
  }

  private async validateSelectedLines(
    executor: SqlExecutor,
    context: DevolucionContext,
    selected: DevolucionLine[],
  ) {
    for (const line of selected) {
      const ctdd = this.round4(line.ctdd ?? 0);
      if (ctdd <= 0) continue;
      if (ctdd - line.difd > PvDevolucionesService.EPSILON) {
        throw new ConflictException(
          `CTDD en línea ${line.id} excede el disponible (${line.difd})`,
        );
      }
      if (!line.ord) continue;

      const bloqueante = await this.isOrdBloqueante(
        executor,
        context.idfolOrig,
        line.ord,
      );
      if (bloqueante) {
        throw new ConflictException(
          `La ORD ${line.ord} está bloqueada (ESTSEGU >= ${this.ordBlockThreshold})`,
        );
      }
      if (Math.abs(ctdd - line.ctd) > PvDevolucionesService.EPSILON) {
        throw new ConflictException(
          `La línea con ORD ${line.ord} solo permite devolución completa`,
        );
      }
    }
  }

  private async loadTicketDevolucionLines(
    executor: SqlExecutor,
    idfolDev: string,
  ) {
    const rows = await executor.query(
      `
      SELECT
        ID,
        IDFOL,
        UPC,
        ART,
        DES,
        CTD,
        PVTA,
        PVTAT,
        ORD,
        IDDEV,
        UPDATED_AT
      FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @0
      ORDER BY UPDATED_AT ASC, ID ASC
      `,
      [idfolDev],
    );

    return (rows ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const ctd = this.round4(this.toNumber(row.CTD) ?? 0);
      const pvta = this.round2(this.toNumber(row.PVTA) ?? 0);
      const pvtat = this.round2(this.toNumber(row.PVTAT) ?? ctd * pvta);

      return {
        id: this.normalizeText(row.ID),
        idfol: this.normalizeText(row.IDFOL),
        upc: this.nullableText(row.UPC),
        art: this.nullableText(row.ART),
        des: this.nullableText(row.DES),
        ctd,
        pvta,
        pvtat,
        ord: this.nullableText(row.ORD),
        iddev: this.nullableText(row.IDDEV),
        updatedAt: this.nullableText(row.UPDATED_AT),
        importe: pvtat,
      };
    });
  }

  private calculateTotals(input: {
    totalBase: number;
    ivaIntegrado: number | null;
    tipotran: 'CA' | 'VF';
    rqfac: boolean;
  }): TotalesDevolucion {
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

  private async loadIvaIntegrado(executor: SqlExecutor, suc: string) {
    const rows = await executor.query(
      `
      SELECT TOP 1 IVA_INTEGRADO
      FROM dbo.DAT_SUC
      WHERE SUC = @0
      `,
      [suc],
    );
    if (!rows?.length) {
      throw new NotFoundException(
        `No existe configuración de sucursal en DAT_SUC para ${suc}`,
      );
    }
    return (
      this.toInt((rows[0] as Record<string, unknown>).IVA_INTEGRADO) ?? null
    );
  }

  private async suggestFormasPago(
    executor: SqlExecutor,
    idfolOrig: string,
    idfolDev: string,
    total: number,
  ) {
    if (total <= 0) return [];

    const formaOrig = await this.loadPrimaryFormaOriginal(executor, idfolOrig);
    const sugeridas: Array<{ form: string; impp: number; aut: string | null }> =
      [];

    if (formaOrig === 'CREDITO' || formaOrig === 'DEUDOR') {
      const debeRows = await executor.query(
        `
        SELECT SUM(ISNULL(IMPT, 0)) AS DEBE
        FROM dbo.DAT_CTRL_CTAS
        WHERE IDFOL = @0
        `,
        [idfolOrig],
      );
      const debe = this.toNumber((debeRows?.[0] ?? {})['DEBE']) ?? 0;
      const abonoCr = this.round2(Math.min(total, Math.max(-debe, 0)));
      const efectivo = this.round2(Math.max(total - abonoCr, 0));

      if (abonoCr > 0) {
        sugeridas.push({
          form: formaOrig,
          impp: abonoCr,
          aut: idfolDev,
        });
      }
      if (efectivo > 0) {
        sugeridas.push({
          form: 'EFECTIVO',
          impp: efectivo,
          aut: null,
        });
      }
      if (sugeridas.length) return sugeridas;
    }

    return [
      {
        form: 'EFECTIVO',
        impp: this.round2(total),
        aut: null,
      },
    ];
  }

  private async loadPrimaryFormaOriginal(
    executor: SqlExecutor,
    idfolOrig: string,
  ) {
    const tableName = await this.resolveFolioFormTable(executor);
    const cols = await this.loadTableColumns(executor, tableName);
    if (!cols.has('FORM')) return null;

    let orderBy = '[FORM] ASC';
    if (cols.has('FCN')) {
      orderBy = '[FCN] ASC';
    } else if (cols.has('IDF')) {
      orderBy = '[IDF] ASC';
    }

    const rows = await executor.query(
      `
      SELECT TOP 1 FORM
      FROM ${tableName}
      WHERE IDFOL = @0
      ORDER BY ${orderBy}
      `,
      [idfolOrig],
    );

    const forma = this.normalizeForma((rows?.[0] ?? {})['FORM']);
    return forma || null;
  }

  private normalizeForma(value: unknown) {
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

    return aliases[raw] ?? '';
  }

  private normalizeFormas(items: PagoFinalizarFormaDto[]): FormaNormalizada[] {
    const output: FormaNormalizada[] = [];
    for (const item of items ?? []) {
      const form = this.normalizeForma(item.form);
      if (!form || !PvDevolucionesService.FORMAS_PERMITIDAS.has(form)) {
        throw new BadRequestException(
          `Forma de pago inválida: ${item.form ?? 'N/D'}`,
        );
      }
      const imppRaw = Number(item.impp);
      if (!Number.isFinite(imppRaw) || imppRaw <= 0) {
        throw new BadRequestException(`Importe inválido para forma ${form}`);
      }

      output.push({
        form,
        impp: this.round2(imppRaw),
        aut: this.nullableText(item.aut),
      });
    }
    return output;
  }

  private async isOrdBloqueante(
    executor: SqlExecutor,
    idfolOrig: string,
    ordRaw: string,
  ) {
    const ord = this.normalizeText(ordRaw);
    if (!ord) return false;

    const rows = await executor.query(
      `
      SELECT TOP 1 o.IORD
      FROM dbo.PV_CTR_ORDS o
      WHERE o.IDFOL = @0
        AND LTRIM(RTRIM(ISNULL(o.IORD, ''))) = @1
        AND ISNULL(o.ESTSEGU, 0) >= @2
      `,
      [idfolOrig, ord, this.ordBlockThreshold],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async insertFactIdfolDev(
    executor: SqlExecutor,
    input: {
      idfolDev: string;
      idfolOrig: string;
      suc: string;
      opv: string;
      nart: number;
      imptd: number;
      finalizedAt: Date;
    },
  ) {
    const tableName = 'dbo.FACT_IDFOLDEV';
    if (!(await this.tableExists(executor, tableName))) {
      throw new ConflictException(
        'No existe dbo.FACT_IDFOLDEV para registrar la devolución',
      );
    }

    const colsSet = await this.loadTableColumns(executor, tableName);
    const required = ['IDFOLDEV', 'IMPTD'];
    const missing = required.filter((col) => !colsSet.has(col));
    if (missing.length > 0) {
      throw new ConflictException(
        `FACT_IDFOLDEV no contiene columnas requeridas: ${missing.join(', ')}`,
      );
    }

    const cols: string[] = ['IDFOLDEV', 'IMPTD'];
    const values: string[] = ['@0', '@1'];
    const params: unknown[] = [input.idfolDev, this.round2(input.imptd)];

    const pushValue = (column: string, value: unknown) => {
      cols.push(column);
      values.push(`@${params.length}`);
      params.push(value);
    };
    const pushNow = (column: string) => {
      cols.push(column);
      values.push(`@${params.length}`);
      params.push(input.finalizedAt);
    };

    if (colsSet.has('IDFOL_OR')) pushValue('IDFOL_OR', input.idfolOrig);
    if (colsSet.has('NART')) pushValue('NART', this.round4(input.nart));
    if (colsSet.has('TIPOT')) pushValue('TIPOT', 'DF');
    if (colsSet.has('SUC')) pushValue('SUC', input.suc);
    if (colsSet.has('OPV')) pushValue('OPV', input.opv);
    if (colsSet.has('IDOPV')) pushValue('IDOPV', input.opv);
    if (colsSet.has('FCN')) pushNow('FCN');
    if (colsSet.has('FCNR')) pushNow('FCNR');

    await executor.query(
      `
      INSERT INTO ${tableName} (
        ${cols.map((name) => `[${name}]`).join(',\n        ')}
      )
      VALUES (
        ${values.join(',\n        ')}
      )
      `,
      params,
    );
  }

  private async applyActArt(
    executor: SqlExecutor,
    idfolDev: string,
    finalizedAt: Date,
  ) {
    await executor.query(
      `
      UPDATE orig
      SET
        orig.CTDDF = ISNULL(orig.CTDDF, 0) + dev.CTDD,
        orig.CTDD = NULL,
        orig.UPDATED_AT = @1
      FROM dbo.PV_TICKET_LOG orig
      INNER JOIN dbo.PV_DEV_DET_TMP dev
        ON CAST(orig.ID AS NVARCHAR(255)) = dev.IDLINE_ORIG
      WHERE dev.IDFOLDEV = @0
        AND ISNULL(dev.CTDD, 0) > 0
      `,
      [idfolDev, finalizedAt],
    );
  }

  private async regenerateTicketDevolucion(
    executor: SqlExecutor,
    idfolDev: string,
    finalizedAt: Date,
  ) {
    await executor.query(
      `
      DELETE FROM dbo.PV_TICKET_LOG
      WHERE IDFOL = @0
      `,
      [idfolDev],
    );

    await executor.query(
      `
      INSERT INTO dbo.PV_TICKET_LOG (
        ID,
        IDFOL,
        UPC,
        ART,
        DES,
        CTD,
        PVTA,
        PVTAT,
        ORD,
        IDDEV,
        CTDD,
        CTDDF,
        UPDATED_AT
      )
      SELECT
        CAST(NEWID() AS NVARCHAR(36)) AS ID,
        @0 AS IDFOL,
        det.UPC,
        det.ART,
        det.DES,
        det.CTDD,
        det.PVTA,
        ROUND(ISNULL(det.CTDD, 0) * ISNULL(det.PVTA, 0), 2),
        det.ORD,
        det.IDLINE_ORIG,
        NULL,
        NULL,
        @1
      FROM dbo.PV_DEV_DET_TMP det
      WHERE det.IDFOLDEV = @0
        AND ISNULL(det.CTDD, 0) > 0
      `,
      [idfolDev, finalizedAt],
    );
  }

  private async rewriteFormasPagoDevolucion(
    executor: SqlExecutor,
    input: {
      idfolDev: string;
      formas: FormaNormalizada[];
      total: number;
      finalizedAt: Date;
    },
  ) {
    const tableName = await this.resolveFolioFormTable(executor);
    const colsSet = await this.loadTableColumns(executor, tableName);

    await executor.query(
      `
      DELETE FROM ${tableName}
      WHERE IDFOL = @0
      `,
      [input.idfolDev],
    );

    for (const forma of input.formas) {
      const isCreditoDeudor =
        forma.form === 'CREDITO' || forma.form === 'DEUDOR';
      const isEfectivo = forma.form === 'EFECTIVO';
      const imppValue = -this.round2(Math.abs(forma.impp));
      const impdValue = isCreditoDeudor ? 0 : imppValue;
      const impcValue = isCreditoDeudor
        ? 0
        : isEfectivo
          ? impdValue
          : -this.round2(Math.abs(input.total));

      const cols = ['IDF', 'IDFOL', 'FCN', 'FORM', 'IMPP'];
      const values = ['@0', '@1', '@2', '@3', '@4'];
      const params: unknown[] = [
        randomUUID(),
        input.idfolDev,
        input.finalizedAt,
        forma.form,
        imppValue,
      ];

      if (colsSet.has('IMPC')) {
        cols.push('IMPC');
        values.push(`@${params.length}`);
        params.push(impcValue);
      }

      if (colsSet.has('IMPA')) {
        cols.push('IMPA');
        values.push(`@${params.length}`);
        params.push(0);
      }

      if (colsSet.has('IMPD')) {
        cols.push('IMPD');
        values.push(`@${params.length}`);
        params.push(impdValue);
      }

      if (colsSet.has('AUT')) {
        cols.push('AUT');
        values.push(`@${params.length}`);
        params.push(isCreditoDeudor ? input.idfolDev : forma.aut);
      }

      await executor.query(
        `
        INSERT INTO ${tableName} (
          ${cols.join(',\n          ')}
        )
        VALUES (
          ${values.join(',\n          ')}
        )
        `,
        params,
      );
    }
  }

  private async registerCtasMovimientos(
    executor: SqlExecutor,
    input: {
      idfolDev: string;
      idfolOrig: string;
      clien: number | null;
      suc: string;
      opv: string;
      formas: FormaNormalizada[];
      finalizedAt: Date;
    },
  ) {
    const clientId = Number(input.clien ?? NaN);
    const creditForms = input.formas.filter(
      (forma) => forma.form === 'CREDITO' || forma.form === 'DEUDOR',
    );
    if (!creditForms.length) return;

    if (!Number.isFinite(clientId) || clientId <= 0) {
      throw new ConflictException(
        'No se puede registrar movimiento de CREDITO/DEUDOR sin cliente válido',
      );
    }

    const needNdoc = await this.shouldGenerateNdoc(executor);

    for (const forma of creditForms) {
      const classCode = PvDevolucionesService.CMOV_DEV_ABONO_ANULACION;
      const imptPos = this.round2(Math.abs(forma.impp));
      if (imptPos <= 0) continue;

      const ndoc = needNdoc ? await this.generateNextNdoc(executor) : '';
      await this.insertDatCtrDocIfAvailable(executor, {
        ndoc,
        idfol: input.idfolOrig,
        ticketRef: input.idfolOrig,
        clientId,
        classCode,
        impt: imptPos,
        suc: input.suc,
        opv: input.opv,
        form: forma.form,
        finalizedAt: input.finalizedAt,
      });
      await this.insertDatCtrlCtasMovimiento(executor, {
        ndoc,
        idfol: input.idfolOrig,
        ticketRef: input.idfolOrig,
        clientId,
        classCode,
        impt: imptPos,
        suc: input.suc,
        opv: input.opv,
        form: forma.form,
        finalizedAt: input.finalizedAt,
      });
    }
  }

  private async shouldGenerateNdoc(executor: SqlExecutor) {
    const ctrlCols = await this.loadTableColumns(executor, 'dbo.DAT_CTRL_CTAS');
    if (ctrlCols.has('NDOC')) return true;

    if (await this.tableExists(executor, 'dbo.DAT_CTR_DOC')) {
      const docCols = await this.loadTableColumns(executor, 'dbo.DAT_CTR_DOC');
      if (docCols.has('NDOC')) return true;
    }

    return false;
  }

  private async updateOrdsAnuladas(
    executor: SqlExecutor,
    idfolDev: string,
    idfolOrig: string,
  ) {
    await executor.query(
      `
      UPDATE ord
      SET ord.ESTATUS = 4
      FROM dbo.PV_CTR_ORDS ord
      INNER JOIN (
        SELECT DISTINCT LTRIM(RTRIM(ISNULL(ORD, ''))) AS ORD
        FROM dbo.PV_DEV_DET_TMP
        WHERE IDFOLDEV = @0
          AND ISNULL(CTDD, 0) > 0
          AND LTRIM(RTRIM(ISNULL(ORD, ''))) <> ''
      ) x
        ON LTRIM(RTRIM(ISNULL(ord.IORD, ''))) = x.ORD
      WHERE ord.IDFOL = @1
      `,
      [idfolDev, idfolOrig],
    );
  }

  private async updateDevolucionHeaderFinal(
    executor: SqlExecutor,
    input: {
      idfolDev: string;
      autFinal: string;
      total: number;
      rqfac: boolean;
      opv: string;
      finalizedAt: Date;
    },
  ) {
    const cols = await this.loadTableColumns(executor, 'dbo.PV_CTR_FOL_ASVR');
    const sets: string[] = ['ESTA = @1', 'AUT = @2', 'IMPT = @3', 'FCNM = @4'];
    const params: unknown[] = [
      input.idfolDev,
      'PAGADO',
      input.autFinal,
      -this.round2(Math.abs(input.total)),
      input.finalizedAt,
    ];
    let idx = 5;

    const rqfacCol = this.pickFirstExistingColumn(cols, ['REQF', 'RQFAC']);
    if (rqfacCol) {
      sets.push(`[${rqfacCol}] = @${idx}`);
      params.push(input.rqfac ? 1 : 0);
      idx += 1;
    }

    if (cols.has('OPVM')) {
      sets.push(`OPVM = @${idx}`);
      params.push(input.opv);
      idx += 1;
    }
    if (cols.has('IDFOLINICIAL')) {
      sets.push("IDFOLINICIAL = COALESCE(NULLIF(IDFOLINICIAL, ''), IDFOL)");
    }
    if (cols.has('ORIGEN_AUT')) {
      sets.push(`ORIGEN_AUT = @${idx}`);
      params.push(this.resolveOrigenAutCategoria({ aut: input.autFinal }));
      idx += 1;
    }

    await executor.query(
      `
      UPDATE dbo.PV_CTR_FOL_ASVR
      SET
        ${sets.join(',\n        ')}
      WHERE IDFOL = @0
      `,
      params,
    );
  }

  private extractVisibleFolioType(idfol: string): 'CP' | 'CA' | 'VF' | '' {
    const match = this.normalizeUpper(idfol).match(/-(CP|CA|VF)-/);
    const tipo = match?.[1] ?? '';
    return tipo === 'CP' || tipo === 'CA' || tipo === 'VF' ? tipo : '';
  }

  private async generateNextVisibleFolio(
    executor: SqlExecutor,
    input: {
      suc: string;
      tipoFolio: 'CA' | 'VF';
      fecha: Date;
    },
  ) {
    const rows = await executor.query(
      `
      DECLARE @idfolOut NVARCHAR(255);
      DECLARE @consecOut INT;
      EXEC dbo.sp_pv_next_visible_folio
        @SUC = @0,
        @TIPO_FOLIO = @1,
        @FECHA = @2,
        @IDFOL_OUT = @idfolOut OUTPUT,
        @CONSEC_OUT = @consecOut OUTPUT;
      SELECT @idfolOut AS IDFOL, @consecOut AS CONSEC;
      `,
      [input.suc, input.tipoFolio, input.fecha],
    );
    const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
    const idfol = this.normalizeText(row?.IDFOL);
    const consec = this.toInt(row?.CONSEC);
    if (!idfol || !consec || consec <= 0) {
      throw new ConflictException(
        'No se pudo generar folio visible final para la devolución',
      );
    }
    return { idfol, consec };
  }

  private async switchDevolucionVisibleFolio(
    executor: SqlExecutor,
    input: {
      idfolActual: string;
      idfolNuevo: string;
      traVisible: number;
      finalizedAt: Date;
    },
  ) {
    if (
      this.normalizeUpper(input.idfolActual) ===
      this.normalizeUpper(input.idfolNuevo)
    ) {
      return;
    }

    const targetExists = await executor.query(
      `
      SELECT TOP 1 IDFOL
      FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
      WHERE IDFOL = @0
      `,
      [input.idfolNuevo],
    );
    if (targetExists?.length) {
      throw new ConflictException(
        `El folio visible ${input.idfolNuevo} ya existe`,
      );
    }

    await executor.query(
      `
      UPDATE dbo.PV_TICKET_LOG
      SET IDFOL = @1
      WHERE IDFOL = @0
      `,
      [input.idfolActual, input.idfolNuevo],
    );

    const folioFormTable = await this.resolveFolioFormTable(executor);
    await executor.query(
      `
      UPDATE ${folioFormTable}
      SET IDFOL = @1
      WHERE IDFOL = @0
      `,
      [input.idfolActual, input.idfolNuevo],
    );
    const folioFormCols = await this.loadTableColumns(executor, folioFormTable);
    if (folioFormCols.has('AUT')) {
      await executor.query(
        `
        UPDATE ${folioFormTable}
        SET AUT = @1
        WHERE IDFOL = @1
          AND LTRIM(RTRIM(ISNULL(AUT, ''))) = @0
        `,
        [input.idfolActual, input.idfolNuevo],
      );
    }

    if (await this.tableExists(executor, 'dbo.PV_DEV_DET_TMP')) {
      const tmpCols = await this.loadTableColumns(
        executor,
        'dbo.PV_DEV_DET_TMP',
      );
      if (tmpCols.has('IDFOLDEV')) {
        await executor.query(
          `
          UPDATE dbo.PV_DEV_DET_TMP
          SET IDFOLDEV = @1
          WHERE IDFOLDEV = @0
          `,
          [input.idfolActual, input.idfolNuevo],
        );
      }
    }

    if (await this.tableExists(executor, 'dbo.FACT_IDFOLDEV')) {
      const factCols = await this.loadTableColumns(
        executor,
        'dbo.FACT_IDFOLDEV',
      );
      if (factCols.has('IDFOLDEV')) {
        await executor.query(
          `
          UPDATE dbo.FACT_IDFOLDEV
          SET IDFOLDEV = @1
          WHERE IDFOLDEV = @0
          `,
          [input.idfolActual, input.idfolNuevo],
        );
      }
    }

    const cols = await this.loadTableColumns(executor, 'dbo.PV_CTR_FOL_ASVR');
    const sets: string[] = ['IDFOL = @1'];
    const params: unknown[] = [input.idfolActual, input.idfolNuevo];
    let idx = 2;

    if (cols.has('TRA')) {
      sets.push(`TRA = @${idx}`);
      params.push(String(input.traVisible));
      idx += 1;
    }
    if (cols.has('FCNM')) {
      sets.push(`FCNM = @${idx}`);
      params.push(input.finalizedAt);
      idx += 1;
    }
    if (cols.has('IDFOLINICIAL')) {
      sets.push("IDFOLINICIAL = COALESCE(NULLIF(IDFOLINICIAL, ''), @0)");
    }

    await executor.query(
      `
      UPDATE dbo.PV_CTR_FOL_ASVR
      SET
        ${sets.join(',\n        ')}
      WHERE IDFOL = @0
      `,
      params,
    );
  }

  private buildDevolucionContextPayload(context: DevolucionContext) {
    return {
      idfolDev: context.idfolDev,
      idfolInicial: context.idfolInicial,
      idfolOrig: context.idfolOrig,
      suc: context.suc,
      clien: context.clien,
      autDev: context.autDev,
      autOrig: context.autOrig,
      estaDev: context.estaDev,
      rqfacDefault: context.rqfacDefault,
      tipotran: context.tipotran,
      origenAut: context.origenAut,
      opv: context.opv,
      opvm: context.opvm,
    };
  }

  private normalizeEstadoOperativoCompat(value: unknown) {
    const estado = this.normalizeUpper(value);
    if (!estado) return 'PENDIENTE';
    if (
      estado === 'EDITANDO' ||
      estado === 'DEV PEND' ||
      estado === 'PAGADO2'
    ) {
      return 'PENDIENTE';
    }
    if (estado.startsWith('PAGADO')) return 'PAGADO';
    if (estado.startsWith('TRANSMIT')) return 'TRANSMITIR';
    return estado;
  }

  private resolveOrigenAutCategoria(input: {
    aut?: unknown;
    origenAut?: unknown;
    fallback?: 'CA' | 'VF';
  }): 'CA' | 'VF' {
    const resolved = inferOrigenAut({
      aut: input.aut,
      origenAut: input.origenAut,
      fallback: input.fallback,
    });
    return resolved === 'VF' ? 'VF' : 'CA';
  }

  private async ensureFolioHomologationFields(
    executor: SqlExecutor,
    input: {
      idfol: string;
      aut?: unknown;
      idfolInicial?: unknown;
      origenAut?: unknown;
      fallback?: 'CA' | 'VF';
    },
  ): Promise<{ idfolInicial: string; origenAut: 'CA' | 'VF' }> {
    const idfol = this.normalizeText(input.idfol);
    const idfolInicial = this.normalizeText(input.idfolInicial) || idfol;
    const origenAut = this.resolveOrigenAutCategoria({
      aut: input.aut,
      origenAut: input.origenAut,
      fallback: input.fallback,
    });
    const cols = await this.loadTableColumns(executor, 'dbo.PV_CTR_FOL_ASVR');
    const needsIdfolInicial =
      cols.has('IDFOLINICIAL') && !this.normalizeText(input.idfolInicial);
    const needsOrigenAut =
      cols.has('ORIGEN_AUT') && !this.normalizeUpper(input.origenAut);
    if (!needsIdfolInicial && !needsOrigenAut) {
      return { idfolInicial, origenAut };
    }

    const sets: string[] = [];
    const params: unknown[] = [idfol];
    let idx = 1;
    if (needsIdfolInicial) {
      sets.push("IDFOLINICIAL = COALESCE(NULLIF(IDFOLINICIAL, ''), IDFOL)");
    }
    if (needsOrigenAut) {
      sets.push(`ORIGEN_AUT = @${idx}`);
      params.push(origenAut);
      idx += 1;
    }

    await executor.query(
      `
      UPDATE dbo.PV_CTR_FOL_ASVR
      SET
        ${sets.join(',\n        ')}
      WHERE IDFOL = @0
      `,
      params,
    );

    return { idfolInicial, origenAut };
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

  private async loadFormasFolio(executor: SqlExecutor, idfol: string) {
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
        const imppRaw = imppCol ?? impdCol ?? 0;
        return {
          idf:
            this.normalizeText(this.getRowValue(row, 'IDF') ?? '') ||
            `F-${index + 1}`,
          form: this.normalizeText(this.getRowValue(row, 'FORM') ?? ''),
          impp: this.round2(imppRaw),
          aut: this.nullableText(this.getRowValue(row, 'AUT') ?? ''),
          fcn: this.nullableText(this.getRowValue(row, 'FCN') ?? ''),
        };
      })
      .filter((item) => item.form.length > 0);
  }

  private async loadPrintHeader(executor: SqlExecutor, suc: string) {
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
      desc: this.nullableText(row.DESC),
      encar: this.nullableText(row.ENCAR),
      zona: this.nullableText(row.ZONA),
      rfc: this.nullableText(row.RFC),
      direccion: this.nullableText(row.DIRECCION),
      contacto: this.nullableText(row.CONTACTO),
    };
  }

  private async loadOpvNombre(executor: SqlExecutor, opv: string | null) {
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
    return this.nullableText((rows?.[0] ?? {})['OPV_NOMBRE']);
  }

  private async loadClienteNombre(executor: SqlExecutor, clien: number | null) {
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
    return this.nullableText((rows?.[0] ?? {})['CLIENTE_NOMBRE']);
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
      [PvDevolucionesService.NDOC_LOCK_RESOURCE],
    );
    const lockResult = this.toInt((lockRows?.[0] ?? {})['LOCK_RESULT']) ?? -1;
    if (lockResult < 0) {
      throw new ConflictException(
        'No se pudo asegurar consecutivo NDOC para devolución',
      );
    }

    let maxNum = PvDevolucionesService.NDOC_BASE;
    const ctrlCols = await this.loadTableColumns(executor, 'dbo.DAT_CTRL_CTAS');
    if (ctrlCols.has('NDOC')) {
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
    }

    if (await this.tableExists(executor, 'dbo.DAT_CTR_DOC')) {
      const docCols = await this.loadTableColumns(executor, 'dbo.DAT_CTR_DOC');
      if (docCols.has('NDOC')) {
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
    }

    const next = Math.max(maxNum, PvDevolucionesService.NDOC_BASE) + 1;
    return `N${next}`;
  }

  private async insertDatCtrDocIfAvailable(
    executor: SqlExecutor,
    input: {
      ndoc: string;
      idfol: string;
      ticketRef: string;
      clientId: number;
      classCode: number;
      impt: number;
      suc: string;
      opv: string;
      form: string;
      finalizedAt: Date;
    },
  ) {
    const tableName = 'dbo.DAT_CTR_DOC';
    if (!(await this.tableExists(executor, tableName))) return;

    const colsSet = await this.loadTableColumns(executor, tableName);
    if (!colsSet.has('NDOC')) return;

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
      values.push(`@${params.length}`);
      params.push(input.finalizedAt);
    };

    const classColumn = colsSet.has('CMOV')
      ? 'CMOV'
      : colsSet.has('CLSD')
        ? 'CLSD'
        : null;
    const rtxt = `Abono por anulacion cliente ticket ${input.ticketRef}`;

    if (colsSet.has('IDFOL')) pushValue('IDFOL', input.idfol);
    if (colsSet.has('CLIENT')) pushValue('CLIENT', input.clientId);
    if (colsSet.has('CTA'))
      pushValue('CTA', PvDevolucionesService.CTA_CTRL_CTAS);
    if (classColumn != null) pushValue(classColumn, input.classCode);
    if (colsSet.has('IMPT')) pushValue('IMPT', this.round2(input.impt));
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
        ${cols.map((col) => `[${col}]`).join(',\n        ')}
      )
      VALUES (
        ${values.join(',\n        ')}
      )
      `,
      params,
    );
  }

  private async insertDatCtrlCtasMovimiento(
    executor: SqlExecutor,
    input: {
      ndoc: string;
      idfol: string;
      ticketRef: string;
      clientId: number;
      classCode: number;
      impt: number;
      suc: string;
      opv: string;
      form: string;
      finalizedAt: Date;
    },
  ) {
    const tableName = 'dbo.DAT_CTRL_CTAS';
    const colsSet = await this.loadTableColumns(executor, tableName);
    const classColumn = colsSet.has('CMOV')
      ? 'CMOV'
      : colsSet.has('CLSD')
        ? 'CLSD'
        : null;

    const required = ['CTA', 'CLIENT', 'IMPT', 'IDFOL'];
    const missing = required.filter((col) => !colsSet.has(col));
    if (missing.length > 0 || classColumn == null) {
      if (classColumn == null) missing.push('CMOV/CLSD');
      throw new ConflictException(
        `DAT_CTRL_CTAS no contiene columnas requeridas: ${missing.join(', ')}`,
      );
    }

    const cols: string[] = ['CTA', 'CLIENT', classColumn, 'IMPT'];
    const values: string[] = ['@0', '@1', '@2', '@3'];
    const params: unknown[] = [
      PvDevolucionesService.CTA_CTRL_CTAS,
      input.clientId,
      input.classCode,
      this.round2(input.impt),
    ];

    const pushValue = (column: string, value: unknown) => {
      cols.push(column);
      values.push(`@${params.length}`);
      params.push(value);
    };
    const pushNow = (column: string) => {
      cols.push(column);
      values.push(`@${params.length}`);
      params.push(input.finalizedAt);
    };
    const rtxt = `Abono por anulacion cliente ticket ${input.ticketRef}`;

    if (colsSet.has('NDOC')) pushValue('NDOC', input.ndoc);
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
        ${cols.map((col) => `[${col}]`).join(',\n        ')}
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
      `
      SELECT CASE
        WHEN OBJECT_ID(@0) IS NULL THEN 0
        ELSE 1
      END AS EXISTS_TABLE
      `,
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
      (rows ?? [])
        .map((row) => this.normalizeUpper((row as Record<string, unknown>).COL))
        .filter((name) => name.length > 0),
    );
  }

  private pickFirstExistingColumn(columns: Set<string>, candidates: string[]) {
    for (const candidate of candidates) {
      const normalized = this.normalizeUpper(candidate);
      if (columns.has(normalized)) return normalized;
    }
    return null;
  }

  private getRowValue(row: Record<string, unknown>, key: string) {
    const target = key.toUpperCase();
    for (const [rawKey, value] of Object.entries(row)) {
      if (rawKey.toUpperCase() === target) return value;
    }
    return undefined;
  }

  private async rollbackTransactionSafe(queryRunner: QueryRunner) {
    if (!queryRunner.isTransactionActive) return;
    try {
      await queryRunner.rollbackTransaction();
    } catch (error) {
      if (this.isTransactionAbortError(error)) return;
      throw error;
    }
  }

  private isTransactionAbortError(error: unknown) {
    const err = error as { code?: unknown; message?: unknown } | null;
    const code = this.normalizeUpper(String(err?.code ?? ''));
    const message = this.normalizeText(
      String(err?.message ?? ''),
    ).toLowerCase();
    return (
      code === 'EABORT' || message.includes('transaction has been aborted')
    );
  }

  private mapError(error: unknown, fallback: string): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException ||
      error instanceof UnauthorizedException
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

    return new InternalServerErrorException(fallback);
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
