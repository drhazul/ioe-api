import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Datmb51Entity } from './datmb51.entity';
import { CreateDatmb51Dto } from './dto/create-datmb51.dto';
import { UpdateDatmb51Dto } from './dto/update-datmb51.dto';

@Injectable()
export class Datmb51Service {
  constructor(
    @InjectRepository(Datmb51Entity)
    private readonly repo: Repository<Datmb51Entity>,
  ) {}

  findAll(q?: { idpd?: string; user?: string; art?: string; almacen?: string; suc?: string }) {
    const where: any = {};
    if (q?.idpd) where.IDPD = Like(`%${q.idpd}%`);
    if (q?.user) where.USER = Like(`%${q.user}%`);
    if (q?.art) where.ART = Like(`%${q.art}%`);
    if (q?.almacen) where.ALMACEN = Like(`%${q.almacen}%`);
    if (q?.suc) where.SUC = Like(`%${q.suc}%`);

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { IDPD: 'ASC' },
    });
  }

  async findOne(idpd: string) {
    const row = await this.repo.findOne({ where: { IDPD: idpd } });
    if (!row) throw new NotFoundException(`DAT_MB51 ${idpd} no existe`);
    return row;
  }

  async create(dto: CreateDatmb51Dto) {
    const exists = await this.repo.exist({ where: { IDPD: dto.IDPD } });
    if (exists) throw new ConflictException(`IDPD ${dto.IDPD} ya existe`);

    const entity = this.repo.create({
      ...dto,
      USER: dto.USER ?? null,
      CLSM: dto.CLSM ?? null,
      DOCP: dto.DOCP ?? null,
      ART: dto.ART ?? null,
      CTDA: dto.CTDA ?? null,
      CTOT: dto.CTOT ?? null,
      FCND: dto.FCND ? new Date(dto.FCND) : null,
      FCNC: dto.FCNC ? new Date(dto.FCNC) : null,
      TXT: dto.TXT ?? null,
      ALMACEN: dto.ALMACEN ?? null,
      VTAESP: dto.VTAESP ?? null,
      SUC: dto.SUC ?? null,
    });

    return this.repo.save(entity);
  }

  async update(idpd: string, dto: UpdateDatmb51Dto) {
    const row = await this.findOne(idpd);

    const { IDPD, ...rest } = dto as any;
    const partial: Partial<Datmb51Entity> = {
      ...rest,
    };

    if (dto.FCND !== undefined) {
      partial.FCND = dto.FCND ? new Date(dto.FCND) : null;
    }

    if (dto.FCNC !== undefined) {
      partial.FCNC = dto.FCNC ? new Date(dto.FCNC) : null;
    }

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(idpd: string) {
    const row = await this.findOne(idpd);
    await this.repo.remove(row);
    return { deleted: true, IDPD: idpd };
  }
}
