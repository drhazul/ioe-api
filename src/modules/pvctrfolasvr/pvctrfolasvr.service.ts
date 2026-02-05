import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { PvCtrFolAsvrEntity } from './pvctrfolasvr.entity';
import { CreatePvCtrFolAsvrDto } from './dto/create-pvctrfolasvr.dto';
import { UpdatePvCtrFolAsvrDto } from './dto/update-pvctrfolasvr.dto';
import { CreatePvCtrFolAsvrAutoDto } from './dto/create-pvctrfolasvr-auto.dto';
import type { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class PvCtrFolAsvrService {
  constructor(
    @InjectRepository(PvCtrFolAsvrEntity)
    private readonly repo: Repository<PvCtrFolAsvrEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findAll() {
    return this.repo.find({ order: { IDFOL: 'ASC' } });
  }

  async findOne(idfol: string) {
    const row = await this.repo.findOne({ where: { IDFOL: idfol } });
    if (!row) throw new NotFoundException(`PV_CTR_FOL_ASVR ${idfol} no existe`);
    return row;
  }

  async create(dto: CreatePvCtrFolAsvrDto) {
    const exists = await this.repo.exist({ where: { IDFOL: dto.IDFOL } });
    if (exists) throw new ConflictException(`IDFOL ${dto.IDFOL} ya existe`);

    const entity = this.repo.create({
      IDFOL: dto.IDFOL,
      CLIEN: dto.CLIEN ?? null,
      DOC: dto.DOC ?? null,
      FCN: dto.FCN ? new Date(dto.FCN) : null,
      SUC: dto.SUC ?? null,
      TER: dto.TER ?? null,
      TRA: dto.TRA ?? null,
      OPV: dto.OPV ?? null,
      ESTA: dto.ESTA ?? null,
      IMPT: dto.IMPT ?? null,
      FPGO: dto.FPGO ?? null,
      IMPP: dto.IMPP ?? null,
      AUT: dto.AUT ?? null,
      REQF: dto.REQF ?? null,
      FCNM: dto.FCNM ? new Date(dto.FCNM) : null,
      OPVM: dto.OPVM ?? null,
      MOD: dto.MOD ?? null,
      IDFOLORIG: dto.IDFOLORIG ?? null,
    });

    return this.repo.save(entity);
  }

  async createAuto(dto: CreatePvCtrFolAsvrAutoDto, user: JwtPayload) {
    const suc = (user?.suc ?? '').trim();
    if (!suc) throw new ForbiddenException('Usuario sin sucursal');

    const opv = (user?.username ?? '').trim() || String(user?.sub ?? '');
    if (!opv) throw new BadRequestException('OPV requerida');

    const ter = (dto?.TER ?? '').trim() || null;

    let result: any[];
    try {
      result = await this.dataSource.query(
        `
        DECLARE @IDFOL_OUT NVARCHAR(255);
        DECLARE @TRA_OUT INT;
        EXEC dbo.sp_pvctrfolasvr_create
          @SUC=@0,
          @OPV=@1,
          @TER=@2,
          @IDFOL_OUT=@IDFOL_OUT OUTPUT,
          @TRA_OUT=@TRA_OUT OUTPUT;
        SELECT @IDFOL_OUT AS IDFOL, @TRA_OUT AS TRA;
        `,
        [suc, opv, ter],
      );
    } catch (err: any) {
      throw new BadRequestException(
        `No se pudo crear PV_CTR_FOL_ASVR: ${err?.message ?? 'error inesperado'}`,
      );
    }

    const firstRow = result?.[0] ?? null;
    let idfol: any = firstRow?.IDFOL ?? firstRow?.Idfol ?? firstRow?.idfol ?? null;
    if (!idfol && firstRow) {
      const key = Object.keys(firstRow).find((k) => k.toLowerCase() === 'idfol');
      if (key) idfol = (firstRow as any)[key];
    }

    if (!idfol || String(idfol).trim().length === 0) {
      throw new ConflictException('No se pudo generar IDFOL');
    }

    const rows = await this.dataSource.query(
      `SELECT TOP 1 * FROM ${this.repo.metadata.tablePath} WHERE IDFOL = @0`,
      [idfol],
    );
    if (!rows?.length) throw new NotFoundException(`PV_CTR_FOL_ASVR ${idfol} no existe`);
    return rows[0];
  }

  async update(idfol: string, dto: UpdatePvCtrFolAsvrDto) {
    const row = await this.findOne(idfol);

    const partial: Partial<PvCtrFolAsvrEntity> = {};
    if (dto.CLIEN !== undefined) partial.CLIEN = dto.CLIEN ?? null;
    if (dto.DOC !== undefined) partial.DOC = dto.DOC ?? null;
    if (dto.FCN !== undefined) partial.FCN = dto.FCN ? new Date(dto.FCN) : null;
    if (dto.SUC !== undefined) partial.SUC = dto.SUC ?? null;
    if (dto.TER !== undefined) partial.TER = dto.TER ?? null;
    if (dto.TRA !== undefined) partial.TRA = dto.TRA ?? null;
    if (dto.OPV !== undefined) partial.OPV = dto.OPV ?? null;
    if (dto.ESTA !== undefined) partial.ESTA = dto.ESTA ?? null;
    if (dto.IMPT !== undefined) partial.IMPT = dto.IMPT ?? null;
    if (dto.FPGO !== undefined) partial.FPGO = dto.FPGO ?? null;
    if (dto.IMPP !== undefined) partial.IMPP = dto.IMPP ?? null;
    if (dto.AUT !== undefined) partial.AUT = dto.AUT ?? null;
    if (dto.REQF !== undefined) partial.REQF = dto.REQF ?? null;
    if (dto.FCNM !== undefined) partial.FCNM = dto.FCNM ? new Date(dto.FCNM) : null;
    if (dto.OPVM !== undefined) partial.OPVM = dto.OPVM ?? null;
    if (dto.MOD !== undefined) partial.MOD = dto.MOD ?? null;
    if (dto.IDFOLORIG !== undefined) partial.IDFOLORIG = dto.IDFOLORIG ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(idfol: string) {
    const row = await this.findOne(idfol);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar PV_CTR_FOL_ASVR ${idfol} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, IDFOL: idfol };
  }
}
