import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FrontMenuResponseDto } from './dto/front-menu.dto';
import { BackendPermsResponseDto } from './dto/backend-perms.dto';
import { RoleDatmodulosResponseDto } from './dto/role-datmodulos.dto';
import { GrupmodFrontModEntity } from './entities/grupmod-front-mod.entity';
import { RolGrupmodFrontEntity } from './entities/rol-grupmod-front.entity';
import { RolGrupModuloPermEntity } from './entities/rol-grup-modulo-perm.entity';
import { UsuarioEntity } from '../users/usuario.entity';
import { ModFrontEntity } from './entities/mod-front.entity';

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(GrupmodFrontModEntity)
    private readonly gfmRepo: Repository<GrupmodFrontModEntity>,
    @InjectRepository(RolGrupmodFrontEntity)
    private readonly rgfRepo: Repository<RolGrupmodFrontEntity>,
    @InjectRepository(RolGrupModuloPermEntity)
    private readonly rgmpRepo: Repository<RolGrupModuloPermEntity>,
    @InjectRepository(UsuarioEntity)
    private readonly userRepo: Repository<UsuarioEntity>,
    @InjectRepository(ModFrontEntity)
    private readonly modFrontRepo: Repository<ModFrontEntity>,
  ) {}

  async getFrontMenu(roleId: number): Promise<FrontMenuResponseDto> {
    const assigns = await this.rgfRepo.find({
      where: { IDROL: roleId, ACTIVO: true },
    });

    const accesoTotal = assigns.some((a) => a.IDGRUPMOD_FRONT === 0);

    const allowedGroupIds = accesoTotal
      ? null
      : assigns.map((a) => a.IDGRUPMOD_FRONT).filter((x) => x !== 0);

    const qb = this.gfmRepo
      .createQueryBuilder('gfm')
      .leftJoinAndSelect('gfm.GRUPO', 'grupo')
      .leftJoinAndSelect('gfm.MODULO', 'mod')
      .where('grupo.ACTIVO = 1')
      .andWhere('mod.ACTIVO = 1');

    if (allowedGroupIds && allowedGroupIds.length > 0) {
      qb.andWhere('gfm.IDGRUPMOD_FRONT IN (:...ids)', { ids: allowedGroupIds });
    }

    const rows = await qb.getMany();

    const map = new Map<number, { id: number; nombre: string; items: any[] }>();

    for (const r of rows) {
      const gid = r.IDGRUPMOD_FRONT;

      if (!map.has(gid)) {
        map.set(gid, { id: gid, nombre: r.GRUPO.NOMBRE, items: [] });
      }

      map.get(gid)!.items.push({
        id: r.MODULO.IDMOD_FRONT,
        codigo: r.MODULO.CODIGO,
        nombre: r.MODULO.NOMBRE,
        depto: r.MODULO.DEPTO ?? null,
        activo: !!r.MODULO.ACTIVO,
      });
    }

    const grupos = Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const g of grupos) g.items.sort((a, b) => a.nombre.localeCompare(b.nombre));

    return {
      roleId,
      accesoTotal,
      grupos,
    };
  }

  async getRoleDatmodulos(roleId: number): Promise<RoleDatmodulosResponseDto> {
    const assigns = await this.rgfRepo.find({
      where: { IDROL: roleId, ACTIVO: true },
    });

    const accesoTotal = assigns.some((a) => a.IDGRUPMOD_FRONT === 0);
    const allowedGroupIds = accesoTotal
      ? null
      : assigns.map((a) => a.IDGRUPMOD_FRONT).filter((x) => x !== 0);

    if (accesoTotal) {
      const rows = await this.modFrontRepo.find({
        where: { ACTIVO: true },
      });

      const modulos = rows
        .map((m) => ({
          codigo: m.CODIGO,
          nombre: m.NOMBRE,
          depto: m.DEPTO ?? null,
          activo: !!m.ACTIVO,
        }))
        .sort((a, b) => this.sortModules(a, b));

      return {
        roleId,
        accesoTotal,
        modulos,
      };
    }

    if (!allowedGroupIds || allowedGroupIds.length === 0) {
      return { roleId, accesoTotal, modulos: [] };
    }

    const rel = await this.gfmRepo
      .createQueryBuilder('gfm')
      .leftJoinAndSelect('gfm.MODULO', 'mod')
      .where('mod.ACTIVO = 1')
      .andWhere('gfm.IDGRUPMOD_FRONT IN (:...ids)', { ids: allowedGroupIds })
      .getMany();

    const byId = new Map<number, ModFrontEntity>();
    for (const r of rel) {
      if (r.MODULO) byId.set(r.MODULO.IDMOD_FRONT, r.MODULO);
    }

    const modulos = Array.from(byId.values())
      .map((m) => ({
        codigo: m.CODIGO,
        nombre: m.NOMBRE,
        depto: m.DEPTO ?? null,
        activo: !!m.ACTIVO,
      }))
      .sort((a, b) => this.sortModules(a, b));

    return {
      roleId,
      accesoTotal,
      modulos,
    };
  }

  async getBackendPerms(roleId: number): Promise<BackendPermsResponseDto> {
    const rows = await this.rgmpRepo.find({
      where: { IDROL: roleId, ACTIVO: true },
    });

    const accesoTotal = rows.some((x) => x.IDGRUP_MODULO === 0);

    return {
      roleId,
      accesoTotal,
      permisos: rows.map((r) => ({
        idGrupModulo: r.IDGRUP_MODULO,
        grupNombre: r.IDGRUP_MODULO === 0 ? 'ACCESO_TOTAL' : null,
        canRead: !!r.CAN_READ,
        canCreate: !!r.CAN_CREATE,
        canUpdate: !!r.CAN_UPDATE,
        canDelete: !!r.CAN_DELETE,
        accesoTotal: r.IDGRUP_MODULO === 0,
      })),
    };
  }

  async logFrontModuleCounts(roleId: number) {
    const activos = await this.modFrontRepo.count({ where: { ACTIVO: true } });
    const res = await this.getRoleDatmodulos(roleId);
    console.log(
      '[me] MOD_FRONT activos:',
      activos,
      'filtrados:',
      res.modulos.length,
      'roleId:',
      roleId,
    );
    return { roleId, activos, filtrados: res.modulos.length };
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({
      where: { IDUSUARIO: userId },
      relations: { ROL: true, DEPARTAMENTO: true, PUESTO: true, SUCURSAL: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return {
      IDUSUARIO: user.IDUSUARIO,
      USERNAME: user.USERNAME,
      MAIL: user.MAIL,
      ESTATUS: user.ESTATUS,
      NIVEL: user.NIVEL,
      IDROL: user.IDROL,
      ROL: user.ROL ? { id: user.ROL.IDROL, nombre: user.ROL.NOMBRE } : null,
      IDDEPTO: user.IDDEPTO,
      DEPARTAMENTO: user.DEPARTAMENTO
        ? { id: user.DEPARTAMENTO.IDDEPTO, nombre: user.DEPARTAMENTO.NOMBRE }
        : null,
      IDPUESTO: user.IDPUESTO,
      PUESTO: user.PUESTO ? { id: user.PUESTO.IDPUESTO, nombre: user.PUESTO.NOMBRE } : null,
      SUC: user.SUC,
      SUCURSAL: user.SUCURSAL ? { suc: user.SUCURSAL.SUC, desc: user.SUCURSAL.DESC } : null,
    };
  }

  private sortModules(
    a: { depto: string | null; nombre: string | null; codigo: string },
    b: { depto: string | null; nombre: string | null; codigo: string },
  ) {
    const deptoA = (a.depto ?? '').toUpperCase();
    const deptoB = (b.depto ?? '').toUpperCase();
    if (deptoA !== deptoB) return deptoA.localeCompare(deptoB);

    const nameA = (a.nombre ?? a.codigo ?? '').toUpperCase();
    const nameB = (b.nombre ?? b.codigo ?? '').toUpperCase();
    return nameA.localeCompare(nameB);
  }
}
