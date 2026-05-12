import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PromocionesService } from '../promociones/promociones.service';
import { PvTicketLogEntity } from './pvticketlog.entity';
import { CreatePvTicketLogDto } from './dto/create-pvticketlog.dto';
import { UpdatePvTicketLogDto } from './dto/update-pvticketlog.dto';
import { AuthorizePvTicketLogPriceDto } from './dto/authorize-pvticketlog-price.dto';
import { UpdatePvTicketLogPriceDto } from './dto/update-pvticketlog-price.dto';

@Injectable()
export class PvTicketLogService {
  constructor(
    @InjectRepository(PvTicketLogEntity)
    private readonly repo: Repository<PvTicketLogEntity>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly promocionesService: PromocionesService,
  ) {}

  findAll(idfol?: string) {
    const idfolTrim = (idfol ?? '').trim();
    if (idfolTrim) {
      return this.repo.find({
        where: { IDFOL: idfolTrim },
        order: { UPDATED_AT: 'ASC' },
      });
    }
    return this.repo.find({ order: { ID: 'ASC' } });
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { ID: id } });
    if (!row) throw new NotFoundException(`PV_TICKET_LOG ${id} no existe`);
    return row;
  }

  async create(dto: CreatePvTicketLogDto, user: JwtPayload) {
    const exists = await this.repo.exist({ where: { ID: dto.ID } });
    if (exists) throw new ConflictException(`ID ${dto.ID} ya existe`);

    const entity = this.repo.create({
      ID: dto.ID,
      IDFOL: dto.IDFOL ?? null,
      UPC: dto.UPC ?? null,
      ART: dto.ART ?? null,
      DES: dto.DES ?? null,
      CTD: dto.CTD ?? null,
      PVTA: dto.PVTA ?? null,
      PVTAT: dto.PVTAT ?? null,
      ORD: dto.ORD ?? null,
      IDDEV: dto.IDDEV ?? null,
      CTDD: dto.CTDD ?? null,
      CTDDF: dto.CTDDF ?? null,
      UPDATED_AT: dto.UPDATED_AT ? new Date(dto.UPDATED_AT) : null,
    });

    const saved = await this.repo.save(entity);
    await this.applyPromocionesForLine(saved, user);
    return this.findOne(saved.ID);
  }

  async update(id: string, dto: UpdatePvTicketLogDto, user: JwtPayload) {
    const row = await this.findOne(id);
    const ordAssigned = this.normalizeOrd(row.ORD);

    if (ordAssigned && dto.CTD !== undefined) {
      const currentQty = Number(row.CTD);
      const nextQty = Number(dto.CTD);
      const qtyChanged =
        !Number.isFinite(currentQty) ||
        !Number.isFinite(nextQty) ||
        Math.abs(currentQty - nextQty) > 0.0001;
      if (qtyChanged) {
        throw new ForbiddenException(
          'No se permite modificar CTD cuando el artículo ya tiene ORD asignada.',
        );
      }
    }

    if (dto.PVTA !== undefined) {
      if (ordAssigned) {
        throw new ForbiddenException(
          'No se permite modificar PVTA cuando el artículo ya tiene ORD asignada.',
        );
      }
      throw new ForbiddenException(
        'Para actualizar PVTA usa el endpoint de autorizacion /pvticketlog/:id/precio',
      );
    }

    const partial: Partial<PvTicketLogEntity> = {};
    if (dto.IDFOL !== undefined) partial.IDFOL = dto.IDFOL ?? null;
    if (dto.UPC !== undefined) partial.UPC = dto.UPC ?? null;
    if (dto.ART !== undefined) partial.ART = dto.ART ?? null;
    if (dto.DES !== undefined) partial.DES = dto.DES ?? null;
    if (dto.CTD !== undefined) partial.CTD = dto.CTD ?? null;
    if (dto.PVTA !== undefined) partial.PVTA = dto.PVTA ?? null;
    if (dto.PVTAT !== undefined) partial.PVTAT = dto.PVTAT ?? null;
    if (dto.ORD !== undefined) partial.ORD = dto.ORD ?? null;
    if (dto.IDDEV !== undefined) partial.IDDEV = dto.IDDEV ?? null;
    if (dto.CTDD !== undefined) partial.CTDD = dto.CTDD ?? null;
    if (dto.CTDDF !== undefined) partial.CTDDF = dto.CTDDF ?? null;
    if (dto.UPDATED_AT !== undefined) {
      partial.UPDATED_AT = dto.UPDATED_AT ? new Date(dto.UPDATED_AT) : null;
    }

    const updated = this.repo.merge(row, partial);
    const saved = await this.repo.save(updated);
    await this.applyPromocionesForLine(saved, user);
    return this.findOne(saved.ID);
  }

  async updatePrice(
    id: string,
    dto: UpdatePvTicketLogPriceDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const row = await this.findOne(id);
    const ordAssigned = this.normalizeOrd(row.ORD);
    if (ordAssigned) {
      throw new ForbiddenException(
        'No se permite modificar PVTA cuando el artículo ya tiene ORD asignada.',
      );
    }

    const nextPvtaRaw = Number(dto.PVTA);
    if (!Number.isFinite(nextPvtaRaw) || nextPvtaRaw <= 0) {
      throw new BadRequestException('PVTA inválido');
    }
    const nextPvta = this.round2(nextPvtaRaw);

    const qty = Number(row.CTD ?? NaN);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException(
        'No se puede actualizar precio sin cantidad válida en el renglón',
      );
    }

    const oldPvta = this.round2(Number(row.PVTA ?? 0));
    const oldPvtat = this.round2(Number(row.PVTAT ?? qty * oldPvta));
    const nextPvtat = this.round2(qty * nextPvta);

    const requester = await this.loadUserWithRole(user.sub);
    const requesterRoleCode = this.normalizeUpper(requester?.roleCode ?? '');
    const isSupervisor = requesterRoleCode === 'SUPERPV';

    let authorizedBy = requester;
    let authMode = 'SELF_SUPERVISOR';

    if (!isSupervisor) {
      const authPassword = (dto.AUTH_PASSWORD ?? '').trim();
      if (!authPassword) {
        throw new ForbiddenException(
          'Se requiere autorización de usuario SUPERPV',
        );
      }
      const superPvAuthorizer =
        await this.findSuperPvAuthorizerByPassword(authPassword);
      if (!superPvAuthorizer) {
        throw new ForbiddenException('Autorización SUPERPV inválida');
      }
      authorizedBy = superPvAuthorizer;
      authMode = 'SUPERPV_PASSWORD';
    }

    row.PVTA = nextPvta;
    row.PVTAT = nextPvtat;
    row.UPDATED_AT = new Date();
    const updated = await this.repo.save(row);

    const metadata = {
      idfol: row.IDFOL,
      art: row.ART,
      upc: row.UPC,
      ctd: qty,
      pvtaBefore: oldPvta,
      pvtaAfter: nextPvta,
      pvtatBefore: oldPvtat,
      pvtatAfter: nextPvtat,
      requestedBy: {
        idUsuario: Number(user.sub ?? 0) || null,
        username: requester?.username ?? user.username ?? null,
        roleId: Number(user.roleId ?? 0) || null,
        roleCode: requesterRoleCode || null,
      },
      authorization: {
        mode: authMode,
        authorizedBy: authorizedBy
          ? {
              idUsuario: authorizedBy.idUsuario,
              username: authorizedBy.username,
              roleCode: authorizedBy.roleCode,
            }
          : null,
      },
    };

    const auditUserId =
      authorizedBy?.idUsuario ?? (Number(user.sub ?? 0) || null);

    await this.audit.log({
      IDUSUARIO: auditUserId,
      ACTION: 'PVTA_OVERRIDE',
      MODULO: 'punto-venta',
      ENTIDAD: 'PV_TICKET_LOG',
      ENTIDAD_ID: id,
      SUC: user.suc ?? requester?.suc ?? null,
      METADATA_JSON: JSON.stringify(metadata),
      IP: ip,
    });

    await this.applyPromocionesForLine(updated, user);
    return this.findOne(updated.ID);
  }

  async authorizePrice(dto: AuthorizePvTicketLogPriceDto, _user: JwtPayload) {
    const authPassword = (dto.AUTH_PASSWORD ?? '').trim();
    if (!authPassword) {
      throw new ForbiddenException(
        'Se requiere autorización de usuario SUPERPV',
      );
    }

    const superPvAuthorizer =
      await this.findSuperPvAuthorizerByPassword(authPassword);
    if (!superPvAuthorizer) {
      throw new ForbiddenException('Autorización SUPERPV inválida');
    }

    return {
      authorized: true,
      idUsuario: superPvAuthorizer.idUsuario,
      username: superPvAuthorizer.username,
      roleCode: superPvAuthorizer.roleCode,
    };
  }

  async remove(id: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rows = await queryRunner.query(
        `
        SELECT TOP 1
          ID,
          LTRIM(RTRIM(ISNULL(ORD, ''))) AS ORD
        FROM dbo.PV_TICKET_LOG
        WHERE ID = @0
        `,
        [id],
      );
      const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
      if (!row) {
        throw new NotFoundException(`PV_TICKET_LOG ${id} no existe`);
      }

      const ordAssigned = this.normalizeOrd(row.ORD);
      if (ordAssigned) {
        await queryRunner.query(
          `
          UPDATE dbo.PV_TICKET_LOG
          SET ORD = NULL
          WHERE LTRIM(RTRIM(ISNULL(ORD, ''))) = @0
          `,
          [ordAssigned],
        );

        await queryRunner.query(
          `
          DELETE FROM dbo.PV_CTR_ORDS_DET
          WHERE IORD = @0
          `,
          [ordAssigned],
        );

        await queryRunner.query(
          `
          DELETE FROM dbo.PV_CTR_ORDS
          WHERE IORD = @0
          `,
          [ordAssigned],
        );
      }

      await queryRunner.query(
        `
        IF OBJECT_ID('dbo.PROMO_TICKET_DESC_APLI', 'U') IS NOT NULL
        BEGIN
          DELETE FROM dbo.PROMO_TICKET_DESC_APLI
          WHERE ID = @0
        END
        `,
        [id],
      );

      await queryRunner.query(
        `
        DELETE FROM dbo.PV_TICKET_LOG
        WHERE ID = @0
        `,
        [id],
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      if (err instanceof NotFoundException) {
        throw err;
      }
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar PV_TICKET_LOG ${id} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    } finally {
      await queryRunner.release();
    }

    return { deleted: true, ID: id };
  }

  private normalizeOrd(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown) {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }

  private round2(value: number) {
    return Math.round(value * 100) / 100;
  }

  private async applyPromocionesForLine(
    line: PvTicketLogEntity,
    user: JwtPayload,
  ) {
    const idfol = String(line.IDFOL ?? '').trim();
    if (!idfol) return;
    await this.promocionesService.aplicarLinea(
      line.ID,
      { generarGratis: false },
      user,
    );
  }

  private async loadUserWithRole(idUsuario: number) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        u.IDUSUARIO,
        u.USERNAME,
        u.SUC,
        r.CODIGO AS ROLE_CODE
      FROM dbo.USUARIO u
      LEFT JOIN dbo.ROL r ON r.IDROL = u.IDROL
      WHERE u.IDUSUARIO = @0
      `,
      [idUsuario],
    );

    const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      idUsuario: Number(row.IDUSUARIO ?? 0) || 0,
      username: String(row.USERNAME ?? '').trim(),
      suc: String(row.SUC ?? '').trim() || null,
      roleCode: String(row.ROLE_CODE ?? '').trim(),
    };
  }

  private async findSuperPvAuthorizerByPassword(password: string) {
    const rows = await this.dataSource.query(
      `
      SELECT
        u.IDUSUARIO,
        u.USERNAME,
        u.PASSWORD_HASH,
        u.SUC,
        r.CODIGO AS ROLE_CODE
      FROM dbo.USUARIO u
      INNER JOIN dbo.ROL r ON r.IDROL = u.IDROL
      WHERE u.ESTATUS = 'ACTIVO'
        AND r.ACTIVO = 1
        AND UPPER(r.CODIGO) = 'SUPERPV'
      `,
    );

    for (const raw of rows ?? []) {
      const row = raw as Record<string, unknown>;
      const hash = String(row.PASSWORD_HASH ?? '');
      if (!hash) continue;
      const valid = await bcrypt.compare(password, hash);
      if (!valid) continue;
      return {
        idUsuario: Number(row.IDUSUARIO ?? 0) || 0,
        username: String(row.USERNAME ?? '').trim(),
        suc: String(row.SUC ?? '').trim() || null,
        roleCode: String(row.ROLE_CODE ?? '').trim(),
      };
    }

    return null;
  }
}
