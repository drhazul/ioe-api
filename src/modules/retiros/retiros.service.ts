import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AddRetiroDetalleDto } from './dto/add-retiro-detalle.dto';
import { CreateRetiroDto } from './dto/create-retiro.dto';
import { SetRetiroEfectivoDto } from './dto/set-retiro-efectivo.dto';

type AuditAction = 'POST' | 'PUT' | 'DELETE';

type RetiroDetalleDto = {
  id: string;
  idret: string;
  forma: string;
  impf: number;
  efectivo: RetiroEfectivoDto[];
};

type RetiroEfectivoDto = {
  id: string;
  idfor: string;
  deno: number;
  ctda: number;
  total: number;
};

@Injectable()
export class RetirosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async listToday(user: JwtPayload) {
    try {
      const opv = this.resolveOpv(user);
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ret_list_today @OPV=@0',
        [opv],
      );
      return {
        ok: true,
        items: (rows ?? []).map((row) => this.mapPanelItem(row)),
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar retiros del día');
    }
  }

  async create(dto: CreateRetiroDto, user: JwtPayload, ip: string | null) {
    try {
      const opv = this.resolveOpv(user);
      const ter = this.normalize(dto.ter ?? user.username ?? '');

      const rows = await this.dataSource.query(
        `
        DECLARE @IDRET NVARCHAR(255);
        EXEC dbo.sp_ret_create @OPV=@0, @TER=@1, @IDRET=@IDRET OUTPUT;
        SELECT @IDRET AS IDRET;
        `,
        [opv, ter || null],
      );

      const created = this.firstRow(rows);
      const idret = this.normalize(this.getRowValue(created, 'IDRET'));
      if (!idret) {
        throw new ConflictException('No se pudo recuperar IDRET del nuevo retiro');
      }

      const payload = await this.getById(idret, user);
      await this.auditMutation({
        action: 'POST',
        entidad: 'retiro',
        entidadId: idret,
        metadata: {
          body: { ter: ter || null },
          params: {},
        },
        user,
        ip,
      });

      return payload;
    } catch (error) {
      throw this.mapError(error, 'No se pudo crear retiro');
    }
  }

  async getById(idretRaw: string, user: JwtPayload) {
    try {
      const opv = this.resolveOpv(user);
      const idret = this.normalize(idretRaw);
      if (!idret) throw new BadRequestException('idret es requerido');

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ret_get @IDRET=@0, @OPV=@1',
        [idret, opv],
      );
      const row = this.firstRow(rows);
      if (!row) {
        throw new NotFoundException(
          `Retiro ${idret} no existe o no pertenece al OPV`,
        );
      }
      return this.mapGetPayload(row);
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar retiro');
    }
  }

  async addDetalle(
    idretRaw: string,
    dto: AddRetiroDetalleDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const opv = this.resolveOpv(user);
      const idret = this.normalize(idretRaw);
      const forma = this.normalizeUpper(dto.forma);
      if (!idret) throw new BadRequestException('idret es requerido');
      if (!forma) throw new BadRequestException('forma es requerida');

      const rows = await this.dataSource.query(
        `
        DECLARE @IDFOR NVARCHAR(255);
        EXEC dbo.sp_ret_add_det
          @IDRET=@0,
          @OPV=@1,
          @FORMA=@2,
          @IMPF=@3,
          @IDFOR=@IDFOR OUTPUT;
        SELECT @IDFOR AS IDFOR;
        `,
        [idret, opv, forma, dto.impf ?? null],
      );
      const result = this.firstRow(rows);
      const idfor = this.normalize(this.getRowValue(result, 'IDFOR'));
      if (!idfor) {
        throw new ConflictException(
          'No se pudo recuperar IDFOR del detalle insertado',
        );
      }

      await this.auditMutation({
        action: 'POST',
        entidad: 'detalle',
        entidadId: idfor,
        metadata: {
          body: dto,
          params: { idret },
        },
        user,
        ip,
      });

      return {
        ok: true,
        idret,
        idfor,
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo agregar detalle al retiro');
    }
  }

  async setEfectivo(
    idforRaw: string,
    dto: SetRetiroEfectivoDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const opv = this.resolveOpv(user);
      const idfor = this.normalize(idforRaw);
      if (!idfor) throw new BadRequestException('idfor es requerido');

      let rows: unknown[] = [];
      if (Array.isArray(dto.items) && dto.items.length > 0) {
        const items = dto.items.map((item) => ({
          DENO: item.deno,
          CTDA: item.ctda,
        }));
        rows = await this.dataSource.query(
          'EXEC dbo.sp_ret_set_efectivo_batch @IDFOR=@0, @OPV=@1, @JsonDenos=@2',
          [idfor, opv, JSON.stringify(items)],
        );
      } else {
        if (dto.deno == null || dto.ctda == null) {
          throw new BadRequestException(
            'Para actualización unitaria debe enviar deno y ctda',
          );
        }
        rows = await this.dataSource.query(
          'EXEC dbo.sp_ret_set_efectivo @IDFOR=@0, @OPV=@1, @DENO=@2, @CTDA=@3',
          [idfor, opv, dto.deno, dto.ctda],
        );
      }

      const result = this.firstRow(rows);
      await this.auditMutation({
        action: 'PUT',
        entidad: 'efectivo',
        entidadId: idfor,
        metadata: {
          body: dto,
          params: { idfor },
        },
        user,
        ip,
      });

      return {
        ok: true,
        idfor,
        impf: this.toNumber(this.getRowValue(result, 'IMPF')) ?? 0,
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo actualizar denominaciones');
    }
  }

  async deleteDetalle(
    idforRaw: string,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const opv = this.resolveOpv(user);
      const idfor = this.normalize(idforRaw);
      if (!idfor) throw new BadRequestException('idfor es requerido');

      await this.dataSource.query(
        'EXEC dbo.sp_ret_delete_det @IDFOR=@0, @OPV=@1',
        [idfor, opv],
      );

      await this.auditMutation({
        action: 'DELETE',
        entidad: 'detalle',
        entidadId: idfor,
        metadata: {
          body: {},
          params: { idfor },
        },
        user,
        ip,
      });

      return {
        ok: true,
        deleted: true,
        idfor,
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo eliminar detalle');
    }
  }

  async finalize(idretRaw: string, user: JwtPayload, ip: string | null) {
    try {
      const opv = this.resolveOpv(user);
      const idret = this.normalize(idretRaw);
      if (!idret) throw new BadRequestException('idret es requerido');

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ret_finalize @IDRET=@0, @OPV=@1',
        [idret, opv],
      );

      const result = this.firstRow(rows);
      await this.auditMutation({
        action: 'POST',
        entidad: 'retiro',
        entidadId: idret,
        metadata: {
          body: {},
          params: { idret, operation: 'finalize' },
        },
        user,
        ip,
      });

      return {
        ok: true,
        retiro: this.mapHeader(result),
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo finalizar retiro');
    }
  }

  async cancel(idretRaw: string, user: JwtPayload, ip: string | null) {
    try {
      const opv = this.resolveOpv(user);
      const idret = this.normalize(idretRaw);
      if (!idret) throw new BadRequestException('idret es requerido');

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_ret_cancel @IDRET=@0, @OPV=@1',
        [idret, opv],
      );

      const result = this.firstRow(rows);
      await this.auditMutation({
        action: 'POST',
        entidad: 'retiro',
        entidadId: idret,
        metadata: {
          body: {},
          params: { idret, operation: 'cancel' },
        },
        user,
        ip,
      });

      return {
        ok: true,
        retiro: this.mapHeader(result),
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo cancelar retiro');
    }
  }

  async listFormasRetiro() {
    try {
      const rows = await this.dataSource.query(`
        SELECT
          FORM,
          MIN(ISNULL(BLOQ, 0)) AS BLOQ
        FROM dbo.VW_PV_FORM_TIPOTRAN_DISTINCT
        WHERE NULLIF(LTRIM(RTRIM(ISNULL(FORM, ''))), '') IS NOT NULL
        GROUP BY FORM
        ORDER BY FORM ASC
      `);

      return (rows ?? []).map((row) => ({
        form: this.normalizeUpper(this.getRowValue(row, 'FORM')),
        bloq: this.toInt(this.getRowValue(row, 'BLOQ')) ?? 0,
      }));
    } catch (error) {
      throw this.mapError(
        error,
        'No se pudo consultar catálogo de formas para retiros',
      );
    }
  }

  private mapGetPayload(row: Record<string, unknown>) {
    const header = this.mapHeader(row);
    const detallesRaw = this.parseJsonArray(
      this.getRowValue(row, 'DETALLES_JSON'),
    );
    const efectivoRaw = this.parseJsonArray(
      this.getRowValue(row, 'EFECTIVO_JSON'),
    );

    const efectivoByIdfor = new Map<string, RetiroEfectivoDto[]>();
    for (const raw of efectivoRaw) {
      const idfor = this.normalize(this.getRowValue(raw, 'IDFOR'));
      if (!idfor) continue;
      const mapped: RetiroEfectivoDto = {
        id: this.normalize(this.getRowValue(raw, 'ID')),
        idfor,
        deno: this.toNumber(this.getRowValue(raw, 'DENO')) ?? 0,
        ctda: this.toNumber(this.getRowValue(raw, 'CTDA')) ?? 0,
        total: this.toNumber(this.getRowValue(raw, 'TOTAL')) ?? 0,
      };
      const list = efectivoByIdfor.get(idfor) ?? [];
      list.push(mapped);
      efectivoByIdfor.set(idfor, list);
    }
    for (const list of efectivoByIdfor.values()) {
      list.sort((a, b) => b.deno - a.deno);
    }

    const detalles: RetiroDetalleDto[] = [];
    for (const raw of detallesRaw) {
      const id = this.normalize(this.getRowValue(raw, 'ID'));
      if (!id) continue;
      detalles.push({
        id,
        idret: this.normalize(this.getRowValue(raw, 'IDRET')),
        forma: this.normalizeUpper(this.getRowValue(raw, 'FORMA')),
        impf: this.toNumber(this.getRowValue(raw, 'IMPF')) ?? 0,
        efectivo: efectivoByIdfor.get(id) ?? [],
      });
    }

    return {
      ok: true,
      header,
      detalles,
      total: this.round2(
        detalles.reduce((acc, item) => acc + item.impf, 0),
      ),
    };
  }

  private mapHeader(row: Record<string, unknown> | null) {
    return {
      idret: this.normalize(this.getRowValue(row, 'IDRET')),
      ter: this.nullableText(this.getRowValue(row, 'TER')),
      opv: this.nullableText(this.getRowValue(row, 'OPV')),
      fcnr: this.toIso(this.getRowValue(row, 'FCNR')),
      impr: this.toNumber(this.getRowValue(row, 'IMPR')) ?? 0,
      esta: this.normalizeUpper(this.getRowValue(row, 'ESTA')),
    };
  }

  private mapPanelItem(row: Record<string, unknown>) {
    return {
      idret: this.normalize(this.getRowValue(row, 'IDRET')),
      ter: this.nullableText(this.getRowValue(row, 'TER')),
      opv: this.nullableText(this.getRowValue(row, 'OPV')),
      fcnr: this.toIso(this.getRowValue(row, 'FCNR')),
      impr: this.toNumber(this.getRowValue(row, 'IMPR')) ?? 0,
      esta: this.normalizeUpper(this.getRowValue(row, 'ESTA')),
      detCount: this.toInt(this.getRowValue(row, 'DET_COUNT')) ?? 0,
      detTotal: this.toNumber(this.getRowValue(row, 'DET_TOTAL')) ?? 0,
    };
  }

  private resolveOpv(user: JwtPayload) {
    const opv = this.normalizeUpper(user?.username ?? '');
    if (!opv) {
      throw new BadRequestException(
        'No se pudo resolver OPV del usuario autenticado',
      );
    }
    return opv;
  }

  private async auditMutation(input: {
    action: AuditAction;
    entidad: string;
    entidadId: string;
    metadata: unknown;
    user: JwtPayload;
    ip: string | null;
  }) {
    await this.audit.log({
      IDUSUARIO: Number(input.user?.sub ?? 0) || null,
      ACTION: input.action,
      MODULO: 'retiros',
      ENTIDAD: input.entidad,
      ENTIDAD_ID: input.entidadId || null,
      SUC: this.nullableText(input.user?.suc ?? null),
      METADATA_JSON: JSON.stringify(input.metadata ?? {}),
      IP: input.ip,
    });
  }

  private firstRow(rows: unknown): Record<string, unknown> | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    if (!row || typeof row !== 'object') return null;
    return row as Record<string, unknown>;
  }

  private getRowValue(row: unknown, key: string) {
    if (!row || typeof row !== 'object') return undefined;
    const record = row as Record<string, unknown>;
    const target = key.toUpperCase();
    for (const [rawKey, value] of Object.entries(record)) {
      if (rawKey.toUpperCase() === target) return value;
    }
    return undefined;
  }

  private parseJsonArray(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value.filter((item) => item && typeof item === 'object') as Record<
        string,
        unknown
      >[];
    }
    const text = this.normalize(value);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item) => item && typeof item === 'object',
      ) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  private normalize(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown) {
    return this.normalize(value).toUpperCase();
  }

  private nullableText(value: unknown) {
    const text = this.normalize(value);
    return text.length > 0 ? text : null;
  }

  private toInt(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Math.trunc(value) : null;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNumber(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toIso(value: unknown) {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private round2(value: number) {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  }

  private mapError(error: unknown, fallback: string): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
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
