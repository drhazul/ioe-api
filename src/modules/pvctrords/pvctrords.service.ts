import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { PvCtrOrdsEntity } from './pvctrords.entity';
import { CreateOrdFromQuoteLineDto } from './dto/create-ord-from-quote-line.dto';
import { DeleteOrdFromQuoteLineDto } from './dto/delete-ord-from-quote-line.dto';
import { CreatePvCtrOrdsDto } from './dto/create-pvctrords.dto';
import { UpdatePvCtrOrdsDto } from './dto/update-pvctrords.dto';

type OrdBusinessErrorCode =
  | 'CLIENT_REQUIRED'
  | 'INVALID_STATUS'
  | 'INVALID_QTY'
  | 'FCNM_REQUIRED'
  | 'COMAD_REQUIRED'
  | 'TICKET_LINE_NOT_FOUND'
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

@Injectable()
export class PvCtrOrdsService {
  constructor(
    @InjectRepository(PvCtrOrdsEntity)
    private readonly repo: Repository<PvCtrOrdsEntity>,
    private readonly dataSource: DataSource,
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

  async createFromQuoteLine(
    dto: CreateOrdFromQuoteLineDto,
  ): Promise<CreateOrdFromQuoteLineResponse> {
    const idfol = dto.idfol.trim();
    const ticketId = dto.ticketId.trim();
    const descArt = (dto.descArt ?? '').trim().slice(0, 255);
    const estado = this.normalizeEstadoOperativo(dto.estado);
    const tipo = dto.tipo.trim();
    const suc = dto.suc.trim().toUpperCase();
    const opv = await this.normalizeOpvToUsername(dto.opv.trim());
    const fechaEntregaRaw = String(dto.fechaEntrega ?? '').trim();
    const fechaEntregaDate = fechaEntregaRaw ? new Date(fechaEntregaRaw) : null;
    const fechaEntrega =
      fechaEntregaDate && !Number.isNaN(fechaEntregaDate.getTime())
        ? fechaEntregaDate.toISOString()
        : null;
    const comad = (dto.comad ?? '').trim();
    const clien = Number(dto.clien);

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

    const ticketLine = await this.findTicketLineById(ticketId, idfol);
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

    const ordByPayload = this.normalizeOrdValue(dto.ordExistente);
    const ordByTicket = ordByPayload ? null : ticketLine.ord;
    const existingOrd = ordByPayload ?? ordByTicket;
    if (existingOrd) {
      await this.updateOrdHeaderFromQuoteLine({
        iord: existingOrd,
        tipo,
        opv,
        fechaEntrega: fechaEntrega,
        comad,
        descArt,
      });
      const existingBundle = await this.findOrdBundle(existingOrd);
      return {
        created: false,
        updated: true,
        iord: existingOrd,
        header: existingBundle.header,
        details: existingBundle.details,
        message: 'ORD existente actualizada correctamente',
      };
    }

    try {
      const rows = await this.dataSource.query(
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

      const createdBundle = await this.findOrdBundle(iord);
      return {
        created: true,
        iord,
        header: createdBundle.header,
        details: createdBundle.details,
        message: 'ORD creada correctamente',
      };
    } catch (error) {
      this.rethrowCreateOrdError(error);
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
        SELECT TOP 1 IORD
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

      const idfolCondition = idfol ? 'AND IDFOL = @2' : '';
      const params: Array<string> = [iord, ticketId];
      if (idfol) params.push(idfol);

      await queryRunner.query(
        `
        UPDATE dbo.PV_TICKET_LOG
        SET ORD = NULL
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
    ticketId: string,
    idfol: string,
  ): Promise<{
    art: string;
    ctd: number;
    ord: string | null;
  }> {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(ART, ''))) AS ART,
        TRY_CONVERT(FLOAT, CTD) AS CTD,
        LTRIM(RTRIM(ISNULL(ORD, ''))) AS ORD
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

    return { art, ctd, ord };
  }

  private async findOrdBundle(iord: string): Promise<{
    header: Record<string, unknown> | null;
    details: Record<string, unknown>[];
  }> {
    const [headerRows, detailRows] = await Promise.all([
      this.dataSource.query(
        `
        SELECT TOP 1 *
        FROM dbo.PV_CTR_ORDS
        WHERE IORD = @0
        `,
        [iord],
      ),
      this.dataSource.query(
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

  private async updateOrdHeaderFromQuoteLine(input: {
    iord: string;
    tipo: string;
    opv: string;
    fechaEntrega: string;
    comad: string;
    descArt: string;
  }): Promise<void> {
    const existsRows = await this.dataSource.query(
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

    await this.dataSource.query(
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

  private toMessage(value: unknown): string {
    const text = String(value ?? '').trim();
    return text || 'Error de base de datos';
  }
}
