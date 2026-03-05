import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PvCtrFolFormEntity } from './pvctrfolform.entity';
import { CreatePvCtrFolFormDto } from './dto/create-pvctrfolform.dto';
import { UpdatePvCtrFolFormDto } from './dto/update-pvctrfolform.dto';

@Injectable()
export class PvCtrFolFormService {
  constructor(
    @InjectRepository(PvCtrFolFormEntity)
    private readonly repo: Repository<PvCtrFolFormEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { IDF: 'ASC' } });
  }

  async findOne(idf: string) {
    const row = await this.repo.findOne({ where: { IDF: idf } });
    if (!row) throw new NotFoundException(`PV_CTR_FOL_FORM ${idf} no existe`);
    return row;
  }

  async create(dto: CreatePvCtrFolFormDto) {
    const exists = await this.repo.exist({ where: { IDF: dto.IDF } });
    if (exists) throw new ConflictException(`IDF ${dto.IDF} ya existe`);

    const entity = this.repo.create({
      IDF: dto.IDF,
      IDFOL: dto.IDFOL ?? null,
      FCN: dto.FCN ? new Date(dto.FCN) : null,
      FORM: dto.FORM ?? null,
      IMPA: dto.IMPA ?? null,
      IMPP: dto.IMPP ?? null,
      IMPC: dto.IMPC ?? null,
      IMPD: dto.IMPD ?? null,
      AUT: dto.AUT ?? null,
      ESTA: dto.ESTA ?? null,
      ESTAF: dto.ESTAF ?? null,
    });

    return this.repo.save(entity);
  }

  async update(idf: string, dto: UpdatePvCtrFolFormDto) {
    const row = await this.findOne(idf);

    const partial: Partial<PvCtrFolFormEntity> = {};
    if (dto.IDFOL !== undefined) partial.IDFOL = dto.IDFOL ?? null;
    if (dto.FCN !== undefined) partial.FCN = dto.FCN ? new Date(dto.FCN) : null;
    if (dto.FORM !== undefined) partial.FORM = dto.FORM ?? null;
    if (dto.IMPA !== undefined) partial.IMPA = dto.IMPA ?? null;
    if (dto.IMPP !== undefined) partial.IMPP = dto.IMPP ?? null;
    if (dto.IMPC !== undefined) partial.IMPC = dto.IMPC ?? null;
    if (dto.IMPD !== undefined) partial.IMPD = dto.IMPD ?? null;
    if (dto.AUT !== undefined) partial.AUT = dto.AUT ?? null;
    if (dto.ESTA !== undefined) partial.ESTA = dto.ESTA ?? null;
    if (dto.ESTAF !== undefined) partial.ESTAF = dto.ESTAF ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(idf: string) {
    const row = await this.findOne(idf);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar PV_CTR_FOL_FORM ${idf} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, IDF: idf };
  }
}
