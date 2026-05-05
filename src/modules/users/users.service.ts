import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { UsuarioEntity } from './usuario.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UsuarioEntity)
    private readonly repo: Repository<UsuarioEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findAll() {
    return this.repo.find({
      relations: {
        ROL: true,
        DEPARTAMENTO: true,
        SUCURSAL: true,
      },
      order: { IDUSUARIO: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({
      where: { IDUSUARIO: id },
      relations: {
        ROL: true,
        DEPARTAMENTO: true,
        SUCURSAL: true,
      },
    });

    if (!row) throw new NotFoundException(`USUARIO ${id} no existe`);
    return row;
  }

  async findAuthById(id: number) {
    return this.repo.findOne({ where: { IDUSUARIO: id } });
  }

  async findByUsername(username: string) {
    return this.repo.findOne({ where: { USERNAME: username } });
  }

  async updatePassword(
    userId: number,
    passwordHash: string,
    forzarCambioPass: boolean,
  ) {
    await this.repo.update(
      { IDUSUARIO: userId },
      {
        PASSWORD_HASH: passwordHash,
        FORZAR_CAMBIO_PASS: forzarCambioPass,
      },
    );
  }

  async create(dto: CreateUserDto) {
    const existsUser = await this.repo.exist({
      where: { USERNAME: dto.USERNAME },
    });

    if (existsUser)
      throw new ConflictException(`USERNAME ${dto.USERNAME} ya existe`);

    const existsMail = await this.repo.exist({ where: { MAIL: dto.MAIL } });
    if (existsMail) throw new ConflictException(`MAIL ${dto.MAIL} ya existe`);

    const hasPassword = (dto.PASSWORD ?? '').trim().length > 0;
    const plainPassword = hasPassword
      ? dto.PASSWORD!.trim()
      : this.generateRandomSixDigitPassword();
    const hash = await bcrypt.hash(plainPassword, 10);

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
      SUC: dto.SUC ?? null,
      FORZAR_CAMBIO_PASS: dto.FORZAR_CAMBIO_PASS ?? true,
    });

    const saved = await this.repo.save(entity);
    await this.enqueueSyncCommandsForUser(saved.IDUSUARIO, {
      oldSuc: null,
      newSuc: saved.SUC ?? null,
      oldDepto: null,
      newDepto: saved.IDDEPTO ?? null,
      reason: 'CREATE_USER_SCOPE',
    });

    const created = await this.findOne(saved.IDUSUARIO);

    if (hasPassword) return created;

    return {
      ...created,
      PASSWORD_TEMPORAL: plainPassword,
    };
  }

  async update(id: number, dto: UpdateUserDto) {
    const row = await this.repo.findOne({ where: { IDUSUARIO: id } });
    if (!row) throw new NotFoundException(`USUARIO ${id} no existe`);

    const oldSuc = row.SUC ?? null;
    const oldDepto = row.IDDEPTO ?? null;

    const payload: Partial<UsuarioEntity> = {};
    const { PASSWORD, ...rest } = dto;

    if (PASSWORD && PASSWORD.trim().length > 0) {
      payload.PASSWORD_HASH = await bcrypt.hash(PASSWORD.trim(), 10);
      payload.FORZAR_CAMBIO_PASS =
        typeof rest.FORZAR_CAMBIO_PASS === 'boolean'
          ? rest.FORZAR_CAMBIO_PASS
          : true;
      delete rest.FORZAR_CAMBIO_PASS;
    }

    if (dto.USERNAME && dto.USERNAME !== row.USERNAME) {
      const exists = await this.repo.exist({
        where: { USERNAME: dto.USERNAME },
      });

      if (exists)
        throw new ConflictException(`USERNAME ${dto.USERNAME} ya existe`);
    }

    if (dto.MAIL && dto.MAIL !== row.MAIL) {
      const exists = await this.repo.exist({ where: { MAIL: dto.MAIL } });
      if (exists) throw new ConflictException(`MAIL ${dto.MAIL} ya existe`);
    }

    Object.assign(payload, rest);

    Object.keys(payload).forEach((key) => {
      if (payload[key as keyof typeof payload] === undefined) {
        delete payload[key as keyof typeof payload];
      }
    });

    if (Object.keys(payload).length === 0) {
      return this.findOne(id);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(UsuarioEntity).update({ IDUSUARIO: id }, payload);
    });

    const newSuc = payload.SUC !== undefined ? (payload.SUC ?? null) : oldSuc;
    const newDepto =
      payload.IDDEPTO !== undefined ? (payload.IDDEPTO ?? null) : oldDepto;

    await this.enqueueSyncCommandsForUser(id, {
      oldSuc,
      newSuc,
      oldDepto,
      newDepto,
      reason: 'UPDATE_USER_SCOPE',
    });

    return this.findOne(id);
  }

  async remove(id: number) {
    const row = await this.repo.findOne({ where: { IDUSUARIO: id } });
    if (!row) throw new NotFoundException(`USUARIO ${id} no existe`);

    try {
      await this.dataSource.transaction(async (manager) => {
        const username = row.USERNAME?.trim() ?? '';
        const userId = row.IDUSUARIO;
        await manager.query(`DELETE FROM dbo.USUARIO_TOKEN WHERE IDUSUARIO = @0`, [
          userId,
        ]);
        await manager.query(
          `DELETE FROM dbo.USR_GRUPMOD_FRONT WHERE IDUSUARIO = @0`,
          [userId],
        );
        if (username.length > 0) {
          await manager.query(
            `
            DELETE FROM dbo.USR_MOD_SUC
            WHERE UPPER(LTRIM(RTRIM(ISNULL(USUARIO, '')))) = UPPER(@0)
            `,
            [username],
          );
        }
        await manager.getRepository(UsuarioEntity).delete({ IDUSUARIO: userId });
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = Number((error as QueryFailedError & { driverError?: { number?: number } }).driverError?.number ?? 0);
        if (code === 547) {
          throw new ConflictException(
            `No se puede eliminar USUARIO ${id} porque tiene registros relacionados en otros modulos.`,
          );
        }
      }
      throw error;
    }

    return { deleted: true, IDUSUARIO: id };
  }

  private generateRandomSixDigitPassword(): string {
    const value = randomInt(100000, 1000000);
    return String(value);
  }

  private async enqueueSyncCommandsForUser(
    userId: number,
    scope: {
      oldSuc: string | null;
      newSuc: string | null;
      oldDepto: number | null;
      newDepto: number | null;
      reason: string;
    },
  ) {
    const oldSuc = this.normalizeUpper(scope.oldSuc);
    const newSuc = this.normalizeUpper(scope.newSuc);
    const scopeChanged = oldSuc !== newSuc || scope.oldDepto !== scope.newDepto;

    if (!scopeChanged || !newSuc) return;

    try {
      const existsRows = await this.dataSource.query(
        `
        SELECT CASE WHEN OBJECT_ID('dbo.COMANDOS_ADMS', 'U') IS NULL THEN 0 ELSE 1 END AS EXISTS_FLAG
        `,
      );
      const exists =
        Number(existsRows?.[0]?.EXISTS_FLAG ?? existsRows?.[0]?.exists_flag ?? 0) ===
        1;
      if (!exists) return;

      const deviceRows = await this.dataSource.query(
        `
        SELECT DISTINCT
          UPPER(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, '')))) AS DEVICE_ID
        FROM dbo.ATT_TIME_LOG tl
        WHERE UPPER(LTRIM(RTRIM(ISNULL(tl.SUC, '')))) = @0
          AND NULLIF(LTRIM(RTRIM(ISNULL(tl.DEVICE_ID, ''))), '') IS NOT NULL
        `,
        [newSuc],
      );

      for (const row of (deviceRows as Record<string, unknown>[]) ?? []) {
        const deviceId = this.normalizeUpper(
          String(row.DEVICE_ID ?? row.device_id ?? ''),
        );
        if (!deviceId) continue;

        await this.dataSource.query(
          `
          INSERT INTO dbo.COMANDOS_ADMS (
            dispositivo_id,
            comando,
            estado,
            fecha_creacion
          )
          VALUES (
            @0,
            @1,
            'PENDIENTE',
            GETDATE()
          );
          `,
          [
            deviceId,
            `SYNC_BIOMETRIA|USER=${userId}|SUC=${newSuc}|DEPTO=${scope.newDepto ?? 'NULL'}|REASON=${scope.reason}`,
          ],
        );
      }
    } catch (error) {
      console.error('WARN enqueueSyncCommandsForUser:', error);
    }
  }

  private normalizeUpper(value: string | null | undefined) {
    const text = String(value ?? '')
      .trim()
      .toUpperCase();
    return text.length ? text : null;
  }
}
