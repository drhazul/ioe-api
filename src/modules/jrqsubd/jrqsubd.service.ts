import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { JrqSubdEntity } from './jrqsubd.entity';
import { CreateJrqSubdDto } from './dto/create-jrqsubd.dto';
import { UpdateJrqSubdDto } from './dto/update-jrqsubd.dto';

@Injectable()
export class JrqSubdService {
  constructor(
    @InjectRepository(JrqSubdEntity)
    private readonly repo: Repository<JrqSubdEntity>,
  ) {}

  findAll(filter?: { depa?: string }) {
    const parseNumber = (value?: string) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const normalized = trimmed.replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : undefined;
    };
    const where: any = {};
    const depa = parseNumber(filter?.depa);
    if (depa !== undefined) where.DEPA = depa;
    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { SUBD: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { SUBD: id } });
    if (!row) throw new NotFoundException(`JRQ_SUBD ${id} no existe`);
    return row;
  }

  async create(dto: CreateJrqSubdDto) {
    const exists = await this.repo.exist({ where: { SUBD: dto.SUBD } });
    if (exists) throw new ConflictException(`SUBD ${dto.SUBD} ya existe`);

    const entity = this.repo.create({
      SUBD: dto.SUBD,
      DSUBD: dto.DSUBD ?? null,
      DEPA: dto.DEPA ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateJrqSubdDto) {
    const row = await this.findOne(id);

    const partial: Partial<JrqSubdEntity> = {};
    if (dto.DSUBD !== undefined) partial.DSUBD = dto.DSUBD ?? null;
    if (dto.DEPA !== undefined) partial.DEPA = dto.DEPA ?? null;

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
          `No se puede eliminar JRQ_SUBD ${id} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, SUBD: id };
  }
}
