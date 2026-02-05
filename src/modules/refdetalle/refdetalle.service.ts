import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { RefDetalleEntity } from './refdetalle.entity';
import { CreateRefDetalleDto } from './dto/create-refdetalle.dto';
import { UpdateRefDetalleDto } from './dto/update-refdetalle.dto';

@Injectable()
export class RefDetalleService {
  constructor(
    @InjectRepository(RefDetalleEntity)
    private readonly repo: Repository<RefDetalleEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { IDREF: 'ASC' } });
  }

  async findOne(idref: string) {
    const row = await this.repo.findOne({ where: { IDREF: idref } });
    if (!row) throw new NotFoundException(`REF_DETALLE ${idref} no existe`);
    return row;
  }

  async create(dto: CreateRefDetalleDto) {
    const exists = await this.repo.exist({ where: { IDREF: dto.IDREF } });
    if (exists) throw new ConflictException(`IDREF ${dto.IDREF} ya existe`);

    const entity = this.repo.create({
      IDREF: dto.IDREF,
      SUC: dto.SUC ?? null,
      FCNR: dto.FCNR ? new Date(dto.FCNR) : null,
      FCND: dto.FCND ? new Date(dto.FCND) : null,
      OPV: dto.OPV ?? null,
      IDFOL: dto.IDFOL ?? null,
      IDC: dto.IDC ?? null,
      RFCEMISOR: dto.RFCEMISOR ?? null,
      TIPO: dto.TIPO ?? null,
      IMPT: dto.IMPT ?? null,
      ESTATUS: dto.ESTATUS ?? null,
    });

    return this.repo.save(entity);
  }

  async update(idref: string, dto: UpdateRefDetalleDto) {
    const row = await this.findOne(idref);

    const partial: Partial<RefDetalleEntity> = {};
    if (dto.SUC !== undefined) partial.SUC = dto.SUC ?? null;
    if (dto.FCNR !== undefined) partial.FCNR = dto.FCNR ? new Date(dto.FCNR) : null;
    if (dto.FCND !== undefined) partial.FCND = dto.FCND ? new Date(dto.FCND) : null;
    if (dto.OPV !== undefined) partial.OPV = dto.OPV ?? null;
    if (dto.IDFOL !== undefined) partial.IDFOL = dto.IDFOL ?? null;
    if (dto.IDC !== undefined) partial.IDC = dto.IDC ?? null;
    if (dto.RFCEMISOR !== undefined) partial.RFCEMISOR = dto.RFCEMISOR ?? null;
    if (dto.TIPO !== undefined) partial.TIPO = dto.TIPO ?? null;
    if (dto.IMPT !== undefined) partial.IMPT = dto.IMPT ?? null;
    if (dto.ESTATUS !== undefined) partial.ESTATUS = dto.ESTATUS ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(idref: string) {
    const row = await this.findOne(idref);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar REF_DETALLE ${idref} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, IDREF: idref };
  }
}
