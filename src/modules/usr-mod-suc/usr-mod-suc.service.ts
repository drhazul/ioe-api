import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { UsrModSucEntity } from './usr-mod-suc.entity';
import { CreateUsrModSucDto } from './dto/create-usr-mod-suc.dto';
import { UpdateUsrModSucDto } from './dto/update-usr-mod-suc.dto';
import { UsuarioEntity } from '../users/usuario.entity';
import { ModFrontEntity } from '../me/entities/mod-front.entity';
import { DepartamentoEntity } from '../deptos/departamento.entity';

@Injectable()
export class UsrModSucService {
  constructor(
    @InjectRepository(UsrModSucEntity)
    private readonly repo: Repository<UsrModSucEntity>,
  ) {}

  async findAll(query?: {
    modulo?: string;
    usuario?: string;
    suc?: string;
    activo?: string;
    sucUsuario?: string;
    depto?: string;
  }) {
    const modulo = query?.modulo?.trim();
    const usuario = query?.usuario?.trim();
    const suc = query?.suc?.trim();
    const activo = query?.activo?.trim();
    const sucUsuario = query?.sucUsuario?.trim();
    const depto = query?.depto?.trim();

    const qb = this.repo
      .createQueryBuilder('ums')
      .leftJoin(
        UsuarioEntity,
        'u',
        "UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, '')))) = UPPER(LTRIM(RTRIM(ISNULL(ums.USUARIO, ''))))",
      )
      .leftJoin(DepartamentoEntity, 'd', 'd.IDDEPTO = u.IDDEPTO')
      .leftJoin(
        ModFrontEntity,
        'mf',
        "UPPER(LTRIM(RTRIM(ISNULL(mf.CODIGO, '')))) = UPPER(LTRIM(RTRIM(ISNULL(ums.MODULO, ''))))",
      )
      .orderBy('ums.MODULO', 'ASC')
      .addOrderBy('ums.USUARIO', 'ASC')
      .addOrderBy('ums.SUC', 'ASC');

    if (modulo) {
      qb.andWhere(
        "UPPER(LTRIM(RTRIM(ISNULL(ums.MODULO, '')))) = UPPER(LTRIM(RTRIM(:modulo)))",
        { modulo },
      );
    }
    if (usuario) {
      qb.andWhere(
        "UPPER(LTRIM(RTRIM(ISNULL(ums.USUARIO, '')))) = UPPER(LTRIM(RTRIM(:usuario)))",
        { usuario },
      );
    }
    if (suc) {
      qb.andWhere(
        "UPPER(LTRIM(RTRIM(ISNULL(ums.SUC, '')))) = UPPER(LTRIM(RTRIM(:suc)))",
        { suc },
      );
    }

    if (activo !== undefined && activo !== null && activo !== '') {
      const normalized = activo.toLowerCase();
      if (normalized === '1' || normalized === 'true') {
        qb.andWhere('ums.ACTIVO = :activoTrue', { activoTrue: true });
      }
      if (normalized === '0' || normalized === 'false') {
        qb.andWhere('ums.ACTIVO = :activoFalse', { activoFalse: false });
      }
    }

    if (sucUsuario) {
      qb.andWhere(
        "UPPER(LTRIM(RTRIM(ISNULL(u.SUC, '')))) = UPPER(LTRIM(RTRIM(:sucUsuario)))",
        { sucUsuario },
      );
    }

    if (depto) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where(
              "UPPER(LTRIM(RTRIM(ISNULL(d.NOMBRE, '')))) = UPPER(LTRIM(RTRIM(:depto)))",
              { depto },
            )
            .orWhere(
              "UPPER(LTRIM(RTRIM(ISNULL(mf.DEPTO, '')))) = UPPER(LTRIM(RTRIM(:depto)))",
              { depto },
            );
        }),
      );
    }

    return qb.getMany();
  }

  async findOne(modulo: string, usuario: string, suc: string) {
    const row = await this.repo.findOne({
      where: { MODULO: modulo, USUARIO: usuario, SUC: suc },
    });
    if (!row)
      throw new NotFoundException(
        `USR_MOD_SUC ${modulo}-${usuario}-${suc} no existe`,
      );
    return row;
  }

  async create(dto: CreateUsrModSucDto) {
    const exists = await this.repo.exist({
      where: { MODULO: dto.MODULO, USUARIO: dto.USUARIO, SUC: dto.SUC },
    });
    if (exists) {
      throw new ConflictException(
        `USR_MOD_SUC ${dto.MODULO}-${dto.USUARIO}-${dto.SUC} ya existe`,
      );
    }

    const entity = this.repo.create({
      MODULO: dto.MODULO,
      USUARIO: dto.USUARIO,
      SUC: dto.SUC,
      ACTIVO: dto.ACTIVO ?? true,
    });

    return this.repo.save(entity);
  }

  async update(
    modulo: string,
    usuario: string,
    suc: string,
    dto: UpdateUsrModSucDto,
  ) {
    const row = await this.findOne(modulo, usuario, suc);
    const updated = this.repo.merge(row, {
      ACTIVO: dto.ACTIVO ?? row.ACTIVO,
    });
    return this.repo.save(updated);
  }

  async remove(modulo: string, usuario: string, suc: string) {
    const row = await this.findOne(modulo, usuario, suc);
    await this.repo.remove(row);
    return { deleted: true, MODULO: modulo, USUARIO: usuario, SUC: suc };
  }
}
