import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { JrqScla2Entity } from './jrqscla2.entity';
import { CreateJrqScla2Dto } from './dto/create-jrqscla2.dto';
import { UpdateJrqScla2Dto } from './dto/update-jrqscla2.dto';

@Injectable()
export class JrqScla2Service {
  constructor(
    @InjectRepository(JrqScla2Entity)
    private readonly repo: Repository<JrqScla2Entity>,
  ) {}

  findAll(filter?: { scla?: string }) {
    const parseNumber = (value?: string) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const normalized = trimmed.replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : undefined;
    };
    const where: any = {};
    const scla = parseNumber(filter?.scla);
    if (scla !== undefined) where.SCLA = scla;
    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { SCLA2: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { SCLA2: id } });
    if (!row) throw new NotFoundException(`JRQ_SCLA2 ${id} no existe`);
    return row;
  }

  async create(dto: CreateJrqScla2Dto) {
    const exists = await this.repo.exist({ where: { SCLA2: dto.SCLA2 } });
    if (exists) throw new ConflictException(`SCLA2 ${dto.SCLA2} ya existe`);

    const entity = this.repo.create({
      SCLA2: dto.SCLA2,
      DSCLA2: dto.DSCLA2 ?? null,
      SCLA: dto.SCLA ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateJrqScla2Dto) {
    const row = await this.findOne(id);

    const partial: Partial<JrqScla2Entity> = {};
    if (dto.DSCLA2 !== undefined) partial.DSCLA2 = dto.DSCLA2 ?? null;
    if (dto.SCLA !== undefined) partial.SCLA = dto.SCLA ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar JRQ_SCLA2 ${id} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, SCLA2: id };
  }
}
