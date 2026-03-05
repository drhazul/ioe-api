import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsrModSucEntity } from './usr-mod-suc.entity';
import { CreateUsrModSucDto } from './dto/create-usr-mod-suc.dto';
import { UpdateUsrModSucDto } from './dto/update-usr-mod-suc.dto';

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
  }) {
    const where: any = {};
    const modulo = query?.modulo?.trim();
    const usuario = query?.usuario?.trim();
    const suc = query?.suc?.trim();
    const activo = query?.activo?.trim();

    if (modulo) where.MODULO = modulo;
    if (usuario) where.USUARIO = usuario;
    if (suc) where.SUC = suc;

    if (activo !== undefined && activo !== null && activo !== '') {
      const normalized = activo.toLowerCase();
      if (normalized === '1' || normalized === 'true') where.ACTIVO = true;
      if (normalized === '0' || normalized === 'false') where.ACTIVO = false;
    }

    return this.repo.find({
      where: Object.keys(where).length ? where : undefined,
      order: { MODULO: 'ASC', USUARIO: 'ASC', SUC: 'ASC' },
    });
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
