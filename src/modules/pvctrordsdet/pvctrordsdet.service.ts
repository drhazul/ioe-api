import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PvCtrOrdsDetEntity } from './pvctrordsdet.entity';
import { CreatePvCtrOrdsDetDto } from './dto/create-pvctrordsdet.dto';
import { UpdatePvCtrOrdsDetDto } from './dto/update-pvctrordsdet.dto';

@Injectable()
export class PvCtrOrdsDetService {
  constructor(
    @InjectRepository(PvCtrOrdsDetEntity)
    private readonly repo: Repository<PvCtrOrdsDetEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { IORDP: 'ASC' } });
  }

  async findOne(iordp: string) {
    const row = await this.repo.findOne({ where: { IORDP: iordp } });
    if (!row) throw new NotFoundException(`PV_CTR_ORDS_DET ${iordp} no existe`);
    return row;
  }

  async create(dto: CreatePvCtrOrdsDetDto) {
    const exists = await this.repo.exist({ where: { IORDP: dto.IORDP } });
    if (exists) throw new ConflictException(`IORDP ${dto.IORDP} ya existe`);

    const entity = this.repo.create({
      IORDP: dto.IORDP,
      IORD: dto.IORD ?? null,
      ART: dto.ART ?? null,
      JOB: dto.JOB ?? null,
      ESF: dto.ESF ?? null,
      CIL: dto.CIL ?? null,
      EJE: dto.EJE ?? null,
    });

    return this.repo.save(entity);
  }

  async update(iordp: string, dto: UpdatePvCtrOrdsDetDto) {
    const row = await this.findOne(iordp);

    const partial: Partial<PvCtrOrdsDetEntity> = {};
    if (dto.IORD !== undefined) partial.IORD = dto.IORD ?? null;
    if (dto.ART !== undefined) partial.ART = dto.ART ?? null;
    if (dto.JOB !== undefined) partial.JOB = dto.JOB ?? null;
    if (dto.ESF !== undefined) partial.ESF = dto.ESF ?? null;
    if (dto.CIL !== undefined) partial.CIL = dto.CIL ?? null;
    if (dto.EJE !== undefined) partial.EJE = dto.EJE ?? null;

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(iordp: string) {
    const row = await this.findOne(iordp);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar PV_CTR_ORDS_DET ${iordp} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, IORDP: iordp };
  }
}
