import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DatRetDetEfecSvrEntity } from './datretdetefecsvr.entity';
import { CreateDatRetDetEfecSvrDto } from './dto/create-datretdetefecsvr.dto';
import { UpdateDatRetDetEfecSvrDto } from './dto/update-datretdetefecsvr.dto';

@Injectable()
export class DatRetDetEfecSvrService {
  constructor(
    @InjectRepository(DatRetDetEfecSvrEntity)
    private readonly repo: Repository<DatRetDetEfecSvrEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { ID: 'ASC' } });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { ID: id } });
    if (!row)
      throw new NotFoundException(`DAT_RET_DET_EFEC_SVR ${id} no existe`);
    return row;
  }

  async create(dto: CreateDatRetDetEfecSvrDto) {
    const exists = await this.repo.exist({ where: { ID: dto.ID } });
    if (exists) throw new ConflictException(`ID ${dto.ID} ya existe`);

    const entity = this.repo.create({
      ID: dto.ID,
      IDFOR: dto.IDFOR ?? null,
      DENO: dto.DENO ?? null,
      CTDA: dto.CTDA ?? null,
      TOTAL: dto.TOTAL ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateDatRetDetEfecSvrDto) {
    const row = await this.findOne(id);

    const partial: Partial<DatRetDetEfecSvrEntity> = {};
    if (dto.IDFOR !== undefined) partial.IDFOR = dto.IDFOR ?? null;
    if (dto.DENO !== undefined) partial.DENO = dto.DENO ?? null;
    if (dto.CTDA !== undefined) partial.CTDA = dto.CTDA ?? null;
    if (dto.TOTAL !== undefined) partial.TOTAL = dto.TOTAL ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar DAT_RET_DET_EFEC_SVR ${id} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, ID: id };
  }
}
