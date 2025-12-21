import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { DepartamentoEntity } from './departamento.entity';
import { CreateDepartamentoDto } from './dto/create-departamento.dto';
import { UpdateDepartamentoDto } from './dto/update-departamento.dto';

@Injectable()
export class DeptosService {
  constructor(
    @InjectRepository(DepartamentoEntity)
    private readonly repo: Repository<DepartamentoEntity>,
  ) {}

  findAll(q?: { nombre?: string; activo?: string }) {
    const where: any = {};
    if (q?.nombre) where.NOMBRE = Like(`%${q.nombre}%`);
    if (q?.activo === 'true') where.ACTIVO = true;
    if (q?.activo === 'false') where.ACTIVO = false;

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { IDDEPTO: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { IDDEPTO: id } });
    if (!row) throw new NotFoundException(`DEPARTAMENTO ${id} no existe`);
    return row;
  }

  async create(dto: CreateDepartamentoDto) {
    const exists = await this.repo.exist({ where: { NOMBRE: dto.NOMBRE } });
    if (exists) throw new ConflictException(`NOMBRE ${dto.NOMBRE} ya existe`);
    return this.repo.save(this.repo.create({ ...dto, ACTIVO: dto.ACTIVO ?? true }));
  }

  async update(id: number, dto: UpdateDepartamentoDto) {
    const row = await this.findOne(id);

    if (dto.NOMBRE && dto.NOMBRE !== row.NOMBRE) {
      const exists = await this.repo.exist({ where: { NOMBRE: dto.NOMBRE } });
      if (exists) throw new ConflictException(`NOMBRE ${dto.NOMBRE} ya existe`);
    }

    return this.repo.save(this.repo.merge(row, dto));
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    await this.repo.remove(row);
    return { deleted: true, IDDEPTO: id };
  }
}
