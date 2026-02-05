import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { JrqClasEntity } from './jrqclas.entity';
import { CreateJrqClasDto } from './dto/create-jrqclas.dto';
import { UpdateJrqClasDto } from './dto/update-jrqclas.dto';

@Injectable()
export class JrqClasService {
  constructor(
    @InjectRepository(JrqClasEntity)
    private readonly repo: Repository<JrqClasEntity>,
  ) {}

  findAll(filter?: { subd?: string }) {
    const parseNumber = (value?: string) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const normalized = trimmed.replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : undefined;
    };
    const where: any = {};
    const subd = parseNumber(filter?.subd);
    if (subd !== undefined) where.SUBD = subd;
    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { CLAS: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { CLAS: id } });
    if (!row) throw new NotFoundException(`JRQ_CLAS ${id} no existe`);
    return row;
  }

  async create(dto: CreateJrqClasDto) {
    const exists = await this.repo.exist({ where: { CLAS: dto.CLAS } });
    if (exists) throw new ConflictException(`CLAS ${dto.CLAS} ya existe`);

    const entity = this.repo.create({
      CLAS: dto.CLAS,
      DCLAS: dto.DCLAS ?? null,
      SUBD: dto.SUBD ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateJrqClasDto) {
    const row = await this.findOne(id);

    const partial: Partial<JrqClasEntity> = {};
    if (dto.DCLAS !== undefined) partial.DCLAS = dto.DCLAS ?? null;
    if (dto.SUBD !== undefined) partial.SUBD = dto.SUBD ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar JRQ_CLAS ${id} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, CLAS: id };
  }
}
