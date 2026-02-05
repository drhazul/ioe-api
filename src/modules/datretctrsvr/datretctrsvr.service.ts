import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DatRetCtrSvrEntity } from './datretctrsvr.entity';
import { CreateDatRetCtrSvrDto } from './dto/create-datretctrsvr.dto';
import { UpdateDatRetCtrSvrDto } from './dto/update-datretctrsvr.dto';

@Injectable()
export class DatRetCtrSvrService {
  constructor(
    @InjectRepository(DatRetCtrSvrEntity)
    private readonly repo: Repository<DatRetCtrSvrEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { IDRET: 'ASC' } });
  }

  async findOne(idret: string) {
    const row = await this.repo.findOne({ where: { IDRET: idret } });
    if (!row) throw new NotFoundException(`DAT_RET_CTR_SVR ${idret} no existe`);
    return row;
  }

  async create(dto: CreateDatRetCtrSvrDto) {
    const exists = await this.repo.exist({ where: { IDRET: dto.IDRET } });
    if (exists) throw new ConflictException(`IDRET ${dto.IDRET} ya existe`);

    const entity = this.repo.create({
      IDRET: dto.IDRET,
      TER: dto.TER ?? null,
      OPV: dto.OPV ?? null,
      FCNR: dto.FCNR ? new Date(dto.FCNR) : null,
      IMPR: dto.IMPR ?? null,
      ESTA: dto.ESTA ?? null,
    });

    return this.repo.save(entity);
  }

  async update(idret: string, dto: UpdateDatRetCtrSvrDto) {
    const row = await this.findOne(idret);

    const partial: Partial<DatRetCtrSvrEntity> = {};
    if (dto.TER !== undefined) partial.TER = dto.TER ?? null;
    if (dto.OPV !== undefined) partial.OPV = dto.OPV ?? null;
    if (dto.FCNR !== undefined) partial.FCNR = dto.FCNR ? new Date(dto.FCNR) : null;
    if (dto.IMPR !== undefined) partial.IMPR = dto.IMPR ?? null;
    if (dto.ESTA !== undefined) partial.ESTA = dto.ESTA ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(idret: string) {
    const row = await this.findOne(idret);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar DAT_RET_CTR_SVR ${idret} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, IDRET: idret };
  }
}
