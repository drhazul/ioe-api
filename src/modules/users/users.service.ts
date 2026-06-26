import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
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

  async nextCajaUsername() {
    const rows = await this.dataSource.query(
      `
      SELECT MAX(TRY_CONVERT(INT, IDOPV)) AS MAX_IDOPV
      FROM dbo.PV_OPV
      WHERE TRY_CONVERT(INT, IDOPV) BETWEEN 5000 AND 5999
      `,
    );
    const maxIdopv = Number(rows?.[0]?.MAX_IDOPV ?? 0);
    let next =
      Number.isFinite(maxIdopv) && maxIdopv >= 5000 ? maxIdopv + 1 : 5000;

    while (await this.repo.exist({ where: { USERNAME: String(next) } })) {
      next += 1;
    }

    return {
      username: String(next),
      nextIdopv: next,
      maxIdopv: Number.isFinite(maxIdopv) ? maxIdopv : null,
      base: 5000,
      rangeEnd: 5999,
    };
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
    const username = this.normalizeUsername(dto.USERNAME);
    const mail = await this.resolveMail(username, dto.MAIL, dto.IDEMPRESA);
    const existsUser = await this.repo.exist({
      where: { USERNAME: username },
    });

    if (existsUser)
      throw new ConflictException(`USERNAME ${username} ya existe`);

    const existsMail = await this.repo.exist({ where: { MAIL: mail } });
    if (existsMail) throw new ConflictException(`MAIL ${mail} ya existe`);

    const hasPassword = (dto.PASSWORD ?? '').trim().length > 0;
    const plainPassword = hasPassword
      ? dto.PASSWORD!.trim()
      : this.generateRandomSixDigitPassword();
    const hash = await bcrypt.hash(plainPassword, 10);

    const entity = this.repo.create({
      USERNAME: username,
      PASSWORD_HASH: hash,
      NOMBRE: dto.NOMBRE ?? null,
      APELLIDOS: dto.APELLIDOS ?? null,
      MAIL: mail,
      ESTATUS: dto.ESTATUS,
      NIVEL: dto.NIVEL,
      IDROL: dto.IDROL,
      IDDEPTO: dto.IDDEPTO ?? null,
      SUC: dto.SUC ?? null,
      FORZAR_CAMBIO_PASS: dto.FORZAR_CAMBIO_PASS ?? true,
    });

    const saved = await this.repo.save(entity);
    await this.upsertPvOpvForCajaUser(saved, this.sha1Hex(plainPassword));
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
    const { PASSWORD, IDEMPRESA, MAIL, USERNAME, ...rest } = dto;
    const nextUsername =
      USERNAME !== undefined ? this.normalizeUsername(USERNAME) : row.USERNAME;

    if (PASSWORD && PASSWORD.trim().length > 0) {
      payload.PASSWORD_HASH = await bcrypt.hash(PASSWORD.trim(), 10);
      payload.FORZAR_CAMBIO_PASS =
        typeof rest.FORZAR_CAMBIO_PASS === 'boolean'
          ? rest.FORZAR_CAMBIO_PASS
          : true;
      delete rest.FORZAR_CAMBIO_PASS;
    }

    if (USERNAME !== undefined && nextUsername !== row.USERNAME) {
      const exists = await this.repo.exist({
        where: { USERNAME: nextUsername },
      });

      if (exists)
        throw new ConflictException(`USERNAME ${nextUsername} ya existe`);
      payload.USERNAME = nextUsername;
    }

    if (
      MAIL !== undefined ||
      IDEMPRESA !== undefined ||
      USERNAME !== undefined
    ) {
      const mailInput =
        MAIL ??
        (USERNAME !== undefined
          ? `${nextUsername}${this.extractMailDomain(row.MAIL)}`
          : row.MAIL);
      const nextMail = await this.resolveMail(
        nextUsername,
        mailInput,
        IDEMPRESA,
      );
      if (nextMail !== row.MAIL) {
        const exists = await this.repo.exist({ where: { MAIL: nextMail } });
        if (exists) throw new ConflictException(`MAIL ${nextMail} ya existe`);
        payload.MAIL = nextMail;
      }
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
      await manager
        .getRepository(UsuarioEntity)
        .update({ IDUSUARIO: id }, payload);
    });

    await this.upsertPvOpvForCajaUser(
      {
        ...row,
        ...payload,
        IDUSUARIO: id,
        USERNAME: nextUsername,
      } as UsuarioEntity,
      PASSWORD && PASSWORD.trim().length > 0
        ? this.sha1Hex(PASSWORD.trim())
        : null,
    );

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
        await manager.query(
          `DELETE FROM dbo.USUARIO_TOKEN WHERE IDUSUARIO = @0`,
          [userId],
        );
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
        await manager
          .getRepository(UsuarioEntity)
          .delete({ IDUSUARIO: userId });
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = Number(
          (error as QueryFailedError & { driverError?: { number?: number } })
            .driverError?.number ?? 0,
        );
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

  private sha1Hex(value: string) {
    return createHash('sha1').update(value).digest('hex').toUpperCase();
  }

  private normalizeUsername(value: string) {
    const username = String(value ?? '').trim();
    if (username.length < 3 || username.length > 60) {
      throw new BadRequestException(
        'USERNAME debe tener entre 3 y 60 caracteres',
      );
    }
    return username;
  }

  private async resolveMail(
    username: string,
    mailRaw: string | undefined,
    empresaId?: number,
  ) {
    if (empresaId != null) {
      const domain = await this.findEmpresaCorreo(empresaId);
      return `${username}${domain}`;
    }

    const mail = String(mailRaw ?? '').trim();
    const atIndex = mail.indexOf('@');
    if (atIndex <= 0) throw new BadRequestException('MAIL invalido');

    const local = mail.substring(0, atIndex);
    const domain = mail.substring(atIndex).toLowerCase();
    if (local.toUpperCase() !== username.toUpperCase()) {
      throw new BadRequestException(
        'MAIL debe componerse como USERNAME + correo de empresa',
      );
    }

    const domains = await this.findEmpresaCorreos();
    if (domains.length > 0 && !domains.includes(domain)) {
      throw new BadRequestException(
        'MAIL debe usar un correo registrado en EMPRESA',
      );
    }

    return `${local}${domain}`;
  }

  private extractMailDomain(mail: string) {
    const value = String(mail ?? '').trim();
    const atIndex = value.indexOf('@');
    return atIndex >= 0 ? value.substring(atIndex).toLowerCase() : '';
  }

  private async findEmpresaCorreo(empresaId: number) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 LOWER(LTRIM(RTRIM(correo))) AS correo
      FROM dbo.EMPRESA
      WHERE idempresa = @0
      `,
      [empresaId],
    );
    const correo = String(rows?.[0]?.correo ?? '')
      .trim()
      .toLowerCase();
    if (!correo)
      throw new BadRequestException(`EMPRESA ${empresaId} no existe`);
    return correo;
  }

  private async findEmpresaCorreos() {
    try {
      const rows = await this.dataSource.query(
        `
        SELECT LOWER(LTRIM(RTRIM(correo))) AS correo
        FROM dbo.EMPRESA
        WHERE NULLIF(LTRIM(RTRIM(correo)), '') IS NOT NULL
        `,
      );
      return ((rows ?? []) as Record<string, unknown>[])
        .map((row) =>
          String(row.correo ?? '')
            .trim()
            .toLowerCase(),
        )
        .filter((correo) => correo.startsWith('@'));
    } catch {
      return [];
    }
  }

  private async upsertPvOpvForCajaUser(
    user: UsuarioEntity,
    contHash: string | null,
  ) {
    const labels = await this.resolveUserCatalogLabels(
      user.IDDEPTO,
      user.IDROL,
    );
    if (!this.isCajaDepto(labels.deptoNombre)) return;

    const idopv = this.normalizeRequiredText(user.USERNAME, 'USERNAME');
    const suc = this.normalizeUpper(user.SUC);
    if (!suc) {
      throw new BadRequestException(
        'SUC es requerido para crear control PV_OPV de CAJAS',
      );
    }

    const nameParts = this.buildPvOpvNameParts(user.NOMBRE, user.APELLIDOS);
    const depto = labels.deptoNombre || 'CAJAS';
    const puesto = labels.rolNombre || 'OPV COMPLETO';
    const estatus = this.normalizeRequiredText(user.ESTATUS, 'ESTATUS');
    const mail = this.normalizeRequiredText(user.MAIL, 'MAIL');

    await this.dataSource.query(
      `
      IF EXISTS (
        SELECT 1
        FROM dbo.PV_OPV
        WHERE UPPER(LTRIM(RTRIM(CAST(IDOPV AS NVARCHAR(255))))) = UPPER(@0)
      )
      BEGIN
        UPDATE dbo.PV_OPV
        SET
          FCNR = ISNULL(FCNR, GETDATE()),
          NOMB = @1,
          APELP = @2,
          APELM = @3,
          CONT = COALESCE(@4, CONT),
          NIVEL = @5,
          BLOQ = NULL,
          SUC = @6,
          DEPTO = @7,
          MAIL = @8,
          PUESTO = @9,
          COD_TMP = NULL,
          ESTATUS = @10
        WHERE UPPER(LTRIM(RTRIM(CAST(IDOPV AS NVARCHAR(255))))) = UPPER(@0);
      END
      ELSE
      BEGIN
        INSERT INTO dbo.PV_OPV (
          IDOPV,
          FCNR,
          NOMB,
          APELP,
          APELM,
          CONT,
          NIVEL,
          BLOQ,
          SUC,
          DEPTO,
          MAIL,
          PUESTO,
          COD_TMP,
          ESTATUS
        )
        VALUES (
          @0,
          GETDATE(),
          @1,
          @2,
          @3,
          @4,
          @5,
          NULL,
          @6,
          @7,
          @8,
          @9,
          NULL,
          @10
        );
      END
      `,
      [
        idopv,
        nameParts.nomb,
        nameParts.apelp,
        nameParts.apelm,
        contHash,
        Number.isFinite(Number(user.NIVEL)) ? Number(user.NIVEL) : 1,
        suc,
        depto,
        mail,
        puesto,
        estatus,
      ],
    );
  }

  private async resolveUserCatalogLabels(
    idDepto: number | null,
    idRol: number,
  ) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(d.NOMBRE, dr.NOMBRE))) AS DEPTO_NOMBRE,
        LTRIM(RTRIM(ISNULL(r.NOMBRE, ''))) AS ROL_NOMBRE
      FROM dbo.ROL r
      LEFT JOIN dbo.DEPARTAMENTO d
        ON d.IDDEPTO = @0
      LEFT JOIN dbo.DEPARTAMENTO dr
        ON dr.IDDEPTO = r.IDDEPTO
      WHERE r.IDROL = @1
      `,
      [idDepto, idRol],
    );

    const first = (rows?.[0] ?? {}) as Record<string, unknown>;
    return {
      deptoNombre: String(first.DEPTO_NOMBRE ?? '').trim(),
      rolNombre: String(first.ROL_NOMBRE ?? '').trim(),
    };
  }

  private isCajaDepto(value: string) {
    const text = value.trim().toUpperCase();
    return text === 'CAJAS' || text.includes('CAJA');
  }

  private buildPvOpvNameParts(nombre: string | null, apellidos: string | null) {
    const surnames = String(apellidos ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return {
      nomb: this.limitText(nombre, 255),
      apelp: this.limitText(surnames[0] ?? null, 255),
      apelm: this.limitText(surnames.slice(1).join(' ') || null, 255),
    };
  }

  private normalizeRequiredText(
    value: string | null | undefined,
    field: string,
  ) {
    const text = String(value ?? '').trim();
    if (!text) throw new BadRequestException(`${field} es requerido`);
    return text;
  }

  private limitText(value: string | null | undefined, max: number) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    return text.length > max ? text.substring(0, max) : text;
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
        Number(
          existsRows?.[0]?.EXISTS_FLAG ?? existsRows?.[0]?.exists_flag ?? 0,
        ) === 1;
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
