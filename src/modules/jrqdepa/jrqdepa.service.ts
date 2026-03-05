import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { JrqDepaEntity } from './jrqdepa.entity';
import { CreateJrqDepaDto } from './dto/create-jrqdepa.dto';
import { UpdateJrqDepaDto } from './dto/update-jrqdepa.dto';

@Injectable()
export class JrqDepaService {
  constructor(
    @InjectRepository(JrqDepaEntity)
    private readonly repo: Repository<JrqDepaEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { DEPA: 'ASC' } });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { DEPA: id } });
    if (!row) throw new NotFoundException(`JRQ_DEPA ${id} no existe`);
    return row;
  }

  async create(dto: CreateJrqDepaDto) {
    const exists = await this.repo.exist({ where: { DEPA: dto.DEPA } });
    if (exists) throw new ConflictException(`DEPA ${dto.DEPA} ya existe`);

    const entity = this.repo.create({
      DEPA: dto.DEPA,
      DDEPA: dto.DDEPA ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateJrqDepaDto) {
    const row = await this.findOne(id);

    const partial: Partial<JrqDepaEntity> = {};
    if (dto.DDEPA !== undefined) partial.DDEPA = dto.DDEPA ?? null;

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
          `No se puede eliminar JRQ_DEPA ${id} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, DEPA: id };
  }
}
