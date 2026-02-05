import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PvTicketLogEntity } from './pvticketlog.entity';
import { CreatePvTicketLogDto } from './dto/create-pvticketlog.dto';
import { UpdatePvTicketLogDto } from './dto/update-pvticketlog.dto';

@Injectable()
export class PvTicketLogService {
  constructor(
    @InjectRepository(PvTicketLogEntity)
    private readonly repo: Repository<PvTicketLogEntity>,
  ) {}

  findAll(idfol?: string) {
    const idfolTrim = (idfol ?? '').trim();
    if (idfolTrim) {
      return this.repo.find({
        where: { IDFOL: idfolTrim },
        order: { UPDATED_AT: 'ASC' },
      });
    }
    return this.repo.find({ order: { ID: 'ASC' } });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { ID: id } });
    if (!row) throw new NotFoundException(`PV_TICKET_LOG ${id} no existe`);
    return row;
  }

  async create(dto: CreatePvTicketLogDto) {
    const exists = await this.repo.exist({ where: { ID: dto.ID } });
    if (exists) throw new ConflictException(`ID ${dto.ID} ya existe`);

    const entity = this.repo.create({
      ID: dto.ID,
      IDFOL: dto.IDFOL ?? null,
      UPC: dto.UPC ?? null,
      ART: dto.ART ?? null,
      DES: dto.DES ?? null,
      CTD: dto.CTD ?? null,
      PVTA: dto.PVTA ?? null,
      PVTAT: dto.PVTAT ?? null,
      ORD: dto.ORD ?? null,
      IDDEV: dto.IDDEV ?? null,
      CTDD: dto.CTDD ?? null,
      CTDDF: dto.CTDDF ?? null,
      UPDATED_AT: dto.UPDATED_AT ? new Date(dto.UPDATED_AT) : null,
    });

    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdatePvTicketLogDto) {
    const row = await this.findOne(id);

    const partial: Partial<PvTicketLogEntity> = {};
    if (dto.IDFOL !== undefined) partial.IDFOL = dto.IDFOL ?? null;
    if (dto.UPC !== undefined) partial.UPC = dto.UPC ?? null;
    if (dto.ART !== undefined) partial.ART = dto.ART ?? null;
    if (dto.DES !== undefined) partial.DES = dto.DES ?? null;
    if (dto.CTD !== undefined) partial.CTD = dto.CTD ?? null;
    if (dto.PVTA !== undefined) partial.PVTA = dto.PVTA ?? null;
    if (dto.PVTAT !== undefined) partial.PVTAT = dto.PVTAT ?? null;
    if (dto.ORD !== undefined) partial.ORD = dto.ORD ?? null;
    if (dto.IDDEV !== undefined) partial.IDDEV = dto.IDDEV ?? null;
    if (dto.CTDD !== undefined) partial.CTDD = dto.CTDD ?? null;
    if (dto.CTDDF !== undefined) partial.CTDDF = dto.CTDDF ?? null;
    if (dto.UPDATED_AT !== undefined) {
      partial.UPDATED_AT = dto.UPDATED_AT ? new Date(dto.UPDATED_AT) : null;
    }

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(`No se puede eliminar PV_TICKET_LOG ${id} porque está referenciado por otros registros.`);
      }
      throw err;
    }
    return { deleted: true, ID: id };
  }
}
