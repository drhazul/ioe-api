import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PvRefDetalleAsignarDto } from './dto/pv-refdetalle-asignar.dto';
import { PvRefDetalleCrearDto } from './dto/pv-refdetalle-crear.dto';
import { PvRefDetalleQueryDto } from './dto/pv-refdetalle-query.dto';
import { RefDetalleEntity } from './refdetalle.entity';
import { CreateRefDetalleDto } from './dto/create-refdetalle.dto';
import { UpdateRefDetalleDto } from './dto/update-refdetalle.dto';

@Injectable()
export class RefDetalleService {
  private static readonly TIPOS_REFERENCIA = new Set([
    'TARJETA',
    'CHEQUE',
    'TRANSFERENCIA',
    'DEPOSITO 3RO',
  ]);

  constructor(
    @InjectRepository(RefDetalleEntity)
    private readonly repo: Repository<RefDetalleEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findAll() {
    return this.repo.find({ order: { IDREF: 'ASC' } });
  }

  async findOne(idref: string) {
    const row = await this.repo.findOne({ where: { IDREF: idref } });
    if (!row) throw new NotFoundException(`REF_DETALLE ${idref} no existe`);
    return row;
  }

  async create(dto: CreateRefDetalleDto) {
    const exists = await this.repo.exist({ where: { IDREF: dto.IDREF } });
    if (exists) throw new ConflictException(`IDREF ${dto.IDREF} ya existe`);

    const entity = this.repo.create({
      IDREF: dto.IDREF,
      SUC: dto.SUC ?? null,
      FCNR: dto.FCNR ? new Date(dto.FCNR) : null,
      FCND: dto.FCND ? new Date(dto.FCND) : null,
      OPV: dto.OPV ?? null,
      IDFOL: dto.IDFOL ?? null,
      IDC: dto.IDC ?? null,
      RFCEMISOR: dto.RFCEMISOR ?? null,
      TIPO: dto.TIPO ?? null,
      IMPT: dto.IMPT ?? null,
      ESTATUS: dto.ESTATUS ?? null,
    });

    return this.repo.save(entity);
  }

  async update(idref: string, dto: UpdateRefDetalleDto) {
    const row = await this.findOne(idref);

    const partial: Partial<RefDetalleEntity> = {};
    if (dto.SUC !== undefined) partial.SUC = dto.SUC ?? null;
    if (dto.FCNR !== undefined)
      partial.FCNR = dto.FCNR ? new Date(dto.FCNR) : null;
    if (dto.FCND !== undefined)
      partial.FCND = dto.FCND ? new Date(dto.FCND) : null;
    if (dto.OPV !== undefined) partial.OPV = dto.OPV ?? null;
    if (dto.IDFOL !== undefined) partial.IDFOL = dto.IDFOL ?? null;
    if (dto.IDC !== undefined) partial.IDC = dto.IDC ?? null;
    if (dto.RFCEMISOR !== undefined) partial.RFCEMISOR = dto.RFCEMISOR ?? null;
    if (dto.TIPO !== undefined) partial.TIPO = dto.TIPO ?? null;
    if (dto.IMPT !== undefined) partial.IMPT = dto.IMPT ?? null;
    if (dto.ESTATUS !== undefined) partial.ESTATUS = dto.ESTATUS ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async findByFolioForPv(query: PvRefDetalleQueryDto, user: JwtPayload) {
    const idfol = this.normalizeText(query.idfol);
    if (!idfol) {
      throw new BadRequestException('idfol es requerido');
    }
    const tipo = this.normalizeUpper(query.tipo ?? '');
    const userSuc = this.normalizeText(user?.suc ?? '');
    const params: unknown[] = [idfol];
    const where: string[] = ['IDFOL = @0'];
    let index = 1;

    if (tipo) {
      where.push("UPPER(LTRIM(RTRIM(ISNULL(TIPO, '')))) = @" + index);
      params.push(tipo);
      index += 1;
    }

    if (!this.isAdmin(user) && userSuc && userSuc !== '000') {
      where.push("UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @" + index);
      params.push(userSuc.toUpperCase());
    }

    const rows = await this.repo.query(
      `
      SELECT *
      FROM dbo.REF_DETALLE
      WHERE ${where.join(' AND ')}
      ORDER BY FCNR DESC, IDREF DESC
      `,
      params,
    );
    return rows;
  }

  async createForPv(dto: PvRefDetalleCrearDto, user: JwtPayload) {
    const suc = this.normalizeText(dto.suc);
    const idfol = this.normalizeText(dto.idfol);
    const rfcEmisor = this.normalizeText(dto.rfcEmisor);
    const tipo = this.normalizeTipo(dto.tipo);
    const idc = this.toNumber(dto.idc);
    const impt = this.toNumber(dto.impt);
    const opv =
      this.normalizeText(dto.opv) ||
      this.normalizeText(user?.username) ||
      String(user?.sub ?? '').trim();
    const fcnd = dto.fcnd ? new Date(dto.fcnd) : new Date();
    const customIdref = this.normalizeText(dto.idref);

    if (!suc) throw new BadRequestException('suc es requerido');
    if (!idfol) throw new BadRequestException('idfol es requerido');
    if (!Number.isFinite(idc))
      throw new BadRequestException('idc es requerido');
    if (Number(idc) <= 0) throw new BadRequestException('idc invalido');
    if (!rfcEmisor) throw new BadRequestException('rfcEmisor es requerido');
    if (!Number.isFinite(impt) || Number(impt) <= 0) {
      throw new BadRequestException('impt debe ser mayor a 0');
    }
    if (!opv) throw new BadRequestException('opv es requerido');
    if (this.isFormaNoEfectivo(tipo) && Number(idc) === 1) {
      throw new BadRequestException(
        'Para formas no efectivo el cliente no puede ser 1',
      );
    }

    this.assertUserSucAccess(user, suc);

    if (Number.isNaN(fcnd.getTime())) {
      throw new BadRequestException('fcnd invalida');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const folio = await this.loadFolioContext(queryRunner, idfol);
      if (
        this.normalizeUpper(folio.suc) &&
        this.normalizeUpper(folio.suc) !== this.normalizeUpper(suc)
      ) {
        throw new BadRequestException(
          `La sucursal ${suc} no corresponde al folio ${idfol}`,
        );
      }
      if (
        Number.isFinite(folio.clien) &&
        Number(folio.clien) > 0 &&
        Math.trunc(Number(folio.clien)) !== Math.trunc(Number(idc))
      ) {
        throw new BadRequestException(
          `El cliente ${idc} no corresponde al folio ${idfol}`,
        );
      }

      let idref = customIdref;
      if (idref) {
        const exists = await queryRunner.query(
          'SELECT TOP 1 IDREF FROM dbo.REF_DETALLE WHERE IDREF = @0',
          [idref],
        );
        if (exists?.length) {
          throw new ConflictException(`IDREF ${idref} ya existe`);
        }
      } else {
        idref = await this.generateUniqueIdref(queryRunner, Number(idc), fcnd);
      }

      await queryRunner.query(
        `
        INSERT INTO dbo.REF_DETALLE (
          SUC,
          IDREF,
          FCNR,
          FCND,
          OPV,
          IDFOL,
          IDC,
          RfcEmisor,
          TIPO,
          IMPT,
          ESTATUS
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
          @7,
          @8,
          'CAPTURADO'
        )
        `,
        [
          suc,
          idref,
          fcnd,
          opv,
          idfol,
          Number(idc),
          rfcEmisor,
          tipo,
          Number(impt),
        ],
      );

      await queryRunner.commitTransaction();
      return {
        ok: true,
        idref,
        fcnd: fcnd.toISOString(),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async loadFolioContext(
    executor: { query: (sql: string, params?: unknown[]) => Promise<any[]> },
    idfol: string,
  ) {
    const rows = await executor.query(
      `
      SELECT TOP 1
        SUC,
        CLIEN
      FROM dbo.PV_CTR_FOL_ASVR
      WHERE IDFOL = @0
      `,
      [idfol],
    );
    if (!rows?.length) {
      throw new NotFoundException(`La cotizacion ${idfol} no existe`);
    }
    const row = (rows[0] ?? {}) as Record<string, unknown>;
    return {
      suc: this.normalizeText(row.SUC),
      clien: this.toNumber(row.CLIEN),
    };
  }

  async assignForPv(dto: PvRefDetalleAsignarDto, user: JwtPayload) {
    const idref = this.normalizeText(dto.idref);
    if (!idref) throw new BadRequestException('idref es requerido');
    const expectedIdfol = this.normalizeText(dto.idfol ?? '');

    const rowResult = await this.repo.query(
      `
      SELECT TOP 1 *
      FROM dbo.REF_DETALLE
      WHERE IDREF = @0
      `,
      [idref],
    );
    const row = (rowResult?.[0] ?? null) as Record<string, unknown> | null;
    if (!row) {
      throw new NotFoundException(`REF_DETALLE ${idref} no existe`);
    }

    const suc = this.normalizeText(row.SUC);
    this.assertUserSucAccess(user, suc);

    const idfol = this.normalizeText(row.IDFOL);
    if (expectedIdfol && expectedIdfol !== idfol) {
      throw new BadRequestException(
        `La referencia ${idref} no pertenece al folio ${expectedIdfol}`,
      );
    }

    const rfcEmisor = this.normalizeText(row.RfcEmisor ?? row.RFCEMISOR);
    const impt = this.toNumber(row.IMPT);
    if (!rfcEmisor) {
      throw new BadRequestException(
        `La referencia ${idref} no tiene RfcEmisor`,
      );
    }
    if (!Number.isFinite(impt)) {
      throw new BadRequestException(`La referencia ${idref} no tiene IMPT`);
    }

    await this.repo.query(
      `
      UPDATE dbo.REF_DETALLE
      SET ESTATUS = 'PROCESADO'
      WHERE IDREF = @0
      `,
      [idref],
    );

    return {
      ok: true,
      idref,
    };
  }

  async removeForPv(
    idrefRaw: string,
    idfolRaw: string | undefined,
    user: JwtPayload,
  ) {
    const idref = this.normalizeText(idrefRaw);
    if (!idref) throw new BadRequestException('idref es requerido');
    const idfol = this.normalizeText(idfolRaw ?? '');

    const rowResult = await this.repo.query(
      `
      SELECT TOP 1 *
      FROM dbo.REF_DETALLE
      WHERE IDREF = @0
      `,
      [idref],
    );
    const row = (rowResult?.[0] ?? null) as Record<string, unknown> | null;
    if (!row) {
      throw new NotFoundException(`REF_DETALLE ${idref} no existe`);
    }

    const rowIdfol = this.normalizeText(row.IDFOL);
    if (idfol && rowIdfol !== idfol) {
      throw new BadRequestException(
        `La referencia ${idref} no pertenece al folio ${idfol}`,
      );
    }

    this.assertUserSucAccess(user, this.normalizeText(row.SUC));

    await this.repo.query('DELETE FROM dbo.REF_DETALLE WHERE IDREF = @0', [
      idref,
    ]);
    return { deleted: true, idref };
  }

  async remove(idref: string) {
    const row = await this.findOne(idref);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar REF_DETALLE ${idref} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, IDREF: idref };
  }

  private async generateUniqueIdref(
    queryRunner: { query: (sql: string, params?: unknown[]) => Promise<any[]> },
    idc: number,
    fcnd: Date,
  ) {
    for (let i = 0; i < 8; i++) {
      const candidate = this.generateIdrefCandidate(idc, fcnd);
      const rows = await queryRunner.query(
        'SELECT TOP 1 IDREF FROM dbo.REF_DETALLE WHERE IDREF = @0',
        [candidate],
      );
      if (!rows?.length) return candidate;
    }
    throw new ConflictException('No se pudo generar IDREF único');
  }

  private generateIdrefCandidate(idc: number, fcnd: Date) {
    const dd = String(fcnd.getDate()).padStart(2, '0');
    const mm = String(fcnd.getMonth() + 1).padStart(2, '0');
    const yyyy = String(fcnd.getFullYear()).padStart(4, '0');
    const idcPart = Math.trunc(idc).toString();
    const uuidPart = randomUUID().replace(/-/g, '').slice(-8).toUpperCase();
    return `${dd}${mm}${yyyy}-${idcPart}-${uuidPart}`;
  }

  private normalizeText(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown) {
    return this.normalizeText(value).toUpperCase();
  }

  private toNumber(value: unknown) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : NaN;
  }

  private isAdmin(user?: JwtPayload | null) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private assertUserSucAccess(user: JwtPayload, suc: string) {
    if (this.isAdmin(user)) return;
    const userSuc = this.normalizeText(user?.suc ?? '');
    if (!userSuc || userSuc === '000') return;
    if (this.normalizeUpper(userSuc) !== this.normalizeUpper(suc)) {
      throw new ForbiddenException(
        `No autorizado para operar referencias de la sucursal ${suc}`,
      );
    }
  }

  private normalizeTipo(value: unknown) {
    const raw = this.normalizeUpper(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '');
    const aliases: Record<string, string> = {
      TARJETA: 'TARJETA',
      CARD: 'TARJETA',
      CHEQUE: 'CHEQUE',
      TRANSFERENCIA: 'TRANSFERENCIA',
      TRANSFER: 'TRANSFERENCIA',
      SPEI: 'TRANSFERENCIA',
      DEPOSITO3RO: 'DEPOSITO 3RO',
      DEPOSITO3ROS: 'DEPOSITO 3RO',
      DEPOSITOTERCERO: 'DEPOSITO 3RO',
    };
    const tipo = aliases[raw] ?? this.normalizeUpper(value);
    if (!RefDetalleService.TIPOS_REFERENCIA.has(tipo)) {
      throw new BadRequestException(
        'tipo invalido. Valores permitidos: TARJETA, CHEQUE, TRANSFERENCIA, DEPOSITO 3RO',
      );
    }
    return tipo;
  }

  private isFormaNoEfectivo(tipo: string) {
    const normalized = this.normalizeUpper(tipo);
    return normalized !== 'EFECTIVO';
  }
}
