import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DatCatRegEntity } from './datcatreg.entity';
import { CreateDatCatRegDto } from './dto/create-datcatreg.dto';
import { UpdateDatCatRegDto } from './dto/update-datcatreg.dto';

@Injectable()
export class DatCatRegService {
  constructor(
    @InjectRepository(DatCatRegEntity)
    private readonly repo: Repository<DatCatRegEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { C_REGIMENFISCAL: 'ASC' } });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { C_REGIMENFISCAL: id } });
    if (!row) throw new NotFoundException(`DAT_CAT_REG ${id} no existe`);
    return row;
  }

  async create(dto: CreateDatCatRegDto) {
    const exists = await this.repo.exist({
      where: { C_REGIMENFISCAL: dto.C_REGIMENFISCAL },
    });
    if (exists)
      throw new ConflictException(
        `C_RegimenFiscal ${dto.C_REGIMENFISCAL} ya existe`,
      );

    const entity = this.repo.create({
      C_REGIMENFISCAL: dto.C_REGIMENFISCAL,
      DESCRIPCION: dto.DESCRIPCION ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateDatCatRegDto) {
    const row = await this.findOne(id);

    const partial: Partial<DatCatRegEntity> = {};
    if (dto.DESCRIPCION !== undefined)
      partial.DESCRIPCION = dto.DESCRIPCION ?? null;

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
          `No se puede eliminar DAT_CAT_REG ${id} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, C_RegimenFiscal: id };
  }
}
