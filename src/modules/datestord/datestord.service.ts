import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DatEstOrdEntity } from './datestord.entity';
import { CreateDatEstOrdDto } from './dto/create-datestord.dto';
import { UpdateDatEstOrdDto } from './dto/update-datestord.dto';

@Injectable()
export class DatEstOrdService {
  constructor(
    @InjectRepository(DatEstOrdEntity)
    private readonly repo: Repository<DatEstOrdEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { ESTA: 'ASC' } });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { ESTA: id } });
    if (!row) throw new NotFoundException(`DAT_EST_ORD ${id} no existe`);
    return row;
  }

  async create(dto: CreateDatEstOrdDto) {
    const exists = await this.repo.exist({ where: { ESTA: dto.ESTA } });
    if (exists) throw new ConflictException(`ESTA ${dto.ESTA} ya existe`);

    const entity = this.repo.create({
      ESTA: dto.ESTA,
      TIPO: dto.TIPO ?? null,
      USR: dto.USR ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateDatEstOrdDto) {
    const row = await this.findOne(id);

    const partial: Partial<DatEstOrdEntity> = {};
    if (dto.TIPO !== undefined) partial.TIPO = dto.TIPO ?? null;
    if (dto.USR !== undefined) partial.USR = dto.USR ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar DAT_EST_ORD ${id} porque esta referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, ESTA: id };
  }
}

