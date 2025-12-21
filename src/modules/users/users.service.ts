import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UsuarioEntity } from './usuario.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(UsuarioEntity) private readonly repo: Repository<UsuarioEntity>) {}

  findAll() {
    return this.repo.find({
      relations: { ROL: true, DEPARTAMENTO: true, PUESTO: true, SUCURSAL: true },
      order: { IDUSUARIO: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({
      where: { IDUSUARIO: id },
      relations: { ROL: true, DEPARTAMENTO: true, PUESTO: true, SUCURSAL: true },
    });
    if (!row) throw new NotFoundException(`USUARIO ${id} no existe`);
    return row;
  }

  async findByUsername(username: string) {
    return this.repo.findOne({ where: { USERNAME: username } });
  }

  async create(dto: CreateUserDto) {
    const existsUser = await this.repo.exist({ where: { USERNAME: dto.USERNAME } });
    if (existsUser) throw new ConflictException(`USERNAME ${dto.USERNAME} ya existe`);

    const existsMail = await this.repo.exist({ where: { MAIL: dto.MAIL } });
    if (existsMail) throw new ConflictException(`MAIL ${dto.MAIL} ya existe`);

    const hash = await bcrypt.hash(dto.PASSWORD, 10);

    const entity = this.repo.create({
      USERNAME: dto.USERNAME,
      PASSWORD_HASH: hash,
      NOMBRE: dto.NOMBRE ?? null,
      APELLIDOS: dto.APELLIDOS ?? null,
      MAIL: dto.MAIL,
      ESTATUS: dto.ESTATUS,
      NIVEL: dto.NIVEL,
      IDROL: dto.IDROL,
      IDDEPTO: dto.IDDEPTO ?? null,
      IDPUESTO: dto.IDPUESTO ?? null,
      SUC: dto.SUC ?? null,
    });

    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateUserDto) {
    const row = await this.findOne(id);

    // Si viene PASSWORD, rehace hash
    let PASSWORD_HASH = row.PASSWORD_HASH;
    if ((dto as any).PASSWORD) {
      PASSWORD_HASH = await bcrypt.hash((dto as any).PASSWORD, 10);
    }

    // No permitir cambiar USERNAME/MAIL a duplicados
    if (dto.USERNAME && dto.USERNAME !== row.USERNAME) {
      const exists = await this.repo.exist({ where: { USERNAME: dto.USERNAME } });
      if (exists) throw new ConflictException(`USERNAME ${dto.USERNAME} ya existe`);
    }
    if (dto.MAIL && dto.MAIL !== row.MAIL) {
      const exists = await this.repo.exist({ where: { MAIL: dto.MAIL } });
      if (exists) throw new ConflictException(`MAIL ${dto.MAIL} ya existe`);
    }

    const { PASSWORD, ...rest } = dto as any;

    const updated = this.repo.merge(row, {
      ...rest,
      PASSWORD_HASH,
    });

    return this.repo.save(updated);
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    await this.repo.remove(row);
    return { deleted: true, IDUSUARIO: id };
  }
}
