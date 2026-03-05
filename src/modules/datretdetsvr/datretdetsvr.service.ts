import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DatRetDetSvrEntity } from './datretdetsvr.entity';
import { CreateDatRetDetSvrDto } from './dto/create-datretdetsvr.dto';
import { UpdateDatRetDetSvrDto } from './dto/update-datretdetsvr.dto';

@Injectable()
export class DatRetDetSvrService {
  constructor(
    @InjectRepository(DatRetDetSvrEntity)
    private readonly repo: Repository<DatRetDetSvrEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { ID: 'ASC' } });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { ID: id } });
    if (!row) throw new NotFoundException(`DAT_RET_DET_SVR ${id} no existe`);
    return row;
  }

  async create(dto: CreateDatRetDetSvrDto) {
    const exists = await this.repo.exist({ where: { ID: dto.ID } });
    if (exists) throw new ConflictException(`ID ${dto.ID} ya existe`);

    const entity = this.repo.create({
      ID: dto.ID,
      IDRET: dto.IDRET ?? null,
      FORMA: dto.FORMA ?? null,
      IMPF: dto.IMPF ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateDatRetDetSvrDto) {
    const row = await this.findOne(id);

    const partial: Partial<DatRetDetSvrEntity> = {};
    if (dto.IDRET !== undefined) partial.IDRET = dto.IDRET ?? null;
    if (dto.FORMA !== undefined) partial.FORMA = dto.FORMA ?? null;
    if (dto.IMPF !== undefined) partial.IMPF = dto.IMPF ?? null;

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
          `No se puede eliminar DAT_RET_DET_SVR ${id} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, ID: id };
  }
}
