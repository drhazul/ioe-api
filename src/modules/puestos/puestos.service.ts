import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { PuestoEntity } from './puesto.entity';
import { CreatePuestoDto } from './dto/create-puesto.dto';
import { UpdatePuestoDto } from './dto/update-puesto.dto';
import { DeptosService } from '../deptos/deptos.service';

@Injectable()
export class PuestosService {
  constructor(
    @InjectRepository(PuestoEntity) private readonly repo: Repository<PuestoEntity>,
    private readonly deptosService: DeptosService,
  ) {}

  async findAll(q?: { iddepto?: string; nombre?: string; activo?: string }) {
    const where: any = {};
    if (q?.iddepto) where.IDDEPTO = Number(q.iddepto);
    if (q?.nombre) where.NOMBRE = Like(`%${q.nombre}%`);
    if (q?.activo === 'true') where.ACTIVO = true;
    if (q?.activo === 'false') where.ACTIVO = false;

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      relations: { DEPARTAMENTO: true },
      order: { IDDEPTO: 'ASC', IDPUESTO: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({
      where: { IDPUESTO: id },
      relations: { DEPARTAMENTO: true },
    });
    if (!row) throw new NotFoundException(`PUESTO ${id} no existe`);
    return row;
  }

  async create(dto: CreatePuestoDto) {
    // valida que exista el depto
    await this.deptosService.findOne(dto.IDDEPTO);

    // respeta el UNIQUE(IDDEPTO, NOMBRE)
    const exists = await this.repo.exist({ where: { IDDEPTO: dto.IDDEPTO, NOMBRE: dto.NOMBRE } });
    if (exists) throw new ConflictException(`Puesto "${dto.NOMBRE}" ya existe en ese departamento`);

    return this.repo.save(this.repo.create({ ...dto, ACTIVO: dto.ACTIVO ?? true }));
  }

  async update(id: number, dto: UpdatePuestoDto) {
    const row = await this.findOne(id);

    const newDepto = dto.IDDEPTO ?? row.IDDEPTO;
    const newNombre = dto.NOMBRE ?? row.NOMBRE;

    if (dto.IDDEPTO) await this.deptosService.findOne(dto.IDDEPTO);

    // validar unique si cambia depto o nombre
    if (newDepto !== row.IDDEPTO || newNombre !== row.NOMBRE) {
      const exists = await this.repo.exist({ where: { IDDEPTO: newDepto, NOMBRE: newNombre } });
      if (exists) throw new ConflictException(`Puesto "${newNombre}" ya existe en ese departamento`);
    }

    return this.repo.save(this.repo.merge(row, dto));
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    await this.repo.remove(row);
    return { deleted: true, IDPUESTO: id };
  }
}
