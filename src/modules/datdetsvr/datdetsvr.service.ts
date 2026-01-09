import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DatDetSvrEntity } from './datdetsvr.entity';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';
import { CreateDatDetSvrDto } from './dto/create-datdetsvr.dto';
import { UpdateDatDetSvrDto } from './dto/update-datdetsvr.dto';

@Injectable()
export class DatDetSvrService {
  constructor(
    @InjectRepository(DatDetSvrEntity)
    private readonly repo: Repository<DatDetSvrEntity>,
    @InjectRepository(DatContCtrlEntity)
    private readonly ctrlRepo: Repository<DatContCtrlEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { ID: 'ASC' } });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { ID: id } });
    if (!row) throw new NotFoundException(`DAT_DET_SVR ${id} no existe`);
    return row;
  }

  async create(dto: CreateDatDetSvrDto) {
    const entity = this.repo.create({
      ART: dto.ART ?? null,
      UPC: dto.UPC ?? null,
      CONT: dto.CONT ?? null,
      DES: dto.DES ?? null,
      CTOP: dto.CTOP ?? null,
      TOTAL: dto.TOTAL ?? null,
      MB52_T: dto.MB52_T ?? null,
      DIF_T: dto.DIF_T ?? null,
      DIF_CTOP: dto.DIF_CTOP ?? null,
      DEPA: dto.DEPA ?? null,
      SUBD: dto.SUBD ?? null,
      CLAS: dto.CLAS ?? null,
      EXT: dto.EXT ?? null,
      '001': dto['001'] ?? null,
      '002': dto['002'] ?? null,
      M001: dto.M001 ?? null,
      T001: dto.T001 ?? null,
      MB52_01: dto.MB52_01 ?? null,
      MB52_02: dto.MB52_02 ?? null,
      MB52_M1: dto.MB52_M1 ?? null,
      MB52_T1: dto.MB52_T1 ?? null,
      DIF_01: dto.DIF_01 ?? null,
      DIF_02: dto.DIF_02 ?? null,
      DIF_M1: dto.DIF_M1 ?? null,
      DIF_T1: dto.DIF_T1 ?? null,
      SUC: dto.SUC ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateDatDetSvrDto) {
    const row = await this.findOne(id);
    const partial: Partial<DatDetSvrEntity> = {};

    if (dto.EXT !== undefined) {
      const cont = (row.CONT ?? '').trim();
      const suc = (row.SUC ?? '').trim();
      if (cont.length > 0 && suc.length > 0) {
        const ctrl = await this.ctrlRepo.findOne({ where: { CONT: cont, SUC: suc } });
        const estado = (ctrl?.ESTA ?? '').trim().toUpperCase();
        if (estado === 'AJUSTADO' || estado === 'CERRADO_AJUSTADO') {
          throw new ConflictException('Conteo ya ajustado');
        }
      }
    }

    if (dto.ART !== undefined) partial.ART = dto.ART ?? null;
    if (dto.UPC !== undefined) partial.UPC = dto.UPC ?? null;
    if (dto.CONT !== undefined) partial.CONT = dto.CONT ?? null;
    if (dto.DES !== undefined) partial.DES = dto.DES ?? null;
    if (dto.CTOP !== undefined) partial.CTOP = dto.CTOP ?? null;
    if (dto.TOTAL !== undefined) partial.TOTAL = dto.TOTAL ?? null;
    if (dto.MB52_T !== undefined) partial.MB52_T = dto.MB52_T ?? null;
    if (dto.DIF_T !== undefined) partial.DIF_T = dto.DIF_T ?? null;
    if (dto.DIF_CTOP !== undefined) partial.DIF_CTOP = dto.DIF_CTOP ?? null;
    if (dto.DEPA !== undefined) partial.DEPA = dto.DEPA ?? null;
    if (dto.SUBD !== undefined) partial.SUBD = dto.SUBD ?? null;
    if (dto.CLAS !== undefined) partial.CLAS = dto.CLAS ?? null;
    if (dto.EXT !== undefined) partial.EXT = dto.EXT ?? null;
    if (dto['001'] !== undefined) partial['001'] = dto['001'] ?? null;
    if (dto['002'] !== undefined) partial['002'] = dto['002'] ?? null;
    if (dto.M001 !== undefined) partial.M001 = dto.M001 ?? null;
    if (dto.T001 !== undefined) partial.T001 = dto.T001 ?? null;
    if (dto.MB52_01 !== undefined) partial.MB52_01 = dto.MB52_01 ?? null;
    if (dto.MB52_02 !== undefined) partial.MB52_02 = dto.MB52_02 ?? null;
    if (dto.MB52_M1 !== undefined) partial.MB52_M1 = dto.MB52_M1 ?? null;
    if (dto.MB52_T1 !== undefined) partial.MB52_T1 = dto.MB52_T1 ?? null;
    if (dto.DIF_01 !== undefined) partial.DIF_01 = dto.DIF_01 ?? null;
    if (dto.DIF_02 !== undefined) partial.DIF_02 = dto.DIF_02 ?? null;
    if (dto.DIF_M1 !== undefined) partial.DIF_M1 = dto.DIF_M1 ?? null;
    if (dto.DIF_T1 !== undefined) partial.DIF_T1 = dto.DIF_T1 ?? null;
    if (dto.SUC !== undefined) partial.SUC = dto.SUC ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar DAT_DET_SVR ${id} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, ID: id };
  }
}
