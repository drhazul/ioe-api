import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, QueryFailedError, Repository } from 'typeorm';
import { ModFrontEntity } from '../me/entities/mod-front.entity';
import { CreateDatmoduloDto } from './dto/create-datmodulo.dto';
import { UpdateDatmoduloDto } from './dto/update-datmodulo.dto';

@Injectable()
export class DatmodulosService {
  constructor(
    @InjectRepository(ModFrontEntity)
    private readonly repo: Repository<ModFrontEntity>,
  ) {}

  findAll(q?: { codigo?: string; depto?: string; nombre?: string }) {
    const where: any = {};
    if (q?.codigo) where.CODIGO = Like(`%${q.codigo}%`);
    if (q?.depto) where.DEPTO = Like(`%${q.depto}%`);
    if (q?.nombre) where.NOMBRE = Like(`%${q.nombre}%`);

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { CODIGO: 'ASC' },
    });
  }

  async findOne(codigo: string) {
    const row = await this.repo.findOne({ where: { CODIGO: codigo } });
    if (!row) throw new NotFoundException(`MOD_FRONT ${codigo} no existe`);
    return row;
  }

  async create(dto: CreateDatmoduloDto) {
    const exists = await this.repo.exist({ where: { CODIGO: dto.CODIGO } });
    if (exists) throw new ConflictException(`CODIGO ${dto.CODIGO} ya existe`);

    const entity = this.repo.create({
      ...dto,
      NOMBRE: dto.NOMBRE,
      DEPTO: dto.DEPTO ?? null,
      ACTIVO: dto.ACTIVO ?? true,
      FCNR: dto.FCNR ? new Date(dto.FCNR) : new Date(),
    });

    return this.repo.save(entity);
  }

  async update(codigo: string, dto: UpdateDatmoduloDto) {
    const row = await this.findOne(codigo);

    const { CODIGO, ...rest } = dto as any;
    const partial: Partial<ModFrontEntity> = {
      ...rest,
    };

    if (dto.FCNR !== undefined) {
      partial.FCNR = dto.FCNR ? new Date(dto.FCNR) : undefined;
    }

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(codigo: string) {
    const row = await this.findOne(codigo);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar el módulo ${codigo} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, CODIGO: codigo };
  }
}
