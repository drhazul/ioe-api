import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, QueryFailedError, Repository } from 'typeorm';
import { DatArtEntity } from './datart.entity';
import { CreateDatArtDto } from './dto/create-datart.dto';
import { UpdateDatArtDto } from './dto/update-datart.dto';

@Injectable()
export class DatArtService {
  constructor(
    @InjectRepository(DatArtEntity)
    private readonly repo: Repository<DatArtEntity>,
  ) {}

  findAll(query?: { suc?: string; art?: string; upc?: string; des?: string; tipo?: string }) {
    const where: any = {};
    if (query?.suc) where.SUC = Like(`%${query.suc}%`);
    if (query?.art) where.ART = Like(`%${query.art}%`);
    if (query?.upc) where.UPC = Like(`%${query.upc}%`);
    if (query?.des) where.DES = Like(`%${query.des}%`);
    if (query?.tipo) where.TIPO = Like(`%${query.tipo}%`);

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { SUC: 'ASC', ART: 'ASC', UPC: 'ASC' },
    });
  }

  async findOne(suc: string, art: string, upc: string) {
    const row = await this.repo.findOne({ where: { SUC: suc, ART: art, UPC: upc } });
    if (!row) throw new NotFoundException(`DAT_ART ${suc}-${art}-${upc} no existe`);
    return row;
  }

  async create(dto: CreateDatArtDto) {
    const exists = await this.repo.exist({
      where: { SUC: dto.SUC, ART: dto.ART, UPC: dto.UPC },
    });
    if (exists) {
      throw new ConflictException(`DAT_ART ${dto.SUC}-${dto.ART}-${dto.UPC} ya existe`);
    }

    const entity = this.repo.create({
      ...dto,
      TIPO: dto.TIPO ?? null,
      CLAVESAT: dto.CLAVESAT ?? null,
      UNIMEDSAT: dto.UNIMEDSAT ?? null,
      DES: dto.DES ?? null,
      STOCK: dto.STOCK ?? null,
      STOCK_MIN: dto.STOCK_MIN ?? null,
      ESTATUS: dto.ESTATUS ?? null,
      DIA_REABASTO: dto.DIA_REABASTO ?? null,
      PVTA: dto.PVTA ?? null,
      CTOP: dto.CTOP ?? null,
      PROV_1: dto.PROV_1 ?? null,
      CTO_PROV1: dto.CTO_PROV1 ?? null,
      PROV_2: dto.PROV_2 ?? null,
      CTO_PROV2: dto.CTO_PROV2 ?? null,
      PROV_3: dto.PROV_3 ?? null,
      CTO_PROV3: dto.CTO_PROV3 ?? null,
      UN_COMP: dto.UN_COMP ?? null,
      FACT_COMP: dto.FACT_COMP ?? null,
      UN_VTA: dto.UN_VTA ?? null,
      FACT_VTA: dto.FACT_VTA ?? null,
      BASE: dto.BASE ?? null,
      SPH: dto.SPH ?? null,
      CYL: dto.CYL ?? null,
      ADIC: dto.ADIC ?? null,
      DEPA: dto.DEPA ?? null,
      SUBD: dto.SUBD ?? null,
      CLAS: dto.CLAS ?? null,
      SCLA: dto.SCLA ?? null,
      SCLA2: dto.SCLA2 ?? null,
      UMUE: dto.UMUE ?? null,
      UTRA: dto.UTRA ?? null,
      UNIV: dto.UNIV ?? null,
      UFRE: dto.UFRE ?? null,
      BLOQ: dto.BLOQ ?? null,
      MARCA: dto.MARCA ?? null,
      MODELO: dto.MODELO ?? null,
      SELJA: dto.SELJA ?? null,
      SELOP: dto.SELOP ?? null,
      MODF: dto.MODF ?? null,
    });

    return this.repo.save(entity);
  }

  async update(suc: string, art: string, upc: string, dto: UpdateDatArtDto) {
    const row = await this.findOne(suc, art, upc);
    const { SUC, ART, UPC, ...rest } = dto as any;
    const updated = this.repo.merge(row, rest);
    return this.repo.save(updated);
  }

  async remove(suc: string, art: string, upc: string) {
    const row = await this.findOne(suc, art, upc);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar el articulo ${suc}-${art}-${upc} porque esta referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, SUC: suc, ART: art, UPC: upc };
  }
}
