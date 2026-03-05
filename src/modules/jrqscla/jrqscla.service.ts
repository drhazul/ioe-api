import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { JrqSclaEntity } from './jrqscla.entity';
import { CreateJrqSclaDto } from './dto/create-jrqscla.dto';
import { UpdateJrqSclaDto } from './dto/update-jrqscla.dto';

@Injectable()
export class JrqSclaService {
  constructor(
    @InjectRepository(JrqSclaEntity)
    private readonly repo: Repository<JrqSclaEntity>,
  ) {}

  findAll(filter?: { clas?: string }) {
    const parseNumber = (value?: string) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const normalized = trimmed.replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : undefined;
    };
    const where: any = {};
    const clas = parseNumber(filter?.clas);
    if (clas !== undefined) where.CLAS = clas;
    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { SCLA: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { SCLA: id } });
    if (!row) throw new NotFoundException(`JRQ_SCLA ${id} no existe`);
    return row;
  }

  async create(dto: CreateJrqSclaDto) {
    const exists = await this.repo.exist({ where: { SCLA: dto.SCLA } });
    if (exists) throw new ConflictException(`SCLA ${dto.SCLA} ya existe`);

    const entity = this.repo.create({
      SCLA: dto.SCLA,
      DSCLA: dto.DSCLA ?? null,
      CLAS: dto.CLAS ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateJrqSclaDto) {
    const row = await this.findOne(id);

    const partial: Partial<JrqSclaEntity> = {};
    if (dto.DSCLA !== undefined) partial.DSCLA = dto.DSCLA ?? null;
    if (dto.CLAS !== undefined) partial.CLAS = dto.CLAS ?? null;

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
          `No se puede eliminar JRQ_SCLA ${id} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, SCLA: id };
  }
}
