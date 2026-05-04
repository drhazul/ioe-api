import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Like, Repository } from 'typeorm';
import { RolEntity } from './rol.entity';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RolEntity)
    private readonly repo: Repository<RolEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(q?: {
    codigo?: string;
    nombre?: string;
    activo?: string;
    iddepto?: string;
  }) {
    const where: any = {};
    if (q?.codigo) where.CODIGO = Like(`%${q.codigo}%`);
    if (q?.nombre) where.NOMBRE = Like(`%${q.nombre}%`);
    if (q?.activo === 'true') where.ACTIVO = true;
    if (q?.activo === 'false') where.ACTIVO = false;
    if ((q?.iddepto ?? '').trim()) {
      const iddepto = Number(q?.iddepto);
      if (!Number.isFinite(iddepto) || iddepto <= 0) {
        throw new BadRequestException('iddepto invalido');
      }
      where.IDDEPTO = Math.trunc(iddepto);
    }

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { IDROL: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { IDROL: id } });
    if (!row) throw new NotFoundException(`ROL ${id} no existe`);
    return row;
  }

  async create(dto: CreateRolDto) {
    const exists = await this.repo.exist({ where: { CODIGO: dto.CODIGO } });
    if (exists) throw new ConflictException(`CODIGO ${dto.CODIGO} ya existe`);
    await this.ensureDepartamentoExists(dto.IDDEPTO);
    return this.repo.save(
      this.repo.create({ ...dto, ACTIVO: dto.ACTIVO ?? true }),
    );
  }

  async update(id: number, dto: UpdateRolDto) {
    const row = await this.findOne(id);

    // Evita choques por CODIGO único si lo cambian
    if (dto.CODIGO && dto.CODIGO !== row.CODIGO) {
      const exists = await this.repo.exist({ where: { CODIGO: dto.CODIGO } });
      if (exists) throw new ConflictException(`CODIGO ${dto.CODIGO} ya existe`);
    }
    if (dto.IDDEPTO !== undefined) {
      await this.ensureDepartamentoExists(dto.IDDEPTO);
    }

    const updated = this.repo.merge(row, dto);
    return this.repo.save(updated);
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    await this.repo.remove(row);
    return { deleted: true, IDROL: id };
  }

  private async ensureDepartamentoExists(iddepto?: number | null) {
    if (iddepto == null) return;
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 IDDEPTO
      FROM dbo.DEPARTAMENTO
      WHERE TRY_CONVERT(INT, IDDEPTO) = @0
      `,
      [iddepto],
    );
    if (!rows?.length) {
      throw new BadRequestException(
        `DEPARTAMENTO ${iddepto} no existe`,
      );
    }
  }
}
