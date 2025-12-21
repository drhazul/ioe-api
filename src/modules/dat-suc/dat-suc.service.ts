import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { DatSucEntity } from './dat-suc.entity';
import { CreateDatSucDto } from './dto/create-dat-suc.dto';
import { UpdateDatSucDto } from './dto/update-dat-suc.dto';

@Injectable()
export class DatSucService {
  constructor(
    @InjectRepository(DatSucEntity)
    private readonly repo: Repository<DatSucEntity>,
  ) {}

  async findAll(query?: { suc?: string; desc?: string }) {
    const where: any = {};
    if (query?.suc) where.SUC = Like(`%${query.suc}%`);
    if (query?.desc) where.DESC = Like(`%${query.desc}%`);

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { SUC: 'ASC' },
    });
  }

  async findOne(suc: string) {
    const row = await this.repo.findOne({ where: { SUC: suc } });
    if (!row) throw new NotFoundException(`DAT_SUC ${suc} no existe`);
    return row;
  }

  async create(dto: CreateDatSucDto) {
    const exists = await this.repo.exist({ where: { SUC: dto.SUC } });
    if (exists) throw new ConflictException(`SUC ${dto.SUC} ya existe`);

    const entity = this.repo.create({
      ...dto,
      IVA_INTEGRADO: dto.IVA_INTEGRADO ?? null,
    });

    return this.repo.save(entity);
  }

  async update(suc: string, dto: UpdateDatSucDto) {
    const row = await this.findOne(suc);

    // No permitir cambiar la PK
    const { SUC, ...rest } = dto as any;

    const updated = this.repo.merge(row, rest);
    return this.repo.save(updated);
  }

  async remove(suc: string) {
    const row = await this.findOne(suc);
    await this.repo.remove(row);
    return { deleted: true, SUC: suc };
  }
}
