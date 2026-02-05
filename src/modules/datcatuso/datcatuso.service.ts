import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DatCatUsoEntity } from './datcatuso.entity';
import { CreateDatCatUsoDto } from './dto/create-datcatuso.dto';
import { UpdateDatCatUsoDto } from './dto/update-datcatuso.dto';

@Injectable()
export class DatCatUsoService {
  constructor(
    @InjectRepository(DatCatUsoEntity)
    private readonly repo: Repository<DatCatUsoEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { USOCFDI: 'ASC' } });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { USOCFDI: id } });
    if (!row) throw new NotFoundException(`DAT_CAT_USO ${id} no existe`);
    return row;
  }

  async create(dto: CreateDatCatUsoDto) {
    const exists = await this.repo.exist({ where: { USOCFDI: dto.USOCFDI } });
    if (exists) throw new ConflictException(`UsoCFDI ${dto.USOCFDI} ya existe`);

    const entity = this.repo.create({
      USOCFDI: dto.USOCFDI,
      DESCRIPCION: dto.DESCRIPCION ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateDatCatUsoDto) {
    const row = await this.findOne(id);

    const partial: Partial<DatCatUsoEntity> = {};
    if (dto.DESCRIPCION !== undefined) partial.DESCRIPCION = dto.DESCRIPCION ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar DAT_CAT_USO ${id} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, UsoCFDI: id };
  }
}
