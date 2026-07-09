import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AuthorizeOrdRelationDto } from './dto/authorize-ord-relation.dto';
import { PvCtrOrdsEntity } from './pvctrords.entity';
import { PvCtrOrdsRelationAuthStore } from './pvctrords-relation-auth.store';
import { CreateOrdFromQuoteLineDto } from './dto/create-ord-from-quote-line.dto';
import { DeleteOrdFromQuoteLineDto } from './dto/delete-ord-from-quote-line.dto';
import { CreatePvCtrOrdsDto } from './dto/create-pvctrords.dto';
import { UpdatePvCtrOrdsDto } from './dto/update-pvctrords.dto';

type SqlExecutor = {
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
};

type OrdBusinessErrorCode =
  | 'CLIENT_REQUIRED'
  | 'INVALID_STATUS'
  | 'INVALID_QTY'
  | 'FCNM_REQUIRED'
  | 'COMAD_REQUIRED'
  | 'TICKET_LINE_NOT_FOUND'
  | 'RELATION_AUTH_REQUIRED'
  | 'RELATION_TICKET_REQUIRED'
  | 'RELATED_TICKET_MISMATCH'
  | 'RELATED_TICKET_CLIENT_MISMATCH'
  | 'RELATION_CREATE_ONLY'
  | 'ORD_EXISTS'
  | 'ORD_NOT_FOUND'
  | 'DB_ERROR';

export interface CreateOrdFromQuoteLineResponse {
  created: boolean;
  updated?: boolean;
  code?: OrdBusinessErrorCode;
  iord: string | null;
  header: Record<string, unknown> | null;
  details: Record<string, unknown>[];
  message: string;
}

export interface DeleteOrdFromQuoteLineResponse {
  deleted: boolean;
  iord: string;
  message: string;
}

type RelationAuthorizer = {
  idUsuario: number;
  username: string;
  suc: string | null;
  roleCode: string;
};

type TicketLineRow = {
  id: string;
  idfol: string;
  upc: string | null;
  art: string;
  des: string | null;
  ctd: number;
  pvta: number | null;
  pvtat: number | null;
  ord: string | null;
  iddev: string | null;
  ctdd: number | null;
  ctddf: number | null;
  ticketRel: string | null;
};

@Injectable()
export class PvCtrOrdsService {
  constructor(
    @InjectRepository(PvCtrOrdsEntity)
    private readonly repo: Repository<PvCtrOrdsEntity>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly relationAuthStore: PvCtrOrdsRelationAuthStore,
  ) {}

  async findAll() {
    return this.dataSource.query(`
      SELECT *
      FROM dbo.PV_CTR_ORDS
      ORDER BY IORD ASC
    `);
  }

  async findOne(iord: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 *
      FROM dbo.PV_CTR_ORDS
      WHERE IORD = @0
      `,
      [iord],
    );
    const row =
      (rows?.[0] as Record<string, unknown> | undefined | null) ?? null;
    if (!row) throw new NotFoundException(`PV_CTR_ORDS ${iord} no existe`);
    return row;
  }

  async create(dto: CreatePvCtrOrdsDto) {
    throw new BadRequestException(
      'Creación manual de ORD deshabilitada. Use /pvctrords/create-from-quote-line para generar IORD con nomenclatura estándar.',
    );
  }

  async authorizeRelationTicket(
    dto: AuthorizeOrdRelationDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const passwordSupervisor = this.normalizeText(dto.passwordSupervisor);
    if (!passwordSupervisor) {
      throw new BadRequestException('passwordSupervisor es obligatorio');
    }

    const requestedByUserId = this.resolveUserId(user);
    const requester = await this.loadUserWithRole(requestedByUserId);
    const supervisor =
      await this.findRelationAuthorizerByPassword(passwordSupervisor);
    if (!supervisor) {
      throw new ForbiddenException('Autorización SUPERPV inválida');
    }

    const session = this.relationAuthStore.issue({
      scope: 'RELACION_VENTA_ANTERIOR',
      supervisorUserId: supervisor.idUsuario,
      requestedByUserId,
    });

    await this.audit.log({
      IDUSUARIO: requestedByUserId,
      ACTION: 'ORD_RELATION_AUTHORIZE',
      MODULO: 'punto-venta',
      ENTIDAD: 'PV_CTR_ORDS',
      ENTIDAD_ID:
        this.normalizeText(dto.ticketId) ||
        this.normalizeText(dto.idfol) ||
        null,
      SUC: user.suc ?? requester?.suc ?? null,
      METADATA_JSON: JSON.stringify({
        idfol: this.normalizeText(dto.idfol) || null,
        ticketId: this.normalizeText(dto.ticketId) || null,
        art: this.normalizeText(dto.art) || null,
        ctd: dto.ctd ?? null,
        requestedBy: {
          idUsuario: requestedByUserId,
          username: requester?.username ?? user.username ?? null,
          roleCode: requester?.roleCode ?? null,
        },
        supervisor: {
          idUsuario: supervisor.idUsuario,
          username: supervisor.username,
          roleCode: supervisor.roleCode,
        },
      }),
      IP: ip,
    });

    return {
      authorized: true,
      authorizationToken: session.token,
      supervisorUserId: String(supervisor.idUsuario),
      username: supervisor.username,
      roleCode: supervisor.roleCode,
    };
  }

  async createFromQuoteLine(
    dto: CreateOrdFromQuoteLineDto,
    user: JwtPayload,
    ip: string | null,
  ): Promise<CreateOrdFromQuoteLineResponse> {
    const idfol = dto.idfol.trim();
    const ticketId = dto.ticketId.trim();
    const descArt = (dto.descArt ?? '').trim().slice(0, 255);
    const estado = this.normalizeEstadoOperativo(dto.estado);
    const tipo = dto.tipo.trim();
    const suc = dto.suc.trim().toUpperCase();
    const opvInput = dto.opv.trim();
    const fechaEntregaRaw = String(dto.fechaEntrega ?? '').trim();
    const fechaEntregaDate = fechaEntregaRaw ? new Date(fechaEntregaRaw) : null;
    const fechaEntrega =
      fechaEntregaDate && !Number.isNaN(fechaEntregaDate.getTime())
        ? fechaEntregaDate.toISOString()
        : null;
    const comad = (dto.comad ?? '').trim();
    const clien = Number(dto.clien);
    const clienKey = this.normalizeClientKey(dto.clien);
    const ticketRel = this.normalizeOrdValue(dto.ticketRel);
    const relationAuthorizationToken = this.normalizeOrdValue(
      dto.relationAuthorizationToken,
    );
    const requestedByUserId = this.resolveUserId(user);

    if (!Number.isFinite(clien) || clien <= 0 || clien === 1) {
      this.throwBusinessError(
        'CLIENT_REQUIRED',
        'No se permite crear ORD para el cliente seleccionado.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (estado !== 'PENDIENTE') {
      this.throwBusinessError(
        'INVALID_STATUS',
        'El documento no está en estado PENDIENTE.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const ticketLine = await this.findTicketLineById(
      this.dataSource,
      ticketId,
      idfol,
    );
    const art = ticketLine.art;
    const ctd = ticketLine.ctd;

    if (!this.isAllowedOrdQty(ctd)) {
      this.throwBusinessError(
        'INVALID_QTY',
        'La cantidad registrada para el articulo no permite crear ORD.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!fechaEntrega) {
      this.throwBusinessError(
        'FCNM_REQUIRED',
        'La fecha de entrega es obligatoria.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!comad) {
      this.throwBusinessError(
        'COMAD_REQUIRED',
        'El campo COMAD es obligatorio.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const opv = await this.normalizeOpvToUsername(opvInput);

    const ordByPayload = this.normalizeOrdValue(dto.ordExistente);
    const ordByTicket = ordByPayload ? null : ticketLine.ord;
    const existingOrd = ordByPayload ?? ordByTicket;
    if (ticketRel && existingOrd) {
      this.throwBusinessError(
        'RELATION_CREATE_ONLY',
        'La relacion de venta anterior solo aplica al crear una nueva ORD.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (relationAuthorizationToken && !ticketRel) {
      this.throwBusinessError(
        'RELATION_TICKET_REQUIRED',
        'Debe capturar TICKET_REL para crear ORD relacionada.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const relationSession = ticketRel
      ? this.validateRelationAuthorizationToken(
          relationAuthorizationToken,
          requestedByUserId,
        )
      : null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (existingOrd) {
        await this.updateOrdHeaderFromQuoteLine(queryRunner, {
          iord: existingOrd,
          tipo,
          opv,
          fechaEntrega: fechaEntrega,
          comad,
          descArt,
        });
        const existingBundle = await this.findOrdBundle(
          queryRunner,
          existingOrd,
        );
        await queryRunner.commitTransaction();
        return {
          created: false,
          updated: true,
          iord: existingOrd,
          header: existingBundle.header,
          details: existingBundle.details,
          message: 'ORD existente actualizada correctamente',
        };
      }

      if (ticketRel) {
        await this.assertRelatedTicketMatch(queryRunner, {
          ticketRel,
          art,
          ctd,
          clienKey,
        });
      }

      const rows = await queryRunner.query(
        `
          DECLARE @IORD_OUT NVARCHAR(255);
          EXEC dbo.sp_pv_ctr_ords_create_from_quote_line
            @IDFOL = @0,
            @ART = @1,
            @DESCART = @2,
            @CTD = @3,
            @CLIEN = @4,
            @ESTADO = @5,
            @TIPO = @6,
            @FCNM = @7,
            @COMAD = @8,
            @SUC = @9,
            @OPV = @10,
            @IORD_OUT = @IORD_OUT OUTPUT;
          SELECT @IORD_OUT AS IORD;
          `,
        [
          idfol,
          art,
          descArt,
          ctd,
          clien,
          estado,
          tipo,
          fechaEntrega,
          comad,
          suc,
          opv,
        ],
      );

      const iord = this.extractIord(
        rows?.[0] as Record<string, unknown> | undefined,
      );
      if (!iord) {
        throw new InternalServerErrorException({
          code: 'DB_ERROR',
          message: 'No se pudo generar la ORD.',
        });
      }

      if (ticketRel) {
        await this.applyRelatedTicketFlow(queryRunner, {
          idfol,
          ticketId,
          iord,
          ticketRel,
          ticketLine,
        });
        await this.audit.log({
          IDUSUARIO: requestedByUserId,
          ACTION: 'ORD_RELATION_CREATE',
          MODULO: 'punto-venta',
          ENTIDAD: 'PV_CTR_ORDS',
          ENTIDAD_ID: iord,
          SUC: user.suc ?? suc,
          METADATA_JSON: JSON.stringify({
            idfol,
            ticketId,
            iord,
            art,
            ctd,
            ticketRel,
            supervisorUserId: relationSession?.supervisorUserId ?? null,
          }),
          IP: ip,
        });
      }

      const createdBundle = await this.findOrdBundle(queryRunner, iord);
      await queryRunner.commitTransaction();
      return {
        created: true,
        iord,
        header: createdBundle.header,
        details: createdBundle.details,
        message: 'ORD creada correctamente',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.rethrowCreateOrdError(error);
    } finally {
      await queryRunner.release();
    }
  }

  async deleteFromQuoteLine(
    dto: DeleteOrdFromQuoteLineDto,
  ): Promise<DeleteOrdFromQuoteLineResponse> {
    const iord = dto.iord.trim();
    const ticketId = dto.ticketId.trim();
    const idfol = (dto.idfol ?? '').trim();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const headerRows = await queryRunner.query(
        `
        SELECT TOP 1
          IORD,
          LTRIM(RTRIM(ISNULL(TICKET_REL, ''))) AS TICKET_REL
        FROM dbo.PV_CTR_ORDS
        WHERE IORD = @0
        `,
        [iord],
      );
      if (!headerRows?.length) {
        throw new HttpException(
          {
            code: 'ORD_NOT_FOUND',
            message: `La ORD ${iord} no existe.`,
          },
          HttpStatus.NOT_FOUND,
        );
      }
      const headerRow = (headerRows?.[0] ?? null) as Record<
        string,
        unknown
      > | null;
      const headerTicketRel = this.normalizeOptionalText(headerRow?.TICKET_REL);
      const counterMovementTicketRel = headerTicketRel
        ? this.buildCounterMovementTicketRel(headerTicketRel, ticketId)
        : null;

      await queryRunner.query(
        `
        DELETE FROM dbo.PV_CTR_ORDS_DET
        WHERE IORD = @0
        `,
        [iord],
      );

      await queryRunner.query(
        `
        DELETE FROM dbo.PV_CTR_ORDS
        WHERE IORD = @0
        `,
        [iord],
      );

      if (headerTicketRel) {
        await queryRunner.query(
          `
          DELETE FROM dbo.PV_TICKET_LOG
          WHERE (
              LTRIM(RTRIM(ISNULL(TICKET_REL, ''))) = @1
              OR LTRIM(RTRIM(ISNULL(TICKET_REL, ''))) = @2
            )
            AND ISNULL(TRY_CONVERT(FLOAT, CTD), 0) < 0
            AND (
              LTRIM(RTRIM(ISNULL(ORD, ''))) = @0
              OR NULLIF(LTRIM(RTRIM(ISNULL(ORD, ''))), '') IS NULL
            )
          `,
          [iord, headerTicketRel, counterMovementTicketRel],
        );
      }

      const idfolCondition = idfol ? 'AND IDFOL = @2' : '';
      const params: Array<string> = [iord, ticketId];
      if (idfol) params.push(idfol);

      await queryRunner.query(
        `
        UPDATE dbo.PV_TICKET_LOG
        SET ORD = NULL,
            TICKET_REL = NULL
        WHERE LTRIM(RTRIM(ISNULL(ORD, ''))) = @0
          AND ID = @1
          ${idfolCondition}
        `,
        params,
      );

      await queryRunner.commitTransaction();

      return {
        deleted: true,
        iord,
        message: 'ORD eliminada correctamente',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof HttpException) throw error;

      const sql = this.extractSqlError(error);
      throw new HttpException(
        {
          code: 'DB_ERROR',
          message: `Error al eliminar ORD: ${sql.message}`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async update(iord: string, dto: UpdatePvCtrOrdsDto) {
    const row = (await this.findOne(iord)) as unknown as PvCtrOrdsEntity;

    const partial: Partial<PvCtrOrdsEntity> = {};
    if (dto.IDFOL !== undefined) partial.IDFOL = dto.IDFOL ?? null;
    if (dto.TIPO !== undefined) partial.TIPO = dto.TIPO ?? null;
    if (dto.OPV !== undefined) partial.OPV = dto.OPV ?? null;
    if (dto.FCNS !== undefined)
      partial.FCNS = dto.FCNS ? new Date(dto.FCNS) : null;
    if (dto.FCNM !== undefined)
      partial.FCNM = dto.FCNM ? new Date(dto.FCNM) : null;
    if (dto.CLIEN !== undefined) partial.CLIEN = dto.CLIEN ?? null;
    if (dto.MAT !== undefined) partial.MAT = dto.MAT ?? null;
    if (dto.CTD !== undefined) partial.CTD = dto.CTD ?? null;
    if (dto.ART !== undefined) partial.ART = dto.ART ?? null;
    if (dto.COMAD !== undefined) partial.COMAD = dto.COMAD ?? null;
    if (dto.ESTATUS !== undefined) partial.ESTATUS = dto.ESTATUS ?? null;
    if (dto.ESTSEGU !== undefined) partial.ESTSEGU = dto.ESTSEGU ?? null;
    if (dto.ASIGN !== undefined) partial.ASIGN = dto.ASIGN ?? null;
    if (dto.FCNRT !== undefined)
      partial.FCNRT = dto.FCNRT ? new Date(dto.FCNRT) : null;
    if (dto.FCNAS !== undefined)
      partial.FCNAS = dto.FCNAS ? new Date(dto.FCNAS) : null;
    if (dto.FCNTE !== undefined)
      partial.FCNTE = dto.FCNTE ? new Date(dto.FCNTE) : null;
    if (dto.FCNTD !== undefined)
      partial.FCNTD = dto.FCNTD ? new Date(dto.FCNTD) : null;
    if (dto.FCNEN !== undefined)
      partial.FCNEN = dto.FCNEN ? new Date(dto.FCNEN) : null;
    if (dto.LABOR !== undefined) partial.LABOR = dto.LABOR ?? null;
    if (dto.TPOM !== undefined) partial.TPOM = dto.TPOM ?? null;
    if (dto.MOTR !== undefined) partial.MOTR = dto.MOTR ?? null;
    if (dto.REOORD !== undefined) partial.REOORD = dto.REOORD ?? null;
    if (dto.DOCIF !== undefined) partial.DOCIF = dto.DOCIF ?? null;
    if (dto.SEL !== undefined) partial.SEL = dto.SEL ?? null;
    if (dto.FCNMOD !== undefined)
      partial.FCNMOD = dto.FCNMOD ? new Date(dto.FCNMOD) : null;
    if (dto.SUC !== undefined) partial.SUC = dto.SUC ?? null;
    if (dto.NCLIENTE !== undefined) partial.NCLIENTE = dto.NCLIENTE ?? null;
    if (dto.RQFAC !== undefined) partial.RQFAC = dto.RQFAC ?? null;
    if (dto.DESCART !== undefined) partial.DESCART = dto.DESCART ?? null;
    if (dto.CTORD !== undefined) partial.CTORD = dto.CTORD ?? null;
    if (dto.SELCTRLORD !== undefined)
      partial.SELCTRLORD = dto.SELCTRLORD ?? null;
    if (dto.SELCTRORDT !== undefined)
      partial.SELCTRORDT = dto.SELCTRORDT ?? null;
    if (dto.SELENT !== undefined) partial.SELENT = dto.SELENT ?? null;
    if (dto.RESMEMR !== undefined) partial.RESMEMR = dto.RESMEMR ?? null;
    if (dto.HR_ENT !== undefined)
      partial.HR_ENT = dto.HR_ENT ? new Date(dto.HR_ENT) : null;
    if (dto.TICKET_REL !== undefined)
      partial.TICKET_REL = dto.TICKET_REL ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(iord: string) {
    const row = (await this.findOne(iord)) as unknown as PvCtrOrdsEntity;
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar PV_CTR_ORDS ${iord} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, IORD: iord };
  }

  private isAllowedOrdQty(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    const epsilon = 0.0001;
    return Math.abs(value - 1) < epsilon || Math.abs(value - 0.5) < epsilon;
  }

  private normalizeEstadoOperativo(value: string): string {
    const estado = value.trim().toUpperCase();
    if (estado === 'EDITANDO') return 'PENDIENTE';
    return estado;
  }

  private async normalizeOpvToUsername(value: string): Promise<string> {
    const input = String(value ?? '').trim();
    if (!input) return '';
    const inputUpper = input.toUpperCase();

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(u.USERNAME, ''))) AS USERNAME
      FROM dbo.USUARIO u
      WHERE
        UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, '')))) = @1
        OR LTRIM(RTRIM(CONVERT(NVARCHAR(255), u.IDUSUARIO))) = @0
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, '')))) = @1 THEN 0
          ELSE 1
        END,
        u.IDUSUARIO ASC
      `,
      [input, inputUpper],
    );

    const username = String(rows?.[0]?.USERNAME ?? '').trim();
    return username || input;
  }

  private normalizeOrdValue(raw?: string): string | null {
    const value = String(raw ?? '').trim();
    if (!value) return null;

    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber <= 0) {
      return null;
    }

    return value;
  }

  private async findTicketLineById(
    executor: SqlExecutor,
    ticketId: string,
    idfol: string,
  ): Promise<TicketLineRow> {
    const rows = await executor.query(
      `
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(ID, ''))) AS ID,
        LTRIM(RTRIM(ISNULL(IDFOL, ''))) AS IDFOL,
        LTRIM(RTRIM(ISNULL(UPC, ''))) AS UPC,
        LTRIM(RTRIM(ISNULL(ART, ''))) AS ART,
        LTRIM(RTRIM(ISNULL(DES, ''))) AS DES,
        TRY_CONVERT(FLOAT, CTD) AS CTD,
        TRY_CONVERT(MONEY, PVTA) AS PVTA,
        TRY_CONVERT(MONEY, PVTAT) AS PVTAT,
        LTRIM(RTRIM(ISNULL(ORD, ''))) AS ORD
        ,LTRIM(RTRIM(ISNULL(IDDEV, ''))) AS IDDEV
        ,TRY_CONVERT(FLOAT, CTDD) AS CTDD
        ,TRY_CONVERT(FLOAT, CTDDF) AS CTDDF
        ,LTRIM(RTRIM(ISNULL(TICKET_REL, ''))) AS TICKET_REL
      FROM dbo.PV_TICKET_LOG
      WHERE ID = @0
        AND IDFOL = @1
      ORDER BY updated_at DESC
      `,
      [ticketId, idfol],
    );

    const row = (rows?.[0] as Record<string, unknown> | undefined) ?? null;
    if (!row) {
      this.throwBusinessError(
        'TICKET_LINE_NOT_FOUND',
        'No se encontró el renglón seleccionado en el ticket.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const art = String(row.ART ?? '').trim();
    if (!art) {
      this.throwBusinessError(
        'TICKET_LINE_NOT_FOUND',
        'No se encontró el renglón seleccionado en el ticket.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const ctd = Number(row.CTD);
    if (!Number.isFinite(ctd) || ctd <= 0) {
      this.throwBusinessError(
        'INVALID_QTY',
        'La cantidad registrada para el articulo no permite crear ORD.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const ord = this.normalizeOrdValue(
      row.ORD == null ? undefined : String(row.ORD),
    );
    const id = String(row.ID ?? '').trim();
    const upc = this.normalizeOptionalText(row.UPC);
    const des = this.normalizeOptionalText(row.DES);
    const iddev = this.normalizeOptionalText(row.IDDEV);
    const ticketRel = this.normalizeOptionalText(row.TICKET_REL);

    return {
      id: id || ticketId,
      idfol: String(row.IDFOL ?? '').trim() || idfol,
      upc,
      art,
      des,
      ctd,
      pvta: this.toNullableNumber(row.PVTA),
      pvtat: this.toNullableNumber(row.PVTAT),
      ord,
      iddev,
      ctdd: this.toNullableNumber(row.CTDD),
      ctddf: this.toNullableNumber(row.CTDDF),
      ticketRel,
    };
  }

  private async findOrdBundle(iord: string): Promise<{
    header: Record<string, unknown> | null;
    details: Record<string, unknown>[];
  }>;
  private async findOrdBundle(
    executor: SqlExecutor,
    iord: string,
  ): Promise<{
    header: Record<string, unknown> | null;
    details: Record<string, unknown>[];
  }>;
  private async findOrdBundle(
    executorOrIord: SqlExecutor | string,
    maybeIord?: string,
  ): Promise<{
    header: Record<string, unknown> | null;
    details: Record<string, unknown>[];
  }> {
    const executor =
      typeof executorOrIord === 'string'
        ? (this.dataSource as SqlExecutor)
        : executorOrIord;
    const iord =
      typeof executorOrIord === 'string' ? executorOrIord : (maybeIord ?? '');
    const [headerRows, detailRows] = await Promise.all([
      executor.query(
        `
        SELECT TOP 1 *
        FROM dbo.PV_CTR_ORDS
        WHERE IORD = @0
        `,
        [iord],
      ),
      executor.query(
        `
        SELECT *
        FROM dbo.PV_CTR_ORDS_DET
        WHERE IORD = @0
        ORDER BY IORDP ASC
        `,
        [iord],
      ),
    ]);

    return {
      header: (headerRows?.[0] as Record<string, unknown> | undefined) ?? null,
      details: (detailRows ?? []) as Record<string, unknown>[],
    };
  }

  private extractIord(row?: Record<string, unknown>): string | null {
    if (!row) return null;
    const candidates = ['IORD', 'iord', 'Iord'];
    for (const key of candidates) {
      const value = row[key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return null;
  }

  private throwBusinessError(
    code: OrdBusinessErrorCode,
    message: string,
    status: HttpStatus,
  ): never {
    throw new HttpException(
      {
        code,
        message,
      },
      status,
    );
  }

  private rethrowCreateOrdError(error: unknown): never {
    if (error instanceof HttpException) throw error;

    const sql = this.extractSqlError(error);
    const mapped = this.mapSqlNumberToBusinessError(sql.number);
    if (mapped) {
      throw new HttpException(
        {
          code: mapped.code,
          message: sql.message,
        },
        mapped.status,
      );
    }

    throw new InternalServerErrorException({
      code: 'DB_ERROR',
      message: `Error al crear ORD: ${sql.message}`,
    });
  }

  private mapSqlNumberToBusinessError(
    number: number | null,
  ): { code: OrdBusinessErrorCode; status: HttpStatus } | null {
    if (number == null) return null;

    switch (number) {
      case 50060:
        return { code: 'CLIENT_REQUIRED', status: HttpStatus.BAD_REQUEST };
      case 50061:
        return { code: 'INVALID_STATUS', status: HttpStatus.BAD_REQUEST };
      case 50062:
        return { code: 'INVALID_QTY', status: HttpStatus.BAD_REQUEST };
      case 50070:
        return { code: 'FCNM_REQUIRED', status: HttpStatus.BAD_REQUEST };
      case 50071:
        return { code: 'COMAD_REQUIRED', status: HttpStatus.BAD_REQUEST };
      case 50069:
        return { code: 'ORD_NOT_FOUND', status: HttpStatus.NOT_FOUND };
      case 50063:
      case 50064:
      case 50065:
      case 50068:
        return { code: 'DB_ERROR', status: HttpStatus.BAD_REQUEST };
      case 50066:
      case 50067:
      case 2601:
      case 2627:
        return { code: 'DB_ERROR', status: HttpStatus.CONFLICT };
      default:
        return { code: 'DB_ERROR', status: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  private async updateOrdHeaderFromQuoteLine(
    executor: SqlExecutor,
    input: {
      iord: string;
      tipo: string;
      opv: string;
      fechaEntrega: string;
      comad: string;
      descArt: string;
    },
  ): Promise<void> {
    const existsRows = await executor.query(
      `
      SELECT TOP 1 IORD
      FROM dbo.PV_CTR_ORDS
      WHERE IORD = @0
      `,
      [input.iord],
    );
    if (!existsRows?.length) {
      this.throwBusinessError(
        'ORD_NOT_FOUND',
        `La ORD ${input.iord} no existe.`,
        HttpStatus.NOT_FOUND,
      );
    }

    await executor.query(
      `
      UPDATE dbo.PV_CTR_ORDS
      SET
        TIPO = @1,
        OPV = @2,
        FCNM = @3,
        COMAD = @4,
        DESCART = CASE WHEN NULLIF(@5, '') IS NULL THEN DESCART ELSE @5 END,
        ESTATUS = 1,
        FCNMOD = GETDATE()
      WHERE IORD = @0
      `,
      [
        input.iord,
        input.tipo,
        input.opv,
        input.fechaEntrega,
        input.comad,
        input.descArt,
      ],
    );
  }

  private validateRelationAuthorizationToken(
    token: string | null,
    requestedByUserId: number,
  ) {
    if (!token) {
      this.throwBusinessError(
        'RELATION_AUTH_REQUIRED',
        'Se requiere autorización supervisor para registrar TICKET_REL.',
        HttpStatus.FORBIDDEN,
      );
    }

    const session = this.relationAuthStore.validate(token, {
      scope: 'RELACION_VENTA_ANTERIOR',
      requestedByUserId,
    });
    if (!session) {
      this.throwBusinessError(
        'RELATION_AUTH_REQUIRED',
        'Se requiere autorización supervisor para registrar TICKET_REL.',
        HttpStatus.FORBIDDEN,
      );
    }
    return session;
  }

  private async assertRelatedTicketMatch(
    executor: SqlExecutor,
    input: {
      ticketRel: string;
      art: string;
      ctd: number;
      clienKey: string;
    },
  ): Promise<void> {
    const rows = await executor.query(
      `
      SELECT TOP 1 t.ID
      FROM dbo.PV_TICKET_LOG t
      INNER JOIN dbo.PV_CTR_FOL_ASVR fol
        ON LTRIM(RTRIM(ISNULL(fol.IDFOL, ''))) = LTRIM(RTRIM(ISNULL(t.IDFOL, '')))
      WHERE LTRIM(RTRIM(ISNULL(t.IDFOL, ''))) = @0
        AND LTRIM(RTRIM(ISNULL(t.ART, ''))) = @1
        AND ABS(ISNULL(TRY_CONVERT(FLOAT, t.CTD), 0) - @2) <= @3
        AND TRY_CONVERT(DECIMAL(38, 0), fol.CLIEN) = TRY_CONVERT(DECIMAL(38, 0), @4)
      ORDER BY t.updated_at DESC, t.ID DESC
      `,
      [input.ticketRel, input.art, input.ctd, 0.0001, input.clienKey],
    );
    if (rows?.length) return;

    const clientMismatchRows = await executor.query(
      `
      SELECT TOP 1 ID
      FROM dbo.PV_TICKET_LOG
      WHERE LTRIM(RTRIM(ISNULL(IDFOL, ''))) = @0
        AND LTRIM(RTRIM(ISNULL(ART, ''))) = @1
        AND ABS(ISNULL(TRY_CONVERT(FLOAT, CTD), 0) - @2) <= @3
      ORDER BY updated_at DESC, ID DESC
      `,
      [input.ticketRel, input.art, input.ctd, 0.0001],
    );
    if (clientMismatchRows?.length) {
      this.throwBusinessError(
        'RELATED_TICKET_CLIENT_MISMATCH',
        'La cotizacion relacionada no corresponde al mismo cliente.',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.throwBusinessError(
      'RELATED_TICKET_MISMATCH',
      'El Articulo o catidad no coresponden en la cotizacion relacionada',
      HttpStatus.BAD_REQUEST,
    );
  }

  private async applyRelatedTicketFlow(
    executor: SqlExecutor,
    input: {
      idfol: string;
      ticketId: string;
      iord: string;
      ticketRel: string;
      ticketLine: TicketLineRow;
    },
  ): Promise<void> {
    const counterMovementTicketRel = this.buildCounterMovementTicketRel(
      input.ticketRel,
      input.ticketId,
    );
    await executor.query(
      `
      UPDATE dbo.PV_CTR_ORDS
      SET TICKET_REL = @1,
          FCNMOD = GETDATE()
      WHERE IORD = @0
      `,
      [input.iord, input.ticketRel],
    );

    await executor.query(
      `
      UPDATE dbo.PV_TICKET_LOG
      SET
        ORD = @2,
        TICKET_REL = @3,
        updated_at = GETDATE()
      WHERE ID = @0
        AND IDFOL = @1
      `,
      [input.ticketId, input.idfol, input.iord, input.ticketRel],
    );

    const negQty = -Math.abs(input.ticketLine.ctd);
    const pvta = this.round2(this.toNullableNumber(input.ticketLine.pvta) ?? 0);
    const pvtatBase =
      this.toNullableNumber(input.ticketLine.pvtat) ??
      Math.abs(input.ticketLine.ctd) * pvta;
    const negTotal = -Math.abs(this.round2(pvtatBase));

    await executor.query(
      `
      INSERT INTO dbo.PV_TICKET_LOG
      (
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
        updated_at,
        TICKET_REL
      )
      VALUES
      (
        @0,
        @1,
        @2,
        @3,
        @4,
        @5,
        @6,
        @7,
        NULL,
        @8,
        @9,
        @10,
        GETDATE(),
        @11
      )
      `,
      [
        randomUUID(),
        input.idfol,
        input.ticketLine.upc,
        input.ticketLine.art,
        input.ticketLine.des,
        negQty,
        pvta,
        negTotal,
        input.ticketLine.iddev,
        input.ticketLine.ctdd,
        input.ticketLine.ctddf,
        counterMovementTicketRel,
      ],
    );
  }

  private buildCounterMovementTicketRel(ticketRel: string, ticketId: string) {
    return `${ticketRel}|${ticketId}`;
  }

  private extractSqlError(error: unknown): {
    number: number | null;
    message: string;
  } {
    const err = error as Record<string, unknown> | null;

    const number = this.toNullableInt(
      this.firstDefined(
        err?.['number'],
        (err?.['originalError'] as Record<string, unknown> | undefined)?.[
          'number'
        ],
        (
          (err?.['originalError'] as Record<string, unknown> | undefined)?.[
            'info'
          ] as Record<string, unknown> | undefined
        )?.['number'],
        (err?.['driverError'] as Record<string, unknown> | undefined)?.[
          'number'
        ],
        (err?.['driverError'] as Record<string, unknown> | undefined)?.['code'],
      ),
    );

    const message = this.toMessage(
      this.firstDefined(
        err?.['message'],
        (
          (err?.['originalError'] as Record<string, unknown> | undefined)?.[
            'info'
          ] as Record<string, unknown> | undefined
        )?.['message'],
        (err?.['driverError'] as Record<string, unknown> | undefined)?.[
          'message'
        ],
      ),
    );

    return { number, message };
  }

  private firstDefined(...values: unknown[]): unknown {
    for (const value of values) {
      if (value !== undefined && value !== null) return value;
    }
    return null;
  }

  private toNullableInt(value: unknown): number | null {
    if (value == null) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.trunc(parsed);
  }

  private toNullableNumber(value: unknown): number | null {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private round2(value: number) {
    return Math.round(value * 100) / 100;
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown): string {
    return this.normalizeText(value).toUpperCase();
  }

  private normalizeOptionalText(value: unknown): string | null {
    const text = this.normalizeText(value);
    return text ? text : null;
  }

  private normalizeClientKey(value: unknown): string {
    const text = this.normalizeText(value);
    if (text) {
      const numericText = Number(text);
      if (Number.isFinite(numericText)) {
        return numericText.toFixed(0);
      }
      return text;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    return numeric.toFixed(0);
  }

  private async loadUserWithRole(idUsuario: number) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        u.IDUSUARIO,
        u.USERNAME,
        u.SUC,
        r.CODIGO AS ROLE_CODE
      FROM dbo.USUARIO u
      LEFT JOIN dbo.ROL r ON r.IDROL = u.IDROL
      WHERE u.IDUSUARIO = @0
      `,
      [idUsuario],
    );

    const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      idUsuario: Number(row.IDUSUARIO ?? 0) || 0,
      username: this.normalizeText(row.USERNAME),
      suc: this.normalizeOptionalText(row.SUC),
      roleCode: this.normalizeText(row.ROLE_CODE),
    };
  }

  private toMessage(value: unknown): string {
    const text = String(value ?? '').trim();
    return text || 'Error de base de datos';
  }

  private resolveUserId(user: JwtPayload): number {
    const idUsuario = Number(user?.sub ?? 0) || 0;
    if (idUsuario <= 0) {
      throw new BadRequestException(
        'No se pudo resolver usuario autenticado para auditoria',
      );
    }
    return idUsuario;
  }

  private async findRelationAuthorizerByPassword(
    password: string,
  ): Promise<RelationAuthorizer | null> {
    const rows = await this.dataSource.query(
      `
      SELECT
        u.IDUSUARIO,
        u.USERNAME,
        u.PASSWORD_HASH,
        u.SUC,
        r.CODIGO AS ROLE_CODE
      FROM dbo.USUARIO u
      INNER JOIN dbo.ROL r ON r.IDROL = u.IDROL
      WHERE u.ESTATUS = 'ACTIVO'
        AND r.ACTIVO = 1
        AND UPPER(LTRIM(RTRIM(ISNULL(r.CODIGO, '')))) = 'SUPERPV'
      `,
    );

    for (const raw of rows ?? []) {
      const row = raw as Record<string, unknown>;
      const hash = this.normalizeText(row.PASSWORD_HASH);
      if (!hash) continue;
      const valid = await bcrypt.compare(password, hash);
      if (!valid) continue;
      const idUsuario = Number(row.IDUSUARIO ?? 0) || 0;
      if (idUsuario <= 0) continue;
      return {
        idUsuario,
        username: this.normalizeText(row.USERNAME),
        suc: this.normalizeOptionalText(row.SUC),
        roleCode: this.normalizeText(row.ROLE_CODE),
      };
    }

    return null;
  }
}
