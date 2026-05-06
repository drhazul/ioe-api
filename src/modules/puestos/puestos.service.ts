import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { CreatePuestoDto } from './dto/create-puesto.dto';
import { UpdatePuestoDto } from './dto/update-puesto.dto';
import { DeptosService } from '../deptos/deptos.service';
import { RolEntity } from '../roles/rol.entity';

@Injectable()
export class PuestosService {
  constructor(
    @InjectRepository(RolEntity)
    private readonly rolesRepo: Repository<RolEntity>,
    private readonly deptosService: DeptosService,
  ) {}

  async findAll(q?: { iddepto?: string; nombre?: string; activo?: string }) {
    const where: Record<string, unknown> = {};
    if (q?.iddepto) where.IDDEPTO = Number(q.iddepto);
    if (q?.nombre) where.NOMBRE = Like(`%${q.nombre}%`);
    if (q?.activo === 'true') where.ACTIVO = true;
    if (q?.activo === 'false') where.ACTIVO = false;

    const roles = await this.rolesRepo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { IDDEPTO: 'ASC', IDROL: 'ASC' },
    });

    const withDepto = roles.filter((row) => row.IDDEPTO != null);
    const deptoMap = await this.loadDeptoMap();

    return withDepto.map((row) =>
      this.toLegacyPuesto(row, deptoMap.get(row.IDDEPTO ?? -1) ?? null),
    );
  }

  async findOne(id: number) {
    const row = await this.rolesRepo.findOne({ where: { IDROL: id } });
    if (!row || row.IDDEPTO == null) {
      throw new NotFoundException(`PUESTO ${id} no existe`);
    }

    const depto = await this.deptosService.findOne(row.IDDEPTO);
    return this.toLegacyPuesto(row, depto.NOMBRE ?? null);
  }

  async create(dto: CreatePuestoDto) {
    await this.deptosService.findOne(dto.IDDEPTO);

    const exists = await this.rolesRepo.exist({
      where: { IDDEPTO: dto.IDDEPTO, NOMBRE: dto.NOMBRE },
    });
    if (exists) {
      throw new ConflictException(
        `Puesto "${dto.NOMBRE}" ya existe en ese departamento`,
      );
    }

    const role = this.rolesRepo.create({
      CODIGO: await this.buildUniqueRoleCode(dto.NOMBRE),
      NOMBRE: dto.NOMBRE,
      IDDEPTO: dto.IDDEPTO,
      DESCRIPCION: null,
      ACTIVO: dto.ACTIVO ?? true,
    });

    const saved = await this.rolesRepo.save(role);
    const depto = await this.deptosService.findOne(saved.IDDEPTO ?? dto.IDDEPTO);
    return this.toLegacyPuesto(saved, depto.NOMBRE ?? null);
  }

  async update(id: number, dto: UpdatePuestoDto) {
    const row = await this.rolesRepo.findOne({ where: { IDROL: id } });
    if (!row || row.IDDEPTO == null) {
      throw new NotFoundException(`PUESTO ${id} no existe`);
    }

    const newDepto = dto.IDDEPTO ?? row.IDDEPTO;
    const newNombre = dto.NOMBRE ?? row.NOMBRE;

    if (dto.IDDEPTO != null) {
      await this.deptosService.findOne(dto.IDDEPTO);
    }

    if (newDepto !== row.IDDEPTO || newNombre !== row.NOMBRE) {
      const exists = await this.rolesRepo.exist({
        where: { IDDEPTO: newDepto, NOMBRE: newNombre },
      });
      if (exists) {
        throw new ConflictException(
          `Puesto "${newNombre}" ya existe en ese departamento`,
        );
      }
    }

    const updated = this.rolesRepo.merge(row, {
      IDDEPTO: newDepto,
      NOMBRE: newNombre,
      ACTIVO: dto.ACTIVO ?? row.ACTIVO,
    });

    const saved = await this.rolesRepo.save(updated);
    const depto = await this.deptosService.findOne(saved.IDDEPTO ?? newDepto);
    return this.toLegacyPuesto(saved, depto.NOMBRE ?? null);
  }

  async remove(id: number) {
    const row = await this.rolesRepo.findOne({ where: { IDROL: id } });
    if (!row || row.IDDEPTO == null) {
      throw new NotFoundException(`PUESTO ${id} no existe`);
    }

    await this.rolesRepo.remove(row);
    return { deleted: true, IDPUESTO: id };
  }

  private async loadDeptoMap() {
    const rows = await this.deptosService.findAll();
    const map = new Map<number, string>();
    for (const row of rows) {
      map.set(row.IDDEPTO, row.NOMBRE ?? '');
    }
    return map;
  }

  private toLegacyPuesto(row: RolEntity, deptoNombre: string | null) {
    return {
      IDPUESTO: row.IDROL,
      IDROL: row.IDROL,
      CODIGO: row.CODIGO,
      IDDEPTO: row.IDDEPTO,
      NOMBRE: row.NOMBRE,
      DESCRIPCION: row.DESCRIPCION,
      ACTIVO: row.ACTIVO,
      FCNR: row.FCNR,
      DEPARTAMENTO:
        row.IDDEPTO == null
          ? null
          : {
              IDDEPTO: row.IDDEPTO,
              NOMBRE: deptoNombre,
            },
    };
  }

  private async buildUniqueRoleCode(nombre: string) {
    const base = this.normalizeCode(nombre);
    let candidate = base;
    let attempt = 1;

    while (await this.rolesRepo.exist({ where: { CODIGO: candidate } })) {
      attempt += 1;
      candidate = `${base}_${attempt}`;
      if (candidate.length > 50) {
        const suffix = `_${attempt}`;
        candidate = `${base.slice(0, 50 - suffix.length)}${suffix}`;
      }
    }

    return candidate;
  }

  private normalizeCode(text: string) {
    const cleaned = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const fallback = cleaned.length ? cleaned : 'ROL';
    return fallback.slice(0, 50);
  }
}
