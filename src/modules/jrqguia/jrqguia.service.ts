import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { JrqGuiaEntity } from './jrqguia.entity';
import { CreateJrqGuiaDto } from './dto/create-jrqguia.dto';
import { UpdateJrqGuiaDto } from './dto/update-jrqguia.dto';

@Injectable()
export class JrqGuiaService {
  constructor(
    @InjectRepository(JrqGuiaEntity)
    private readonly repo: Repository<JrqGuiaEntity>,
  ) {}

  findAll(filter?: { scla2?: string }) {
    const parseNumber = (value?: string) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const normalized = trimmed.replace(',', '.');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : undefined;
    };
    const where: any = {};
    const scla2 = parseNumber(filter?.scla2);
    if (scla2 !== undefined) where.SCLA2 = scla2;
    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { GUIA: 'ASC' },
    });
  }

  async findOne(guia: string) {
    const row = await this.repo.findOne({ where: { GUIA: guia } });
    if (!row) throw new NotFoundException(`JRQ_GUIA ${guia} no existe`);
    return row;
  }

  async create(dto: CreateJrqGuiaDto) {
    const exists = await this.repo.exist({ where: { GUIA: dto.GUIA } });
    if (exists) throw new ConflictException(`GUIA ${dto.GUIA} ya existe`);

    const entity = this.repo.create({
      GUIA: dto.GUIA,
      DESCORT: dto.DESCORT ?? null,
      SCLA2: dto.SCLA2 ?? null,
    });

    return this.repo.save(entity);
  }

  async update(guia: string, dto: UpdateJrqGuiaDto) {
    const row = await this.findOne(guia);

    const partial: Partial<JrqGuiaEntity> = {};
    if (dto.DESCORT !== undefined) partial.DESCORT = dto.DESCORT ?? null;
    if (dto.SCLA2 !== undefined) partial.SCLA2 = dto.SCLA2 ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(guia: string) {
    const row = await this.findOne(guia);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar JRQ_GUIA ${guia} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, GUIA: guia };
  }
}
