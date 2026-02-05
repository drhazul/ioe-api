import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PvCtrOrdsEntity } from './pvctrords.entity';
import { CreatePvCtrOrdsDto } from './dto/create-pvctrords.dto';
import { UpdatePvCtrOrdsDto } from './dto/update-pvctrords.dto';

@Injectable()
export class PvCtrOrdsService {
  constructor(
    @InjectRepository(PvCtrOrdsEntity)
    private readonly repo: Repository<PvCtrOrdsEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { IORD: 'ASC' } });
  }

  async findOne(iord: string) {
    const row = await this.repo.findOne({ where: { IORD: iord } });
    if (!row) throw new NotFoundException(`PV_CTR_ORDS ${iord} no existe`);
    return row;
  }

  async create(dto: CreatePvCtrOrdsDto) {
    const exists = await this.repo.exist({ where: { IORD: dto.IORD } });
    if (exists) throw new ConflictException(`IORD ${dto.IORD} ya existe`);

    const entity = this.repo.create({
      IORD: dto.IORD,
      IDFOL: dto.IDFOL ?? null,
      TIPO: dto.TIPO ?? null,
      OPV: dto.OPV ?? null,
      FCNS: dto.FCNS ? new Date(dto.FCNS) : null,
      FCNM: dto.FCNM ? new Date(dto.FCNM) : null,
      CLIEN: dto.CLIEN ?? null,
      MAT: dto.MAT ?? null,
      CTD: dto.CTD ?? null,
      ART: dto.ART ?? null,
      COMAD: dto.COMAD ?? null,
      ESTATUS: dto.ESTATUS ?? null,
      ESTSEGU: dto.ESTSEGU ?? null,
      ASIGN: dto.ASIGN ?? null,
      FCNRT: dto.FCNRT ? new Date(dto.FCNRT) : null,
      FCNAS: dto.FCNAS ? new Date(dto.FCNAS) : null,
      FCNTE: dto.FCNTE ? new Date(dto.FCNTE) : null,
      FCNTD: dto.FCNTD ? new Date(dto.FCNTD) : null,
      FCNEN: dto.FCNEN ? new Date(dto.FCNEN) : null,
      LABOR: dto.LABOR ?? null,
      TPOM: dto.TPOM ?? null,
      MOTR: dto.MOTR ?? null,
      REOORD: dto.REOORD ?? null,
      DOCIF: dto.DOCIF ?? null,
      SEL: dto.SEL ?? null,
      FCNMOD: dto.FCNMOD ? new Date(dto.FCNMOD) : null,
      SUC: dto.SUC ?? null,
      NCLIENTE: dto.NCLIENTE ?? null,
      RQFAC: dto.RQFAC ?? null,
      DESCART: dto.DESCART ?? null,
      CTORD: dto.CTORD ?? null,
      SELCTRLORD: dto.SELCTRLORD ?? null,
      SELCTRORDT: dto.SELCTRORDT ?? null,
      SELENT: dto.SELENT ?? null,
      RESMEMR: dto.RESMEMR ?? null,
      HR_ENT: dto.HR_ENT ? new Date(dto.HR_ENT) : null,
    });

    return this.repo.save(entity);
  }

  async update(iord: string, dto: UpdatePvCtrOrdsDto) {
    const row = await this.findOne(iord);

    const partial: Partial<PvCtrOrdsEntity> = {};
    if (dto.IDFOL !== undefined) partial.IDFOL = dto.IDFOL ?? null;
    if (dto.TIPO !== undefined) partial.TIPO = dto.TIPO ?? null;
    if (dto.OPV !== undefined) partial.OPV = dto.OPV ?? null;
    if (dto.FCNS !== undefined) partial.FCNS = dto.FCNS ? new Date(dto.FCNS) : null;
    if (dto.FCNM !== undefined) partial.FCNM = dto.FCNM ? new Date(dto.FCNM) : null;
    if (dto.CLIEN !== undefined) partial.CLIEN = dto.CLIEN ?? null;
    if (dto.MAT !== undefined) partial.MAT = dto.MAT ?? null;
    if (dto.CTD !== undefined) partial.CTD = dto.CTD ?? null;
    if (dto.ART !== undefined) partial.ART = dto.ART ?? null;
    if (dto.COMAD !== undefined) partial.COMAD = dto.COMAD ?? null;
    if (dto.ESTATUS !== undefined) partial.ESTATUS = dto.ESTATUS ?? null;
    if (dto.ESTSEGU !== undefined) partial.ESTSEGU = dto.ESTSEGU ?? null;
    if (dto.ASIGN !== undefined) partial.ASIGN = dto.ASIGN ?? null;
    if (dto.FCNRT !== undefined) partial.FCNRT = dto.FCNRT ? new Date(dto.FCNRT) : null;
    if (dto.FCNAS !== undefined) partial.FCNAS = dto.FCNAS ? new Date(dto.FCNAS) : null;
    if (dto.FCNTE !== undefined) partial.FCNTE = dto.FCNTE ? new Date(dto.FCNTE) : null;
    if (dto.FCNTD !== undefined) partial.FCNTD = dto.FCNTD ? new Date(dto.FCNTD) : null;
    if (dto.FCNEN !== undefined) partial.FCNEN = dto.FCNEN ? new Date(dto.FCNEN) : null;
    if (dto.LABOR !== undefined) partial.LABOR = dto.LABOR ?? null;
    if (dto.TPOM !== undefined) partial.TPOM = dto.TPOM ?? null;
    if (dto.MOTR !== undefined) partial.MOTR = dto.MOTR ?? null;
    if (dto.REOORD !== undefined) partial.REOORD = dto.REOORD ?? null;
    if (dto.DOCIF !== undefined) partial.DOCIF = dto.DOCIF ?? null;
    if (dto.SEL !== undefined) partial.SEL = dto.SEL ?? null;
    if (dto.FCNMOD !== undefined) partial.FCNMOD = dto.FCNMOD ? new Date(dto.FCNMOD) : null;
    if (dto.SUC !== undefined) partial.SUC = dto.SUC ?? null;
    if (dto.NCLIENTE !== undefined) partial.NCLIENTE = dto.NCLIENTE ?? null;
    if (dto.RQFAC !== undefined) partial.RQFAC = dto.RQFAC ?? null;
    if (dto.DESCART !== undefined) partial.DESCART = dto.DESCART ?? null;
    if (dto.CTORD !== undefined) partial.CTORD = dto.CTORD ?? null;
    if (dto.SELCTRLORD !== undefined) partial.SELCTRLORD = dto.SELCTRLORD ?? null;
    if (dto.SELCTRORDT !== undefined) partial.SELCTRORDT = dto.SELCTRORDT ?? null;
    if (dto.SELENT !== undefined) partial.SELENT = dto.SELENT ?? null;
    if (dto.RESMEMR !== undefined) partial.RESMEMR = dto.RESMEMR ?? null;
    if (dto.HR_ENT !== undefined) partial.HR_ENT = dto.HR_ENT ? new Date(dto.HR_ENT) : null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(iord: string) {
    const row = await this.findOne(iord);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar PV_CTR_ORDS ${iord} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, IORD: iord };
  }
}
