import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
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

@Injectable()
export class PvCotizacionesCierreService {
  private static readonly FORMAS_PERMITIDAS = new Set([
    'EFECTIVO',
    'TARJETA',
    'CHEQUE',
    'TRANSFERENCIA',
    'CREDITO',
    'DEUDOR',
  ]);

  private static readonly FORMAS_AUT_REQUERIDA = new Set([
    'TARJETA',
    'CHEQUE',
    'TRANSFERENCIA',
  ]);

  private static readonly FORMAS_NO_EFECTIVO = new Set([
    'TARJETA',
    'CHEQUE',
    'TRANSFERENCIA',
    'CREDITO',
    'DEUDOR',
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

  async close(idfolRaw: string, dto: PvCotizacionCierreDto, user: JwtPayload) {
    const idfol = this.normalizeIdfol(idfolRaw);
    const tipotran = this.normalizeTipoTran(dto.tipotran);
    const rqfac = tipotran === 'CA' ? false : Boolean(dto.rqfac);
    const opv =
      this.normalizeText(dto.idopv) ||
      this.normalizeText(user?.username) ||
      null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const context = await this.resolveContext(
        queryRunner,
        idfol,
        user,
        dto.suc,
        true,
      );
      const totals = this.calculateTotals({
        totalBase: context.totalBase,
        ivaIntegrado: context.ivaIntegrado,
        tipotran,
        rqfac,
      });

      const existingForms = await this.loadExistingForms(queryRunner, idfol);
      const formas = this.normalizeFormas(dto.formas ?? []);
      const formsValidation = await this.validateFormas({
        executor: queryRunner,
        idfol,
        tipotran,
        total: totals.total,
        clien: context.clien,
        formas,
        existingForms,
      });

      await queryRunner.query(
        'DELETE FROM dbo.PV_CTR_FOL_FORM WHERE IDFOL = @0',
        [idfol],
      );

      let cambioPendiente = formsValidation.cambio;
      let efectivoConCambioAsignado = false;

      for (const forma of formas) {
        const idf = randomUUID();
        let impc = 0;
        if (
          cambioPendiente > 0 &&
          !efectivoConCambioAsignado &&
          forma.form === 'EFECTIVO'
        ) {
          impc = cambioPendiente;
          cambioPendiente = 0;
          efectivoConCambioAsignado = true;
        }

        await queryRunner.query(
          `
          INSERT INTO dbo.PV_CTR_FOL_FORM (
            IDF,
            IDFOL,
            FCN,
            FORM,
            IMPA,
            IMPP,
            IMPC,
            IMPD,
            AUT
          )
          VALUES (
            @0,
            @1,
            GETDATE(),
            @2,
            @3,
            @4,
            @5,
            @6,
            @7
          )
          `,
          [idf, idfol, forma.form, forma.impp, forma.impp, impc, 0, forma.aut],
        );
      }

      await this.updateFolioHeader(queryRunner, {
        idfol,
        total: totals.total,
        rqfac,
        opv,
      });

      await queryRunner.commitTransaction();

      return {
        ok: true,
        idfol,
        tipotran,
        rqfac,
        totales: totals,
        sumPagos: formsValidation.sumPagos,
        cambio: formsValidation.cambio,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
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
  ): Promise<CotizacionContext> {
    const lockHint = lockHeader ? ' WITH (UPDLOCK, HOLDLOCK, ROWLOCK)' : '';
    const folioRows = await executor.query(
      `
      SELECT TOP 1 *
      FROM dbo.PV_CTR_FOL_ASVR${lockHint}
      WHERE IDFOL = @0
      `,
      [idfol],
    );
    if (!folioRows?.length) {
      throw new NotFoundException(`La cotizacion ${idfol} no existe`);
    }

    const folio = folioRows[0] as Record<string, unknown>;
    const suc = this.normalizeText(folio.SUC);
    if (!suc) {
      throw new BadRequestException(
        `La cotizacion ${idfol} no tiene sucursal asignada`,
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
    if (this.isEstadoBloqueado(esta)) {
      throw new ConflictException(
        `La cotizacion ${idfol} ya no permite cierre en estado ${esta}`,
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
      [idfol],
    );
    const ticketStats = (ticketRows?.[0] ?? {}) as Record<string, unknown>;
    const itemsCount = this.toInt(ticketStats.ITEMS_COUNT) ?? 0;
    if (itemsCount <= 0) {
      throw new BadRequestException(
        `La cotizacion ${idfol} no tiene articulos para cierre`,
      );
    }

    const totalBase = this.round2(this.toNumber(ticketStats.TOTAL_BASE) ?? 0);
    if (totalBase <= 0) {
      throw new BadRequestException(
        `La cotizacion ${idfol} tiene total base invalido`,
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
      idfol,
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

  private async loadExistingForms(executor: SqlExecutor, idfol: string) {
    const rows = await executor.query(
      `
      SELECT FORM
      FROM dbo.PV_CTR_FOL_FORM
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

    for (const forma of formas) {
      if (
        PvCotizacionesCierreService.FORMAS_AUT_REQUERIDA.has(forma.form) &&
        !this.normalizeText(forma.aut ?? '')
      ) {
        throw new BadRequestException(
          `La forma ${forma.form} requiere autorizacion/referencia`,
        );
      }
    }

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

    const hasEfectivo = formas.some((item) => item.form === 'EFECTIVO');
    if (sumPagos > total + epsilon && !hasEfectivo) {
      throw new BadRequestException(
        'Solo EFECTIVO puede exceder el total para generar cambio',
      );
    }

    const sumNoEfectivo = this.round2(
      formas
        .filter((item) => item.form !== 'EFECTIVO')
        .reduce((acc, item) => acc + item.impp, 0),
    );
    if (sumNoEfectivo > total + epsilon) {
      throw new BadRequestException(
        'Solo EFECTIVO puede cubrir el excedente sobre el total',
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

  private async updateFolioHeader(
    executor: SqlExecutor,
    input: {
      idfol: string;
      total: number;
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
      SELECT TOP 1 I_CRED
      FROM dbo.FACT_CLIENT_SHP
      WHERE IDC = @0
      `,
      [clientId],
    );
    if (!clientRows?.length) {
      throw new NotFoundException(`Cliente ${clientId} no existe`);
    }

    const clientRow = (clientRows[0] ?? {}) as Record<string, unknown>;
    const limite = this.round2(this.toNumber(clientRow.I_CRED) ?? 0);
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
    try {
      const tableRows = await executor.query(
        `
        SELECT OBJECT_ID('dbo.DAT_CTRL_CTAS') AS ID_OBJ
        `,
      );
      const tableId = this.toInt((tableRows?.[0] ?? {})['ID_OBJ']);
      if (!tableId) return 0;

      const colsRows = await executor.query(
        `
        SELECT name
        FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.DAT_CTRL_CTAS')
        `,
      );
      const cols = new Set(
        (colsRows ?? []).map((row) =>
          this.normalizeUpper((row as Record<string, unknown>).name),
        ),
      );

      const pick = (candidates: string[]) =>
        candidates.find((name) => cols.has(this.normalizeUpper(name))) ?? null;

      const clientCol = pick(['IDC', 'CLIEN', 'IDCLIENTE', 'NCLIENTE']);
      const amountCol = pick(['SALDO', 'IMPD', 'DEBE', 'IMP_PEND', 'IMPT']);
      const statusCol = pick(['ESTA', 'ESTATUS', 'STATUS']);

      if (!clientCol || !amountCol) return 0;

      const statusFilter = statusCol
        ? ` AND UPPER(LTRIM(RTRIM(ISNULL([${statusCol}], '')))) NOT IN ('PAGADO', 'CERRADO', 'CANCELADO', 'CANCELADA')`
        : '';

      const sql = `
        SELECT SUM(ISNULL([${amountCol}], 0)) AS SALDO_VIGENTE
        FROM dbo.DAT_CTRL_CTAS
        WHERE [${clientCol}] = @0
        ${statusFilter}
      `;
      const rows = await executor.query(sql, [clientId]);
      const saldo = this.toNumber((rows?.[0] ?? {})['SALDO_VIGENTE']) ?? 0;
      return this.round2(Math.max(saldo, 0));
    } catch (_) {
      // Fallback defensivo: si no se puede resolver saldo en DAT_CTRL_CTAS,
      // se asume 0 para no romper cierre en entornos sin esa estructura.
      return 0;
    }
  }
}
