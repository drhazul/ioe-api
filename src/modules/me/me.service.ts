import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FrontMenuResponseDto } from './dto/front-menu.dto';
import { BackendPermsResponseDto } from './dto/backend-perms.dto';
import { GrupmodFrontModEntity } from './entities/grupmod-front-mod.entity';
import { RolGrupmodFrontEntity } from './entities/rol-grupmod-front.entity';
import { RolGrupModuloPermEntity } from './entities/rol-grup-modulo-perm.entity';

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(GrupmodFrontModEntity)
    private readonly gfmRepo: Repository<GrupmodFrontModEntity>,
    @InjectRepository(RolGrupmodFrontEntity)
    private readonly rgfRepo: Repository<RolGrupmodFrontEntity>,
    @InjectRepository(RolGrupModuloPermEntity)
    private readonly rgmpRepo: Repository<RolGrupModuloPermEntity>,
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
}
