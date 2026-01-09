import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { ModuloEntity } from '../admin/entities/modulo.entity';
import { GrupModuloEntity } from '../admin/entities/grup-modulo.entity';
import { GrupmodModuloEntity } from '../admin/entities/grupmod-modulo.entity';
import { RolGrupModuloPermEntity } from '../me/entities/rol-grup-modulo-perm.entity';
import { ModFrontEntity } from '../me/entities/mod-front.entity';
import { GrupmodFrontEntity } from '../me/entities/grupmod-front.entity';
import { GrupmodFrontModEntity } from '../me/entities/grupmod-front-mod.entity';
import { RolGrupmodFrontEntity } from '../me/entities/rol-grupmod-front.entity';
import { RolEntity } from '../roles/rol.entity';
import { CreateModuloDto } from './dto/create-modulo.dto';
import { UpdateModuloDto } from './dto/update-modulo.dto';
import { CreateGrupModuloDto } from './dto/create-grup-modulo.dto';
import { UpdateGrupModuloDto } from './dto/update-grup-modulo.dto';
import { AssignModulesToGroupDto } from './dto/assign-modules-to-group.dto';
import { AssignGroupToRolePermDto } from './dto/assign-group-to-role-perm.dto';
import { CreateModFrontDto } from './dto/create-mod-front.dto';
import { UpdateModFrontDto } from './dto/update-mod-front.dto';
import { CreateGrupmodFrontDto } from './dto/create-grupmod-front.dto';
import { UpdateGrupmodFrontDto } from './dto/update-grupmod-front.dto';
import { AssignFrontModulesToGroupDto } from './dto/assign-front-modules-to-group.dto';
import { AssignFrontGroupToRoleDto } from './dto/assign-front-group-to-role.dto';

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(ModuloEntity)
    private readonly modRepo: Repository<ModuloEntity>,
    @InjectRepository(GrupModuloEntity)
    private readonly grupRepo: Repository<GrupModuloEntity>,
    @InjectRepository(GrupmodModuloEntity)
    private readonly gmmRepo: Repository<GrupmodModuloEntity>,
    @InjectRepository(RolGrupModuloPermEntity)
    private readonly rgmpRepo: Repository<RolGrupModuloPermEntity>,
    @InjectRepository(ModFrontEntity)
    private readonly modFrontRepo: Repository<ModFrontEntity>,
    @InjectRepository(GrupmodFrontEntity)
    private readonly grupFrontRepo: Repository<GrupmodFrontEntity>,
    @InjectRepository(GrupmodFrontModEntity)
    private readonly gfmRepo: Repository<GrupmodFrontModEntity>,
    @InjectRepository(RolGrupmodFrontEntity)
    private readonly rgfRepo: Repository<RolGrupmodFrontEntity>,
    @InjectRepository(RolEntity)
    private readonly rolRepo: Repository<RolEntity>,
  ) {}

  private parseDate(value?: string) {
    return value ? new Date(value) : undefined;
  }

  private nowOr(value?: string) {
    return value ? new Date(value) : new Date();
  }

  // -------- MODULOS BACKEND --------
  listModulos(includeInactives = false) {
    return this.modRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
      order: { CODIGO: 'ASC' },
    });
  }

  async createModulo(dto: CreateModuloDto) {
    const exists = await this.modRepo.exist({ where: { CODIGO: dto.CODIGO } });
    if (exists) throw new ConflictException(`CODIGO ${dto.CODIGO} ya existe`);

    const entity = this.modRepo.create({
      CODIGO: dto.CODIGO,
      NOMBRE: dto.NOMBRE,
      ACTIVO: dto.ACTIVO ?? true,
      FCNR: this.nowOr(dto.FCNR),
    });
    return this.modRepo.save(entity);
  }

  async updateModulo(id: number, dto: UpdateModuloDto) {
    const row = await this.modRepo.findOne({ where: { IDMODULO: id } });
    if (!row) throw new NotFoundException(`MODULO ${id} no existe`);

    if (dto.CODIGO && dto.CODIGO !== row.CODIGO) {
      const exists = await this.modRepo.exist({ where: { CODIGO: dto.CODIGO } });
      if (exists) throw new ConflictException(`CODIGO ${dto.CODIGO} ya existe`);
    }

    const partial: Partial<ModuloEntity> = {
      ...dto,
    } as Partial<ModuloEntity>;

    if (dto.FCNR !== undefined) partial.FCNR = this.parseDate(dto.FCNR);

    const updated = this.modRepo.merge(row, partial);
    return this.modRepo.save(updated);
  }

  async deleteModulo(id: number) {
    const row = await this.modRepo.findOne({ where: { IDMODULO: id } });
    if (!row) throw new NotFoundException(`MODULO ${id} no existe`);

    try {
      await this.modRepo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar el módulo ${row.CODIGO} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, IDMODULO: id };
  }

  // -------- GRUPOS BACKEND --------
  listGruposModulo(includeInactives = false) {
    return this.grupRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
      order: { NOMBRE: 'ASC' },
    });
  }

  async createGrupoModulo(dto: CreateGrupModuloDto) {
    const entity = this.grupRepo.create({
      NOMBRE: dto.NOMBRE,
      ACTIVO: dto.ACTIVO ?? true,
      FCNR: this.nowOr(dto.FCNR),
    });
    return this.grupRepo.save(entity);
  }

  async updateGrupoModulo(id: number, dto: UpdateGrupModuloDto) {
    const row = await this.grupRepo.findOne({ where: { IDGRUP_MODULO: id } });
    if (!row) throw new NotFoundException(`GRUP_MODULO ${id} no existe`);

    const partial: Partial<GrupModuloEntity> = {
      ...dto,
    } as Partial<GrupModuloEntity>;

    if (dto.FCNR !== undefined) partial.FCNR = this.parseDate(dto.FCNR);

    const updated = this.grupRepo.merge(row, partial);
    return this.grupRepo.save(updated);
  }

  async deleteGrupoModulo(id: number) {
    const row = await this.grupRepo.findOne({ where: { IDGRUP_MODULO: id } });
    if (!row) throw new NotFoundException(`GRUP_MODULO ${id} no existe`);

    try {
      await this.grupRepo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar el grupo ${row.NOMBRE} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }

    return { deleted: true, IDGRUP_MODULO: id };
  }

  async getGrupoModulos(id: number) {
    const group = await this.grupRepo.findOne({ where: { IDGRUP_MODULO: id } });
    if (!group) throw new NotFoundException(`GRUP_MODULO ${id} no existe`);

    const rel = await this.gmmRepo.find({ where: { IDGRUP_MODULO: id } });
    const ids = rel.map((r) => r.IDMODULO);
    if (ids.length === 0) return [];

    const mods = await this.modRepo.find({ where: { IDMODULO: In(ids) } });
    const byId = new Map(mods.map((m) => [m.IDMODULO, m]));

    return ids
      .map((mid) => byId.get(mid))
      .filter((m): m is ModuloEntity => !!m)
      .map((m) => ({
        idModulo: m.IDMODULO,
        codigo: m.CODIGO,
        nombre: m.NOMBRE,
        activo: !!m.ACTIVO,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  async setGrupoModulos(id: number, dto: AssignModulesToGroupDto) {
    const group = await this.grupRepo.findOne({ where: { IDGRUP_MODULO: id } });
    if (!group) throw new NotFoundException(`GRUP_MODULO ${id} no existe`);

    const ids = Array.from(new Set((dto.idModulos ?? []).map(Number)));

    if (ids.length > 0) {
      const mods = await this.modRepo.find({ where: { IDMODULO: In(ids) } });
      const found = new Set(mods.map((m) => m.IDMODULO));
      const missing = ids.filter((mid) => !found.has(mid));
      if (missing.length) {
        throw new NotFoundException(`No existen módulos: ${missing.join(', ')}`);
      }
    }

    await this.gmmRepo.manager.transaction(async (manager) => {
      await manager.delete(GrupmodModuloEntity, { IDGRUP_MODULO: id });
      if (ids.length === 0) return;
      const rows = ids.map((mid) =>
        manager.create(GrupmodModuloEntity, { IDGRUP_MODULO: id, IDMODULO: mid }),
      );
      await manager.save(GrupmodModuloEntity, rows);
    });

    return { idGrupModulo: id, idModulos: ids };
  }

  async deleteGrupoModuloRel(id: number, idModulo: number) {
    await this.gmmRepo.delete({ IDGRUP_MODULO: id, IDMODULO: idModulo });
    return { deleted: true, IDGRUP_MODULO: id, IDMODULO: idModulo };
  }

  // -------- ROLES --------
  listRoles(includeInactives = false) {
    return this.rolRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
      order: { NOMBRE: 'ASC' },
    });
  }

  // -------- PERMISOS BACKEND --------
  async getBackendPerms(roleId: number, includeInactives = false) {
    const grupos = await this.grupRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
      order: { NOMBRE: 'ASC' },
    });

    const modulos = await this.modRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
    });

    const rel = grupos.length
      ? await this.gmmRepo.find({
          where: { IDGRUP_MODULO: In(grupos.map((g) => g.IDGRUP_MODULO)) },
        })
      : [];

    const modsById = new Map(modulos.map((m) => [m.IDMODULO, m]));
    const modsByGroup = new Map<number, ModuloEntity[]>();

    for (const g of grupos) modsByGroup.set(g.IDGRUP_MODULO, []);

    for (const r of rel) {
      const mod = modsById.get(r.IDMODULO);
      const list = modsByGroup.get(r.IDGRUP_MODULO);
      if (!mod || !list) continue;
      list.push(mod);
    }

    const perms = await this.rgmpRepo.find({ where: { IDROL: roleId } });
    const permByGroup = new Map(perms.map((p) => [p.IDGRUP_MODULO, p]));

    const items = grupos.map((g) => {
      const perm = permByGroup.get(g.IDGRUP_MODULO);
      const modList = (modsByGroup.get(g.IDGRUP_MODULO) ?? [])
        .map((m) => ({ idModulo: m.IDMODULO, codigo: m.CODIGO, nombre: m.NOMBRE }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      return {
        idGrupModulo: g.IDGRUP_MODULO,
        grupoNombre: g.NOMBRE,
        canRead: perm ? !!perm.CAN_READ : false,
        canCreate: perm ? !!perm.CAN_CREATE : false,
        canUpdate: perm ? !!perm.CAN_UPDATE : false,
        canDelete: perm ? !!perm.CAN_DELETE : false,
        activo: perm ? !!perm.ACTIVO : false,
        modulos: modList,
      };
    });

    const totalPerm = permByGroup.get(0);
    items.unshift({
      idGrupModulo: 0,
      grupoNombre: 'ACCESO_TOTAL',
      canRead: totalPerm ? !!totalPerm.CAN_READ : false,
      canCreate: totalPerm ? !!totalPerm.CAN_CREATE : false,
      canUpdate: totalPerm ? !!totalPerm.CAN_UPDATE : false,
      canDelete: totalPerm ? !!totalPerm.CAN_DELETE : false,
      activo: totalPerm ? !!totalPerm.ACTIVO : false,
      modulos: [],
    });

    return items;
  }

  async setBackendPerm(roleId: number, dto: AssignGroupToRolePermDto) {
    const groupId = Number(dto.idGrupModulo);
    if (groupId !== 0) {
      const group = await this.grupRepo.findOne({ where: { IDGRUP_MODULO: groupId } });
      if (!group) throw new NotFoundException(`GRUP_MODULO ${groupId} no existe`);
    }

    const payload: Partial<RolGrupModuloPermEntity> = {
      IDROL: roleId,
      IDGRUP_MODULO: groupId,
      CAN_READ: dto.canRead ?? false,
      CAN_CREATE: dto.canCreate ?? false,
      CAN_UPDATE: dto.canUpdate ?? false,
      CAN_DELETE: dto.canDelete ?? false,
      ACTIVO: dto.activo ?? true,
      FCNR: new Date(),
    };

    const existing = await this.rgmpRepo.findOne({
      where: { IDROL: roleId, IDGRUP_MODULO: groupId },
    });

    if (existing) {
      const updated = this.rgmpRepo.merge(existing, payload);
      return this.rgmpRepo.save(updated);
    }

    return this.rgmpRepo.save(this.rgmpRepo.create(payload));
  }

  // -------- MODULOS FRONT --------
  listModFront(includeInactives = false) {
    return this.modFrontRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
      order: { CODIGO: 'ASC' },
    });
  }

  async createModFront(dto: CreateModFrontDto) {
    const exists = await this.modFrontRepo.exist({ where: { CODIGO: dto.CODIGO } });
    if (exists) throw new ConflictException(`CODIGO ${dto.CODIGO} ya existe`);

    const entity = this.modFrontRepo.create({
      CODIGO: dto.CODIGO,
      NOMBRE: dto.NOMBRE,
      DEPTO: dto.DEPTO ?? null,
      ACTIVO: dto.ACTIVO ?? true,
      FCNR: this.nowOr(dto.FCNR),
    });
    return this.modFrontRepo.save(entity);
  }

  async updateModFront(id: number, dto: UpdateModFrontDto) {
    const row = await this.modFrontRepo.findOne({ where: { IDMOD_FRONT: id } });
    if (!row) throw new NotFoundException(`MOD_FRONT ${id} no existe`);

    if (dto.CODIGO && dto.CODIGO !== row.CODIGO) {
      const exists = await this.modFrontRepo.exist({ where: { CODIGO: dto.CODIGO } });
      if (exists) throw new ConflictException(`CODIGO ${dto.CODIGO} ya existe`);
    }

    const partial: Partial<ModFrontEntity> = {
      ...dto,
    } as Partial<ModFrontEntity>;

    if (dto.DEPTO !== undefined) partial.DEPTO = dto.DEPTO ?? null;

    if (dto.FCNR !== undefined) partial.FCNR = this.parseDate(dto.FCNR);

    const updated = this.modFrontRepo.merge(row, partial);
    return this.modFrontRepo.save(updated);
  }

  async deleteModFront(id: number) {
    const row = await this.modFrontRepo.findOne({ where: { IDMOD_FRONT: id } });
    if (!row) throw new NotFoundException(`MOD_FRONT ${id} no existe`);

    try {
      await this.modFrontRepo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar el módulo ${row.CODIGO} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }

    return { deleted: true, IDMOD_FRONT: id };
  }

  // -------- GRUPOS FRONT --------
  listGruposFront(includeInactives = false) {
    return this.grupFrontRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
      order: { NOMBRE: 'ASC' },
    });
  }

  async createGrupoFront(dto: CreateGrupmodFrontDto) {
    const entity = this.grupFrontRepo.create({
      NOMBRE: dto.NOMBRE,
      ACTIVO: dto.ACTIVO ?? true,
      FCNR: this.nowOr(dto.FCNR),
    });
    return this.grupFrontRepo.save(entity);
  }

  async updateGrupoFront(id: number, dto: UpdateGrupmodFrontDto) {
    const row = await this.grupFrontRepo.findOne({ where: { IDGRUPMOD_FRONT: id } });
    if (!row) throw new NotFoundException(`GRUPMOD_FRONT ${id} no existe`);

    const partial: Partial<GrupmodFrontEntity> = {
      ...dto,
    } as Partial<GrupmodFrontEntity>;

    if (dto.FCNR !== undefined) partial.FCNR = this.parseDate(dto.FCNR);

    const updated = this.grupFrontRepo.merge(row, partial);
    return this.grupFrontRepo.save(updated);
  }

  async deleteGrupoFront(id: number) {
    const row = await this.grupFrontRepo.findOne({ where: { IDGRUPMOD_FRONT: id } });
    if (!row) throw new NotFoundException(`GRUPMOD_FRONT ${id} no existe`);

    try {
      await this.grupFrontRepo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar el grupo ${row.NOMBRE} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }

    return { deleted: true, IDGRUPMOD_FRONT: id };
  }

  async getGrupoFrontMods(id: number) {
    const group = await this.grupFrontRepo.findOne({ where: { IDGRUPMOD_FRONT: id } });
    if (!group) throw new NotFoundException(`GRUPMOD_FRONT ${id} no existe`);

    const rel = await this.gfmRepo.find({ where: { IDGRUPMOD_FRONT: id } });
    const ids = rel.map((r) => r.IDMOD_FRONT);
    if (ids.length === 0) return [];

    const mods = await this.modFrontRepo.find({ where: { IDMOD_FRONT: In(ids) } });
    const byId = new Map(mods.map((m) => [m.IDMOD_FRONT, m]));

    return ids
      .map((mid) => byId.get(mid))
      .filter((m): m is ModFrontEntity => !!m)
      .map((m) => ({
        idModFront: m.IDMOD_FRONT,
        codigo: m.CODIGO,
        nombre: m.NOMBRE,
        depto: m.DEPTO ?? null,
        activo: !!m.ACTIVO,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  async setGrupoFrontMods(id: number, dto: AssignFrontModulesToGroupDto) {
    const group = await this.grupFrontRepo.findOne({ where: { IDGRUPMOD_FRONT: id } });
    if (!group) throw new NotFoundException(`GRUPMOD_FRONT ${id} no existe`);

    const ids = Array.from(new Set((dto.idModFront ?? []).map(Number)));

    if (ids.length > 0) {
      const mods = await this.modFrontRepo.find({ where: { IDMOD_FRONT: In(ids) } });
      const found = new Set(mods.map((m) => m.IDMOD_FRONT));
      const missing = ids.filter((mid) => !found.has(mid));
      if (missing.length) {
        throw new NotFoundException(`No existen módulos front: ${missing.join(', ')}`);
      }
    }

    await this.gfmRepo.manager.transaction(async (manager) => {
      await manager.delete(GrupmodFrontModEntity, { IDGRUPMOD_FRONT: id });
      if (ids.length === 0) return;
      const rows = ids.map((mid) =>
        manager.create(GrupmodFrontModEntity, { IDGRUPMOD_FRONT: id, IDMOD_FRONT: mid }),
      );
      await manager.save(GrupmodFrontModEntity, rows);
    });

    return { idGrupmodFront: id, idModFront: ids };
  }

  // -------- ENROLAMIENTOS FRONT --------
  async getFrontEnrollments(roleId: number, includeInactives = false) {
    const grupos = await this.grupFrontRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
      order: { NOMBRE: 'ASC' },
    });

    const modulos = await this.modFrontRepo.find({
      where: includeInactives ? undefined : { ACTIVO: true },
    });

    const rel = grupos.length
      ? await this.gfmRepo.find({
          where: { IDGRUPMOD_FRONT: In(grupos.map((g) => g.IDGRUPMOD_FRONT)) },
        })
      : [];

    const modsById = new Map(modulos.map((m) => [m.IDMOD_FRONT, m]));
    const modsByGroup = new Map<number, ModFrontEntity[]>();

    for (const g of grupos) modsByGroup.set(g.IDGRUPMOD_FRONT, []);

    for (const r of rel) {
      const mod = modsById.get(r.IDMOD_FRONT);
      const list = modsByGroup.get(r.IDGRUPMOD_FRONT);
      if (!mod || !list) continue;
      list.push(mod);
    }

    const enrolls = await this.rgfRepo.find({ where: { IDROL: roleId } });
    const enrollByGroup = new Map(enrolls.map((e) => [e.IDGRUPMOD_FRONT, e]));

    const items = grupos.map((g) => {
      const enr = enrollByGroup.get(g.IDGRUPMOD_FRONT);
      const modList = (modsByGroup.get(g.IDGRUPMOD_FRONT) ?? [])
        .map((m) => ({
          idModFront: m.IDMOD_FRONT,
          codigo: m.CODIGO,
          nombre: m.NOMBRE,
          depto: m.DEPTO ?? null,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      return {
        idGrupmodFront: g.IDGRUPMOD_FRONT,
        grupoNombre: g.NOMBRE,
        activo: enr ? !!enr.ACTIVO : false,
        mods: modList,
      };
    });

    const totalEnroll = enrollByGroup.get(0);
    items.unshift({
      idGrupmodFront: 0,
      grupoNombre: 'ACCESO_TOTAL',
      activo: totalEnroll ? !!totalEnroll.ACTIVO : false,
      mods: [],
    });

    return items;
  }

  async setFrontEnrollment(roleId: number, dto: AssignFrontGroupToRoleDto) {
    const groupId = Number(dto.idGrupmodFront);
    if (groupId !== 0) {
      const group = await this.grupFrontRepo.findOne({ where: { IDGRUPMOD_FRONT: groupId } });
      if (!group) throw new NotFoundException(`GRUPMOD_FRONT ${groupId} no existe`);
    }

    const payload: Partial<RolGrupmodFrontEntity> = {
      IDROL: roleId,
      IDGRUPMOD_FRONT: groupId,
      ACTIVO: dto.activo ?? true,
      FCNR: new Date(),
    };

    const existing = await this.rgfRepo.findOne({
      where: { IDROL: roleId, IDGRUPMOD_FRONT: groupId },
    });

    if (existing) {
      const updated = this.rgfRepo.merge(existing, payload);
      return this.rgfRepo.save(updated);
    }

    return this.rgfRepo.save(this.rgfRepo.create(payload));
  }

  // -------- FRONT MENU --------
  async getFrontMenu(roleId: number) {
    if (roleId === 1) {
      const rows = await this.modFrontRepo.find({ where: { ACTIVO: true } });
      return rows
        .map((m) => ({ codigo: m.CODIGO, nombre: m.NOMBRE, depto: m.DEPTO ?? null }))
        .sort((a, b) => {
          const deptoA = (a.depto ?? '').trim();
          const deptoB = (b.depto ?? '').trim();
          const deptoCmp = deptoA.localeCompare(deptoB);
          return deptoCmp !== 0 ? deptoCmp : a.nombre.localeCompare(b.nombre);
        });
    }

    const assigns = await this.rgfRepo.find({
      where: { IDROL: roleId, ACTIVO: true },
    });

    const accesoTotal = assigns.some((a) => a.IDGRUPMOD_FRONT === 0);
    if (accesoTotal) {
      const rows = await this.modFrontRepo.find({
        where: { ACTIVO: true },
      });

      return rows
        .map((m) => ({
          codigo: m.CODIGO,
          nombre: m.NOMBRE,
          depto: m.DEPTO ?? null,
        }))
        .sort((a, b) => {
          const deptoA = (a.depto ?? '').trim();
          const deptoB = (b.depto ?? '').trim();
          const deptoCmp = deptoA.localeCompare(deptoB);
          return deptoCmp !== 0 ? deptoCmp : a.nombre.localeCompare(b.nombre);
        });
    }

    const groupIds = assigns.map((a) => a.IDGRUPMOD_FRONT).filter((x) => x !== 0);
    if (!groupIds.length) return [];

    const rel = await this.gfmRepo
      .createQueryBuilder('gfm')
      .leftJoinAndSelect('gfm.GRUPO', 'grupo')
      .leftJoinAndSelect('gfm.MODULO', 'mod')
      .where('grupo.ACTIVO = 1')
      .andWhere('mod.ACTIVO = 1')
      .andWhere('gfm.IDGRUPMOD_FRONT IN (:...ids)', { ids: groupIds })
      .getMany();

    const byId = new Map<number, ModFrontEntity>();
    for (const r of rel) {
      if (r.MODULO) byId.set(r.MODULO.IDMOD_FRONT, r.MODULO);
    }

    return Array.from(byId.values())
      .map((m) => ({
        codigo: m.CODIGO,
        nombre: m.NOMBRE,
        depto: m.DEPTO ?? null,
      }))
      .sort((a, b) => {
        const deptoA = (a.depto ?? '').trim();
        const deptoB = (b.depto ?? '').trim();
        const deptoCmp = deptoA.localeCompare(deptoB);
        return deptoCmp !== 0 ? deptoCmp : a.nombre.localeCompare(b.nombre);
      });
  }
}
