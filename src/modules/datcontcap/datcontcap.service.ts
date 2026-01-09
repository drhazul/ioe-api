import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError, QueryRunner, Repository } from 'typeorm';
import { DatContCapEntity } from './datcontcap.entity';
import { CreateDatContCapDto } from './dto/create-datcontcap.dto';
import type { JwtPayload } from '../auth/jwt.strategy';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';
import { DatArtEntity } from '../datart/datart.entity';
import type { ListDatContCapDto } from './dto/list-datcontcap.dto';

type NormalizedConteo = { cont: string; suc: string; ctrl: DatContCtrlEntity };

@Injectable()
export class DatContCapService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DatContCapEntity)
    private readonly repo: Repository<DatContCapEntity>,
    @InjectRepository(DatContCtrlEntity)
    private readonly ctrlRepo: Repository<DatContCtrlEntity>,
    @InjectRepository(DatArtEntity)
    private readonly artRepo: Repository<DatArtEntity>,
  ) {}

  async conteosDisponibles(user: JwtPayload) {
    const isAdmin = this.isAdmin(user);
    const userSuc = (user.suc ?? '').trim();
    const allowAll = isAdmin || userSuc.toUpperCase() === '000';

    if (!allowAll && !userSuc) {
      throw new UnauthorizedException('El token no tiene SUC asignada.');
    }

    const params: any[] = [];
    const where: string[] = [`ESTA IN ('CAPTURA','LISTO')`];
    if (!allowAll) {
      where.push('SUC = @0');
      params.push(userSuc);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await this.dataSource.query(
      `
      SELECT
        TOKENREG,
        CONT,
        SUC,
        ESTA,
        TIPOCONT,
        FCNC,
        TOTAL_ITEMS,
        FILE_NAME
      FROM dbo.DAT_CONT_CTRL
      ${whereSql}
      ORDER BY FCNC DESC, CONT ASC
      `,
      params,
    );

    return rows;
  }

  async capturar(dto: CreateDatContCapDto, user: JwtPayload) {
    const { cont, suc, ctrl } = await this.resolveConteo(dto.cont, user, dto.suc, true);
    const almacen = this.normalizeAlmacen(dto.almacen);
    const cantidad = this.normalizeCantidad(dto.cantidad, dto.tipoMov);
    const captureUuid = dto.capturaUuid ?? randomUUID();
    const { art, upc } = await this.resolveArticulo({ suc, art: dto.art, upc: dto.upc });

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const scopedRepo = queryRunner.manager.getRepository(DatContCapEntity);
      const existing = await scopedRepo.findOne({ where: { CAPTURA_UUID: captureUuid } });
      if (existing) {
        await queryRunner.rollbackTransaction();
        return this.buildCaptureResponse(existing, true);
      }

      const entity = scopedRepo.create({
        SUC: suc,
        CONT: cont,
        ART: art,
        UPC: upc ?? null,
        ALMACEN: almacen,
        CANT: cantidad,
        TIPO_MOV: dto.tipoMov ? dto.tipoMov.toUpperCase() : cantidad >= 0 ? 'ADD' : 'SUB',
        IDUSUARIO: Number(user.sub),
        CAPTURA_UUID: captureUuid,
      });

      const saved = await scopedRepo.save(entity);

      await this.runSyncProcedure(queryRunner, suc, cont, art);

      await queryRunner.commitTransaction();

      return this.buildCaptureResponse(saved, false, ctrl);
    } catch (err) {
      await queryRunner.rollbackTransaction();

      // Unique UUID => idempotente
      if (err instanceof QueryFailedError) {
        const message = (err as any)?.message ?? '';
        if (message.includes('UQ_DAT_CONT_CAPTURA_UUID') || message.includes('CAPTURA_UUID')) {
          const existing = await this.repo.findOne({ where: { CAPTURA_UUID: captureUuid } });
          if (existing) {
            return this.buildCaptureResponse(existing, true, ctrl);
          }
        }
      }

      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async listarCapturas(query: ListDatContCapDto, user: JwtPayload) {
    const contCode = (query.cont ?? '').trim().toUpperCase();
    if (!contCode) throw new BadRequestException('cont es requerido');

    const { suc: sucToUse } = await this.resolveConteo(contCode, user, query.suc, false);

    const rawPage = Number(query.page ?? 1);
    const safePage = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const rawLimit = Number(query.limit ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50, 1), 500);
    const skip = (safePage - 1) * limit;

    const almacenFilter = (query.almacen ?? '').trim().toUpperCase();
    const upcFilter = (query.upc ?? '').trim();

    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.SUC = :suc', { suc: sucToUse })
      .andWhere('c.CONT = :cont', { cont: contCode });

    if (almacenFilter && almacenFilter !== 'TODOS') {
      qb.andWhere('c.ALMACEN = :alm', { alm: almacenFilter });
    }

    if (upcFilter) {
      qb.andWhere('c.UPC LIKE :upc', { upc: `${upcFilter}%` });
    }

    const [rows, total] = await qb
      .orderBy('c.FCNR', 'DESC')
      .addOrderBy('c.ID', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows,
      page: safePage,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      suc: sucToUse,
      cont: contCode,
    };
  }

  async resumen(cont: string, user: JwtPayload, suc?: string) {
    const { cont: contCode, suc: sucToUse } = await this.resolveConteo(cont, user, suc, false);

    const row = await this.repo
      .createQueryBuilder('c')
      .select("SUM(CASE WHEN c.ALMACEN = '001' THEN c.CANT ELSE 0 END)", 'cap001')
      .addSelect("SUM(CASE WHEN c.ALMACEN = '002' THEN c.CANT ELSE 0 END)", 'cap002')
      .addSelect("SUM(CASE WHEN c.ALMACEN = 'M001' THEN c.CANT ELSE 0 END)", 'capM1')
      .addSelect("SUM(CASE WHEN c.ALMACEN = 'T001' THEN c.CANT ELSE 0 END)", 'capT1')
      .where('c.SUC = :suc AND c.CONT = :cont', { suc: sucToUse, cont: contCode })
      .getRawOne();

    const cap001 = this.toNumber((row as any)?.cap001) ?? 0;
    const cap002 = this.toNumber((row as any)?.cap002) ?? 0;
    const capM1 = this.toNumber((row as any)?.capM1) ?? 0;
    const capT1 = this.toNumber((row as any)?.capT1) ?? 0;
    const capTotal = cap001 + cap002 + capM1 + capT1;

    return { cont: contCode, suc: sucToUse, cap001, cap002, capM1, capT1, capTotal };
  }

  private async resolveConteo(
    cont: string,
    user: JwtPayload,
    suc?: string,
    requireCaptureState = false,
  ): Promise<NormalizedConteo> {
    const contCode = (cont ?? '').trim().toUpperCase();
    if (!contCode) throw new BadRequestException('cont es requerido');

    const isAdmin = this.isAdmin(user);
    const userSuc = (user.suc ?? '').trim();
    const explicitSuc = (suc ?? '').trim();
    const allowAll = isAdmin || userSuc.toUpperCase() === '000';

    let sucToUse = explicitSuc || userSuc;
    let ctrl: DatContCtrlEntity | null = null;

    if (sucToUse) {
      ctrl = await this.ctrlRepo.findOne({ where: { CONT: contCode, SUC: sucToUse } });
    }

    if (!ctrl && allowAll && !explicitSuc) {
      const matches = await this.ctrlRepo.find({ where: { CONT: contCode } });
      if (matches.length === 1) {
        ctrl = matches[0];
        sucToUse = matches[0].SUC ?? sucToUse;
      }
    }

    if (!ctrl) {
      throw new NotFoundException(`Conteo ${contCode} no existe para la sucursal solicitada`);
    }

    const normalizedSuc = (ctrl.SUC ?? sucToUse ?? '').trim();
    if (!normalizedSuc) throw new BadRequestException('SUC no disponible para este conteo');

    if (!allowAll && normalizedSuc !== userSuc) {
      throw new UnauthorizedException('No puedes capturar conteos de otra sucursal');
    }

    if (requireCaptureState) {
      const estado = (ctrl.ESTA ?? '').trim().toUpperCase();
      if (estado !== 'CAPTURA' && estado !== 'LISTO') {
        throw new ConflictException(`Conteo ${contCode} no está en estado CAPTURA/LISTO`);
      }
    }

    return { cont: contCode, suc: normalizedSuc, ctrl };
  }

  private async resolveArticulo(input: { suc: string; art?: string; upc?: string }) {
    const upc = (input.upc ?? '').trim();
    const art = (input.art ?? '').trim().toUpperCase();

    if (!upc && !art) {
      throw new BadRequestException('Envía UPC o ART para capturar.');
    }

    if (upc && art) {
      const match = await this.artRepo.findOne({ where: { SUC: input.suc, UPC: upc } });
      if (!match) {
        throw new NotFoundException(`UPC ${upc} no existe en la sucursal ${input.suc}`);
      }
      if (match && (match.ART ?? '').trim().toUpperCase() !== art) {
        throw new BadRequestException(`UPC ${upc} no corresponde al ART ${art} en la sucursal ${input.suc}`);
      }
      return { art, upc };
    }

    if (art && !upc) {
      const row = await this.artRepo.findOne({ where: { SUC: input.suc, ART: art } });
      if (!row) throw new NotFoundException(`ART ${art} no existe en la sucursal ${input.suc}`);
      return { art, upc: row.UPC ?? null };
    }

    const row = await this.artRepo.findOne({ where: { SUC: input.suc, UPC: upc } });
    if (!row) {
      throw new NotFoundException(`UPC ${upc} no existe en la sucursal ${input.suc}`);
    }
    return { art: (row.ART ?? '').trim().toUpperCase(), upc: row.UPC };
  }

  private normalizeCantidad(value: number, tipoMov?: string) {
    const num = Number(value);
    if (!Number.isFinite(num)) throw new BadRequestException('cantidad inválida');

    const tipo = (tipoMov ?? '').trim().toUpperCase();
    if (tipo === 'SUB') return -Math.abs(num);
    if (tipo === 'ADD') return Math.abs(num);
    return num;
  }

  private normalizeAlmacen(value: string) {
    const alm = (value ?? '').trim().toUpperCase();
    if (!['001', '002', 'M001', 'T001'].includes(alm)) {
      throw new BadRequestException('almacen inválido');
    }
    return alm;
  }

  private isAdmin(user: JwtPayload) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private async runSyncProcedure(queryRunner: QueryRunner, suc: string, cont: string, art: string) {
    await queryRunner.query('EXEC dbo.sp_cont_sync_captura_art @SUC = @0, @CONT = @1, @ART = @2', [suc, cont, art]);
  }

  private buildCaptureResponse(entity: DatContCapEntity, idempotent: boolean, ctrl?: DatContCtrlEntity) {
    return {
      id: entity.ID,
      cont: entity.CONT,
      suc: entity.SUC,
      art: entity.ART,
      upc: entity.UPC,
      almacen: entity.ALMACEN,
      cantidad: entity.CANT,
      tipoMov: entity.TIPO_MOV,
      capturaUuid: entity.CAPTURA_UUID,
      fcnr: entity.FCNR,
      idUsuario: entity.IDUSUARIO,
      idempotent,
      estadoConteo: ctrl?.ESTA ?? null,
    };
  }

  private toNullableNumber(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toNumber(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
}
