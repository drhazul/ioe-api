import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { CatCtasEntity } from './cat-ctas.entity';
import { CreateCatCtaDto } from './dto/create-cat-cta.dto';
import { UpdateCatCtaDto } from './dto/update-cat-cta.dto';
import { UsrModSucEntity } from '../usr-mod-suc/usr-mod-suc.entity';

type CatCtasUser = {
  roleId?: number;
  username?: string;
  suc?: string | null;
};

@Injectable()
export class CatCtasService {
  private static readonly CTRL_CTAS_MODULE_CODES = [
    'DAT_CONS_CTAS',
    'DAT_CTRL_CTAS',
    'DAT_CTRL_CUENTAS',
  ] as const;

  constructor(
    @InjectRepository(CatCtasEntity)
    private readonly repo: Repository<CatCtasEntity>,
    @InjectRepository(UsrModSucEntity)
    private readonly usrModSucRepo: Repository<UsrModSucEntity>,
  ) {}

  private isAdmin(user?: CatCtasUser | null) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private normalizeText(value?: string | null) {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private requireUserSuc(user?: CatCtasUser | null) {
    const suc = (user?.suc ?? '').trim();
    if (!suc) throw new ForbiddenException('Usuario sin sucursal asignada');
    return suc;
  }

  private async resolveAuthorizedSucs(user?: CatCtasUser | null) {
    if (this.isAdmin(user)) return [];

    const username = (user?.username ?? '').trim();
    if (!username) {
      throw new ForbiddenException('Usuario sin username');
    }

    const rows = await this.usrModSucRepo.find({
      select: { SUC: true },
      where: {
        USUARIO: username,
        ACTIVO: true,
        MODULO: In([...CatCtasService.CTRL_CTAS_MODULE_CODES]),
      },
      order: { SUC: 'ASC' },
    });

    const sucs = this.normalizeList(rows.map((row) => row.SUC));
    if (sucs.length) return sucs;

    // Compatibilidad legacy: si no hay asignaciones en USR_MOD_SUC, mantiene la SUC del usuario.
    return [this.requireUserSuc(user)];
  }

  private normalizeList(values?: string[] | null) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of values ?? []) {
      const value = (raw ?? '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  private normalizePagination(page?: string, limit?: string) {
    const pageNum = Number(page ?? 1);
    const limitNum = Number(limit ?? 50);
    const safePage = Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1;
    const safeLimit =
      Number.isFinite(limitNum) && limitNum > 0 ? Math.min(Math.floor(limitNum), 200) : 50;
    return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
  }

  async findAll(
    query?: { search?: string; suc?: string; page?: string; limit?: string },
    user?: CatCtasUser | null,
  ) {
    const search = this.normalizeText(query?.search);
    const suc = this.normalizeText(query?.suc);
    const { page, limit, skip } = this.normalizePagination(query?.page, query?.limit);
    const isAdmin = this.isAdmin(user);

    const qb = this.repo.createQueryBuilder('cat');

    if (search) {
      qb.andWhere('(cat.CTA LIKE :search OR cat.DCTA LIKE :search OR cat.RELACION LIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (isAdmin) {
      if (suc) {
        qb.andWhere('cat.SUC = :suc', { suc });
      }
    } else {
      const allowedSucs = await this.resolveAuthorizedSucs(user);
      if (suc) {
        if (!allowedSucs.includes(suc)) {
          throw new ForbiddenException(`Sucursal ${suc} no autorizada para el usuario`);
        }
        qb.andWhere('cat.SUC = :suc', { suc });
      } else {
        qb.andWhere('(cat.SUC IN (:...allowedSucs) OR cat.SUC IS NULL)', { allowedSucs });
      }
    }

    const [items, total] = await qb.orderBy('cat.CTA', 'ASC').skip(skip).take(limit).getManyAndCount();

    return { items, total, page, limit };
  }

  async findOne(cta: string, user?: CatCtasUser | null) {
    const key = this.normalizeText(cta);
    if (!key) throw new NotFoundException('CTA no especificada');

    const qb = this.repo.createQueryBuilder('cat').where('cat.CTA = :cta', { cta: key });
    if (!this.isAdmin(user)) {
      const allowedSucs = await this.resolveAuthorizedSucs(user);
      qb.andWhere('(cat.SUC IN (:...allowedSucs) OR cat.SUC IS NULL)', { allowedSucs });
    }

    const row = await qb.getOne();
    if (!row) throw new NotFoundException(`DAT_CAT_CTAS ${key} no existe`);
    return row;
  }

  async create(dto: CreateCatCtaDto, user?: CatCtasUser | null) {
    const cta = this.normalizeText(dto.CTA);
    if (!cta) throw new BadRequestException('CTA es requerida');

    const exists = await this.repo.exist({ where: { CTA: cta } });
    if (exists) throw new ConflictException(`CTA ${cta} ya existe`);

    const isAdmin = this.isAdmin(user);
    let suc = isAdmin ? this.normalizeText(dto.SUC) : null;

    if (!isAdmin) {
      const allowedSucs = await this.resolveAuthorizedSucs(user);
      const requestedSuc = this.normalizeText(dto.SUC);

      if (requestedSuc != null) {
        if (!allowedSucs.includes(requestedSuc)) {
          throw new ForbiddenException(`Sucursal ${requestedSuc} no autorizada para el usuario`);
        }
        suc = requestedSuc;
      } else if (allowedSucs.length === 1) {
        suc = allowedSucs[0];
      } else {
        throw new BadRequestException('SUC es requerida para usuarios con multiples sucursales autorizadas');
      }
    }

    const entity = this.repo.create({
      CTA: cta,
      DCTA: this.normalizeText(dto.DCTA),
      RELACION: this.normalizeText(dto.RELACION),
      SUC: suc,
    });

    return this.repo.save(entity);
  }

  async update(cta: string, dto: UpdateCatCtaDto, user?: CatCtasUser | null) {
    const row = await this.findOne(cta, user);
    const isAdmin = this.isAdmin(user);

    const partial: Partial<CatCtasEntity> = {};

    if (dto.DCTA !== undefined) {
      partial.DCTA = this.normalizeText(dto.DCTA);
    }
    if (dto.RELACION !== undefined) {
      partial.RELACION = this.normalizeText(dto.RELACION);
    }

    if (isAdmin) {
      if (dto.SUC !== undefined) {
        partial.SUC = this.normalizeText(dto.SUC);
      }
    } else {
      const allowedSucs = await this.resolveAuthorizedSucs(user);
      if (dto.SUC !== undefined) {
        const nextSuc = this.normalizeText(dto.SUC);
        if (!nextSuc) {
          throw new BadRequestException('SUC es requerida para actualizar');
        }
        if (!allowedSucs.includes(nextSuc)) {
          throw new ForbiddenException(`Sucursal ${nextSuc} no autorizada para el usuario`);
        }
        partial.SUC = nextSuc;
      }
    }

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(cta: string, user?: CatCtasUser | null) {
    const row = await this.findOne(cta, user);
    try {
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar la cuenta ${row.CTA} porque esta referenciada por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, CTA: row.CTA };
  }
}
