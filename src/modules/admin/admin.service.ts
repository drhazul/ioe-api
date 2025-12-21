import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RolGrupmodFrontEntity } from '../me/entities/rol-grupmod-front.entity';
import { RolGrupModuloPermEntity } from '../me/entities/rol-grup-modulo-perm.entity';
import { GrupModuloEntity } from './entities/grup-modulo.entity';
import { SetFrontGroupsDto } from './dto/set-front-groups.dto';
import { SetBackendPermsDto } from './dto/set-backend-perms.dto';
import { ModuloEntity } from './entities/modulo.entity';
import { GrupmodModuloEntity } from './entities/grupmod-modulo.entity';
import { GrupmodFrontEntity } from '../me/entities/grupmod-front.entity';
import { ModFrontEntity } from '../me/entities/mod-front.entity';
import { GrupmodFrontModEntity } from '../me/entities/grupmod-front-mod.entity';


@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(ModuloEntity)
    private readonly modRepo: Repository<ModuloEntity>,
    @InjectRepository(GrupmodModuloEntity)
    private readonly gmmRepo: Repository<GrupmodModuloEntity>,

    @InjectRepository(GrupmodFrontEntity)
    private readonly gfRepo: Repository<GrupmodFrontEntity>,
    @InjectRepository(ModFrontEntity)
    private readonly mfRepo: Repository<ModFrontEntity>,
    @InjectRepository(GrupmodFrontModEntity)
    private readonly gfmRepo: Repository<GrupmodFrontModEntity>,

    @InjectRepository(RolGrupmodFrontEntity)
    private readonly rgfRepo: Repository<RolGrupmodFrontEntity>,
    @InjectRepository(RolGrupModuloPermEntity)
    private readonly rgmpRepo: Repository<RolGrupModuloPermEntity>,
    @InjectRepository(GrupModuloEntity)
    private readonly grupRepo: Repository<GrupModuloEntity>,
  ) {}

  // ---------- FRONT GROUPS ----------
  async setFrontGroups(roleId: number, dto: SetFrontGroupsDto) {
    const groupIds = Array.from(new Set(dto.groupIds.map(Number)));

    // Limpia asignaciones actuales del rol
    await this.rgfRepo.delete({ IDROL: roleId });

    // Inserta nuevas
    const rows = groupIds.map((gid) =>
      this.rgfRepo.create({
        IDROL: roleId,
        IDGRUPMOD_FRONT: gid,
        ACTIVO: true,
      }),
    );

    await this.rgfRepo.save(rows);

    return {
      roleId,
      groupIds,
      accesoTotal: groupIds.includes(0),
    };
  }

  async getFrontGroups(roleId: number) {
    const rows = await this.rgfRepo.find({ where: { IDROL: roleId, ACTIVO: true } });
    const groupIds = rows.map((r) => r.IDGRUPMOD_FRONT);
    return { roleId, groupIds, accesoTotal: groupIds.includes(0) };
  }

  // ---------- BACKEND PERMS ----------
  async setBackendPerms(roleId: number, dto: SetBackendPermsDto) {
    const perms = dto.perms.map((p) => ({
      idGrupModulo: Number(p.idGrupModulo),
      canRead: !!p.canRead,
      canCreate: !!p.canCreate,
      canUpdate: !!p.canUpdate,
      canDelete: !!p.canDelete,
    }));

    // Validación ligera: si no es 0, verificar que existe el grupo
    const idsNoCero = perms.map((p) => p.idGrupModulo).filter((x) => x !== 0);
    if (idsNoCero.length > 0) {
      const found = await this.grupRepo.find({ where: { IDGRUP_MODULO: In(idsNoCero) } });
      const foundSet = new Set(found.map((g) => g.IDGRUP_MODULO));
      const missing = idsNoCero.filter((id) => !foundSet.has(id));
      if (missing.length) {
        throw new NotFoundException(`No existen grupos backend: ${missing.join(', ')}`);
      }
    }

    // Limpia permisos actuales del rol
    await this.rgmpRepo.delete({ IDROL: roleId });

    // Inserta permisos nuevos
    const rows = perms.map((p) =>
      this.rgmpRepo.create({
        IDROL: roleId,
        IDGRUP_MODULO: p.idGrupModulo,
        CAN_READ: p.canRead,
        CAN_CREATE: p.canCreate,
        CAN_UPDATE: p.canUpdate,
        CAN_DELETE: p.canDelete,
        ACTIVO: true,
      }),
    );

    await this.rgmpRepo.save(rows);

    return {
      roleId,
      accesoTotal: perms.some((p) => p.idGrupModulo === 0),
      perms,
    };
  }

  async getBackendPerms(roleId: number) {
    const rows = await this.rgmpRepo.find({ where: { IDROL: roleId, ACTIVO: true } });
    return {
      roleId,
      accesoTotal: rows.some((r) => r.IDGRUP_MODULO === 0),
      perms: rows.map((r) => ({
        idGrupModulo: r.IDGRUP_MODULO,
        canRead: !!r.CAN_READ,
        canCreate: !!r.CAN_CREATE,
        canUpdate: !!r.CAN_UPDATE,
        canDelete: !!r.CAN_DELETE,
      })),
    };
  }
// --------- CATALOG BACKEND ----------
async getCatalogBackend() {
  const grupos = await this.grupRepo.find({ where: { ACTIVO: true } });
  const mods = await this.modRepo.find({ where: { ACTIVO: true } });
  const rel = await this.gmmRepo.find();

  const modsById = new Map(mods.map(m => [m.IDMODULO, m]));
  const map = new Map<number, { id: number; nombre: string; modulos: any[] }>();

  for (const g of grupos) {
    map.set(g.IDGRUP_MODULO, { id: g.IDGRUP_MODULO, nombre: g.NOMBRE, modulos: [] });
  }

  for (const r of rel) {
    const g = map.get(r.IDGRUP_MODULO);
    const m = modsById.get(r.IDMODULO);
    if (!g || !m) continue;
    g.modulos.push({ id: m.IDMODULO, codigo: m.CODIGO, nombre: m.NOMBRE });
  }

  const out = Array.from(map.values()).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  for (const g of out) g.modulos.sort((a,b)=>a.nombre.localeCompare(b.nombre));

  return { grupos: out };
}

// --------- CATALOG FRONT ----------
async getCatalogFront() {
  // QueryBuilder para traer grupo + modulo
  const rows = await this.gfmRepo
    .createQueryBuilder('gfm')
    .leftJoinAndSelect('gfm.GRUPO', 'grupo')
    .leftJoinAndSelect('gfm.MODULO', 'mod')
    .where('grupo.ACTIVO = 1')
    .andWhere('mod.ACTIVO = 1')
    .getMany();

  const map = new Map<number, { id: number; nombre: string; modulos: any[] }>();

  for (const r of rows) {
    const gid = r.IDGRUPMOD_FRONT;
    if (!map.has(gid)) {
      map.set(gid, { id: gid, nombre: r.GRUPO.NOMBRE, modulos: [] });
    }
    map.get(gid)!.modulos.push({
      id: r.MODULO.IDMOD_FRONT,
      codigo: r.MODULO.CODIGO,
      nombre: r.MODULO.NOMBRE,
    });
  }

  const grupos = Array.from(map.values()).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  for (const g of grupos) g.modulos.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  return { grupos };
}

}
