import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AddPsFormaPagoDto } from './dto/add-ps-forma-pago.dto';
import { AddPsTicketServiceDto } from './dto/add-ps-ticket-service.dto';
import { CreatePsFolioDto } from './dto/create-ps-folio.dto';
import { DeletePsTicketLineDto } from './dto/delete-ps-ticket-line.dto';
import { ListPsFoliosQueryDto } from './dto/list-ps-folios-query.dto';
import { SetPsTicketReferenceFolioDto } from './dto/set-ps-ticket-reference-folio.dto';
import { SetPsTicketReferenceGastoDto } from './dto/set-ps-ticket-reference-gasto.dto';
import { UpdatePsFolioClienteDto } from './dto/update-ps-folio-cliente.dto';
import { UpdatePsTicketPvtaDto } from './dto/update-ps-ticket-pvta.dto';

type FolioRow = {
  IDFOL: string;
  SUC: string | null;
  ESTA: string | null;
  OPV: string | null;
  CLIEN: number | null;
};

@Injectable()
export class PagosServiciosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async listFolios(query: ListPsFoliosQueryDto, user: JwtPayload) {
    try {
      const isAdmin = this.isAdmin(user);
      const actorSuc = this.normalize(user?.suc ?? '');
      const requestedSuc = this.normalize(query.suc ?? '');
      const esta = this.normalize(query.esta ?? 'PENDIENTE').toUpperCase() || 'PENDIENTE';
      const search = this.normalize(query.search ?? '');

      if (!isAdmin && actorSuc.length === 0) {
        throw new BadRequestException('Usuario sin sucursal para consultar panel PS');
      }
      if (!isAdmin && requestedSuc && this.normalizeUpper(requestedSuc) !== this.normalizeUpper(actorSuc)) {
        throw new ForbiddenException('No autorizado para consultar folios PS de otra sucursal');
      }

      const suc = isAdmin ? (requestedSuc || null) : (requestedSuc || actorSuc);

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_folios_list @SUC=@0, @ESTA=@1, @SEARCH=@2',
        [suc, esta, search || null],
      );

      return {
        ok: true,
        items: rows ?? [],
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar panel de Pago de Servicios');
    }
  }

  async createFolio(
    dto: CreatePsFolioDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const isAdmin = this.isAdmin(user);
      const actorSuc = this.normalize(user?.suc ?? '');
      const actorOpv = this.normalize(user?.username ?? '');

      const suc = this.normalize(dto.suc);
      const ter = this.normalize(dto.ter ?? '') || null;
      const opv = this.normalize(dto.opv || actorOpv);

      if (!suc) {
        throw new BadRequestException('suc es requerido');
      }
      if (!opv) {
        throw new BadRequestException('opv es requerido');
      }

      if (!isAdmin) {
        if (!actorSuc) {
          throw new BadRequestException('Usuario sin sucursal para crear folio PS');
        }
        if (this.normalizeUpper(suc) !== this.normalizeUpper(actorSuc)) {
          throw new ForbiddenException('No autorizado para crear folio PS en otra sucursal');
        }
        if (actorOpv && this.normalizeUpper(opv) !== this.normalizeUpper(actorOpv)) {
          throw new ForbiddenException('No autorizado para crear folio PS con otro OPV');
        }
      }

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_folio_create @SUC=@0, @TER=@1, @OPV=@2, @USER=@3',
        [suc, ter, opv, this.auditActor(user)],
      );
      const created = this.firstRow(rows);

      await this.auditMutation({
        action: 'PS_FOLIO_CREATE',
        entity: 'PV_CTR_FOL_ASVR',
        entityId: this.normalize(created?.IDFOL ?? ''),
        suc,
        metadata: {
          suc,
          ter,
          opv,
          result: created,
        },
        user,
        ip,
      });

      return created;
    } catch (error) {
      throw this.mapError(error, 'No se pudo crear folio de Pago de Servicios');
    }
  }

  async getPanel(idFolRaw: string, user: JwtPayload) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query('EXEC dbo.sp_ps_panel_get @IDFOL=@0', [folio.IDFOL]);
      const row = this.firstRow(rows);

      const header = this.parseJsonObject(row?.HEADER_JSON) ?? {
        IDFOL: folio.IDFOL,
        SUC: folio.SUC,
        ESTA: folio.ESTA,
      };

      return {
        ok: true,
        header,
        ticket: this.parseJsonArray(row?.TICKET_JSON),
        servicios: this.parseJsonArray(row?.SERVICIOS_JSON),
        referenciasGasto: this.parseJsonArray(row?.GASTOS_JSON),
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar detalle de Pago de Servicios');
    }
  }

  async updateFolioCliente(
    idFolRaw: string,
    dto: UpdatePsFolioClienteDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const clien = this.toNumber(dto.clien);
      if (clien == null || clien <= 0) {
        throw new BadRequestException('clien debe ser un número positivo');
      }

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_folio_set_cliente @IDFOL=@0, @CLIEN=@1, @USER=@2',
        [folio.IDFOL, clien, this.auditActor(user)],
      );
      const result = this.firstRow(rows);

      await this.auditMutation({
        action: 'PS_FOLIO_SET_CLIENTE',
        entity: 'PV_CTR_FOL_ASVR',
        entityId: folio.IDFOL,
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          clien,
          result,
        },
        user,
        ip,
      });

      return result ?? { ok: true, idfol: folio.IDFOL, clien };
    } catch (error) {
      throw this.mapError(error, 'No se pudo actualizar cliente del folio PS');
    }
  }

  async addTicketService(
    idFolRaw: string,
    dto: AddPsTicketServiceDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_ticket_add_service @IDFOL=@0, @IDS=@1, @USER=@2',
        [folio.IDFOL, this.normalizeUpper(dto.ids), this.auditActor(user)],
      );
      const result = this.firstRow(rows);

      await this.auditMutation({
        action: 'PS_TICKET_ADD_SERVICE',
        entity: 'PV_TICKET_LOG',
        entityId: this.normalize(result?.ART ?? ''),
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          ids: this.normalizeUpper(dto.ids),
          result,
        },
        user,
        ip,
      });

      return result;
    } catch (error) {
      throw this.mapError(error, 'No se pudo agregar servicio al ticket PS');
    }
  }

  async getAdeudosCliente(clientRaw: string, _user: JwtPayload) {
    try {
      const clientText = this.normalize(clientRaw);
      if (!/^\d+$/.test(clientText)) {
        throw new BadRequestException('client debe ser entero positivo');
      }
      const clientBigInt = BigInt(clientText);
      if (clientBigInt <= 0n) {
        throw new BadRequestException('client debe ser entero positivo');
      }

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_adeudos_cliente @CLIENT=@0',
        [clientText],
      );
      const row = this.firstRow(rows);
      const adeudosRJson = this.pickRowValue(row, [
        'ADEUDOS_R_JSON',
        'adeudos_r_json',
        'Adeudos_R_Json',
      ]);
      const adeudosResJson = this.pickRowValue(row, [
        'ADEUDOS_RES_JSON',
        'adeudos_res_json',
        'Adeudos_Res_Json',
      ]);

      return {
        ok: true,
        client: clientText,
        adeudosR: this.parseJsonArray(adeudosRJson),
        adeudosRes: this.parseJsonArray(adeudosResJson),
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudieron consultar adeudos de cliente');
    }
  }

  async setTicketReferenceFolio(
    idFolRaw: string,
    dto: SetPsTicketReferenceFolioDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_ticket_set_reference_folio @IDFOL_ACTUAL=@0, @TICKET_LINE_ID=@1, @IDFOL_REF=@2, @USER=@3',
        [
          folio.IDFOL,
          this.normalize(dto.art),
          this.normalize(dto.idFolRef),
          this.auditActor(user),
        ],
      );
      const result = this.firstRow(rows);

      await this.auditMutation({
        action: 'PS_TICKET_SET_REF_FOLIO',
        entity: 'PV_TICKET_LOG',
        entityId: this.normalize(dto.art),
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          art: this.normalize(dto.art),
          idFolRef: this.normalize(dto.idFolRef),
          result,
        },
        user,
        ip,
      });

      return result;
    } catch (error) {
      throw this.mapError(error, 'No se pudo asignar referencia de folio al ticket PS');
    }
  }

  async setTicketReferenceGasto(
    idFolRaw: string,
    dto: SetPsTicketReferenceGastoDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_ticket_set_reference_gasto @IDFOL_ACTUAL=@0, @TICKET_LINE_ID=@1, @REFGASTO=@2, @USER=@3',
        [
          folio.IDFOL,
          this.normalize(dto.art),
          this.normalize(dto.refGasto),
          this.auditActor(user),
        ],
      );
      const result = this.firstRow(rows);

      await this.auditMutation({
        action: 'PS_TICKET_SET_REF_GASTO',
        entity: 'PV_TICKET_LOG',
        entityId: this.normalize(dto.art),
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          art: this.normalize(dto.art),
          refGasto: this.normalize(dto.refGasto),
          result,
        },
        user,
        ip,
      });

      return result;
    } catch (error) {
      throw this.mapError(error, 'No se pudo asignar referencia de gasto al ticket PS');
    }
  }

  async updateTicketPvta(
    idFolRaw: string,
    dto: UpdatePsTicketPvtaDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_ticket_update_pvta @IDFOL=@0, @ART=@1, @PVTA=@2, @USER=@3',
        [
          folio.IDFOL,
          this.normalize(dto.art),
          dto.pvta,
          this.auditActor(user),
        ],
      );
      const result = this.firstRow(rows);

      await this.auditMutation({
        action: 'PS_TICKET_UPDATE_PVTA',
        entity: 'PV_TICKET_LOG',
        entityId: this.normalize(dto.art),
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          art: this.normalize(dto.art),
          pvta: dto.pvta,
          result,
        },
        user,
        ip,
      });

      return result;
    } catch (error) {
      throw this.mapError(error, 'No se pudo actualizar PVTA del ticket PS');
    }
  }

  async deleteTicketLine(
    idFolRaw: string,
    dto: DeletePsTicketLineDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_ticket_delete_line @IDFOL=@0, @ART=@1, @USER=@2',
        [folio.IDFOL, this.normalize(dto.art), this.auditActor(user)],
      );
      const result = this.firstRow(rows);

      await this.auditMutation({
        action: 'PS_TICKET_DELETE_LINE',
        entity: 'PV_TICKET_LOG',
        entityId: this.normalize(dto.art),
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          art: this.normalize(dto.art),
          result,
        },
        user,
        ip,
      });

      return result;
    } catch (error) {
      throw this.mapError(error, 'No se pudo eliminar linea del ticket PS');
    }
  }

  async procesar(idFolRaw: string, user: JwtPayload, ip: string | null) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_procesar @IDFOL=@0, @USER=@1',
        [folio.IDFOL, this.auditActor(user)],
      );
      const result = this.firstRow(rows);
      const summary = await this.fetchSummary(folio.IDFOL);

      await this.auditMutation({
        action: 'PS_PROCESAR',
        entity: 'PV_CTR_FOL_ASVR',
        entityId: folio.IDFOL,
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          result,
        },
        user,
        ip,
      });

      return {
        ok: true,
        result,
        summary,
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo procesar el ticket PS');
    }
  }

  async addFormaPago(
    idFolRaw: string,
    dto: AddPsFormaPagoDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_form_add @IDFOL=@0, @FORM=@1, @IMPP=@2, @AUT=@3, @USER=@4',
        [
          folio.IDFOL,
          this.normalizeUpper(dto.form),
          dto.impp,
          this.normalize(dto.aut ?? '') || null,
          this.auditActor(user),
        ],
      );
      const summary = this.mapSummaryRow(this.firstRow(rows));

      await this.auditMutation({
        action: 'PS_FORM_ADD',
        entity: 'PV_CTR_FOL_FORMTMP',
        entityId: folio.IDFOL,
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          form: this.normalizeUpper(dto.form),
          impp: dto.impp,
          aut: this.normalize(dto.aut ?? '') || null,
          summary,
        },
        user,
        ip,
      });

      return summary;
    } catch (error) {
      throw this.mapError(error, 'No se pudo agregar forma de pago PS');
    }
  }

  async deleteFormaPago(
    idFolRaw: string,
    idFRaw: string,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const idf = this.normalize(idFRaw);
      if (!idf) {
        throw new BadRequestException('idF es requerido');
      }

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_form_delete @IDFOL=@0, @IDF=@1, @USER=@2',
        [folio.IDFOL, idf, this.auditActor(user)],
      );
      const summary = this.mapSummaryRow(this.firstRow(rows));

      await this.auditMutation({
        action: 'PS_FORM_DELETE',
        entity: 'PV_CTR_FOL_FORMTMP',
        entityId: idf,
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          idf,
          summary,
        },
        user,
        ip,
      });

      return summary;
    } catch (error) {
      throw this.mapError(error, 'No se pudo eliminar forma de pago PS');
    }
  }

  async summaryFormaPago(idFolRaw: string, user: JwtPayload) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      return this.fetchSummary(folio.IDFOL);
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar resumen de pago PS');
    }
  }

  async terminar(idFolRaw: string, user: JwtPayload, ip: string | null) {
    try {
      const folio = await this.loadFolio(idFolRaw, user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ps_terminar @IDFOL=@0, @USER=@1',
        [folio.IDFOL, this.auditActor(user)],
      );
      const result = this.firstRow(rows);

      await this.auditMutation({
        action: 'PS_TERMINAR',
        entity: 'PV_CTR_FOL_ASVR',
        entityId: folio.IDFOL,
        suc: folio.SUC,
        metadata: {
          idfol: folio.IDFOL,
          result,
        },
        user,
        ip,
      });

      return result;
    } catch (error) {
      throw this.mapError(error, 'No se pudo terminar folio PS');
    }
  }

  private async fetchSummary(idFol: string) {
    const rows = await this.dataSource.query(
      'EXEC dbo.sp_ps_form_summary @IDFOL=@0',
      [idFol],
    );
    return this.mapSummaryRow(this.firstRow(rows));
  }

  private async loadFolio(idFolRaw: string, user: JwtPayload): Promise<FolioRow> {
    const idFol = this.normalize(idFolRaw);
    if (!idFol) {
      throw new BadRequestException('idFol es requerido');
    }

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        IDFOL,
        SUC,
        ESTA,
        OPV,
        TRY_CONVERT(FLOAT, CLIEN) AS CLIEN
      FROM dbo.PV_CTR_FOL_ASVR
      WHERE IDFOL = @0
      `,
      [idFol],
    );

    const row = this.firstRow(rows) as FolioRow | null;
    if (!row) {
      throw new NotFoundException(`Folio PS ${idFol} no existe`);
    }

    this.assertFolioAccess(row, user);
    return row;
  }

  private assertFolioAccess(folio: FolioRow, user: JwtPayload) {
    if (this.isAdmin(user)) return;

    const actorSuc = this.normalize(user?.suc ?? '');
    const folioSuc = this.normalize(folio?.SUC ?? '');

    if (!actorSuc) {
      throw new ForbiddenException('Usuario sin sucursal para operar folios PS');
    }

    if (folioSuc && this.normalizeUpper(actorSuc) !== this.normalizeUpper(folioSuc)) {
      throw new ForbiddenException('No autorizado para operar folios PS de otra sucursal');
    }
  }

  private mapSummaryRow(row: Record<string, unknown> | null) {
    const formas = this.parseJsonArray(row?.FORMAS_JSON);
    return {
      ok: true,
      idfol: this.normalize(row?.IDFOL ?? ''),
      suc: this.normalize(row?.SUC ?? ''),
      esta: this.normalize(row?.ESTA ?? ''),
      total: this.toNumber(row?.TOTAL) ?? 0,
      pagado: this.toNumber(row?.PAGADO) ?? 0,
      restante: this.toNumber(row?.RESTANTE) ?? 0,
      cambio: this.toNumber(row?.CAMBIO) ?? 0,
      ivaIntegrado: this.toInt(row?.IVA_INTEGRADO),
      formas,
    };
  }

  private async auditMutation(input: {
    action: string;
    entity: string;
    entityId: string;
    suc: string | null;
    metadata: unknown;
    user: JwtPayload;
    ip: string | null;
  }) {
    await this.audit.log({
      IDUSUARIO: Number(input.user?.sub ?? 0) || null,
      ACTION: input.action,
      MODULO: 'pago-servicios',
      ENTIDAD: input.entity,
      ENTIDAD_ID: input.entityId || null,
      SUC: input.suc,
      METADATA_JSON: JSON.stringify(input.metadata ?? {}),
      IP: input.ip,
    });
  }

  private auditActor(user: JwtPayload) {
    return this.normalize(user?.username ?? String(user?.sub ?? '')) || 'system';
  }

  private normalize(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown) {
    return this.normalize(value).toUpperCase();
  }

  private isAdmin(user: JwtPayload) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private firstRow(rows: unknown[]): Record<string, unknown> | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    if (!row || typeof row !== 'object') return null;
    return row as Record<string, unknown>;
  }

  private pickRowValue(row: Record<string, unknown> | null, keys: string[]) {
    if (!row) return null;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        return row[key];
      }
    }
    return null;
  }

  private parseJsonObject(raw: unknown): Record<string, unknown> | null {
    if (raw == null) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    const text = this.normalize(raw);
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private parseJsonArray(raw: unknown): Record<string, unknown>[] {
    if (Array.isArray(raw)) {
      return raw.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
    }
    const text = this.normalize(raw);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  private toInt(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNumber(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private mapError(error: unknown, fallback: string): Error {
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
    const driverMessage = this.normalize(driver?.message ?? '');
    const baseMessage = this.normalize(errAny?.message ?? '');
    const raw = driverMessage || baseMessage;
    if (!raw) return '';

    return raw
      .replace(/^QueryFailedError:\s*/i, '')
      .replace(/^RequestError:\s*/i, '')
      .replace(/\s+\bat line \d+\b/i, '')
      .trim();
  }
}
