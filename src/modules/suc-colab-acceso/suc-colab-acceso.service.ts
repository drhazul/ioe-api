import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, QueryFailedError, Repository } from 'typeorm';
import { DatSucEntity } from '../dat-suc/dat-suc.entity';
import { CreateSucColabAccesoDto } from './dto/create-suc-colab-acceso.dto';
import { UpdateSucColabAccesoDto } from './dto/update-suc-colab-acceso.dto';
import { SucColabAccesoEntity } from './suc-colab-acceso.entity';

type SucColabAccesoQuery = {
  includeInactive?: string;
  sucDestino?: string;
  sucOrigen?: string;
  search?: string;
};

@Injectable()
export class SucColabAccesoService {
  constructor(
    @InjectRepository(SucColabAccesoEntity)
    private readonly repo: Repository<SucColabAccesoEntity>,
  ) {}

  async findAll(query?: SucColabAccesoQuery) {
    const includeInactive = this.toBool(query?.includeInactive);
    const sucDestino = this.normalizeUpper(query?.sucDestino);
    const sucOrigen = this.normalizeUpper(query?.sucOrigen);
    const search = this.normalizeText(query?.search)?.toUpperCase() ?? '';

    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoin(
        DatSucEntity,
        'sd',
        "UPPER(LTRIM(RTRIM(ISNULL(sd.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(r.SUC_DESTINO, ''))))",
      )
      .leftJoin(
        DatSucEntity,
        'so',
        "UPPER(LTRIM(RTRIM(ISNULL(so.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(r.SUC_ORIGEN, ''))))",
      )
      .select([
        'r.ID AS ID',
        "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_DESTINO, '')))) AS SUC_DESTINO",
        "LTRIM(RTRIM(ISNULL(sd.[DESC], ''))) AS SUC_DESTINO_DESC",
        "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_ORIGEN, '')))) AS SUC_ORIGEN",
        "LTRIM(RTRIM(ISNULL(so.[DESC], ''))) AS SUC_ORIGEN_DESC",
        'CASE WHEN ISNULL(TRY_CONVERT(INT, r.ACTIVO), 1) = 1 THEN 1 ELSE 0 END AS ACTIVO',
        "LTRIM(RTRIM(ISNULL(r.OBSERVACION, ''))) AS OBSERVACION",
        'TRY_CONVERT(VARCHAR(30), r.FCREG, 126) AS FCREG',
        'TRY_CONVERT(VARCHAR(30), r.FCMOD, 126) AS FCMOD',
      ])
      .orderBy('r.SUC_DESTINO', 'ASC')
      .addOrderBy('r.SUC_ORIGEN', 'ASC')
      .addOrderBy('r.ID', 'ASC');

    if (!includeInactive) {
      qb.andWhere('ISNULL(TRY_CONVERT(INT, r.ACTIVO), 1) = 1');
    }
    if (sucDestino) {
      qb.andWhere(
        "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_DESTINO, '')))) = UPPER(:sucDestino)",
        { sucDestino },
      );
    }
    if (sucOrigen) {
      qb.andWhere(
        "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_ORIGEN, '')))) = UPPER(:sucOrigen)",
        { sucOrigen },
      );
    }
    if (search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where(
              "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_DESTINO, '')))) LIKE :searchLike",
              { searchLike: `%${search}%` },
            )
            .orWhere(
              "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_ORIGEN, '')))) LIKE :searchLike",
              { searchLike: `%${search}%` },
            )
            .orWhere(
              "UPPER(LTRIM(RTRIM(ISNULL(sd.[DESC], '')))) LIKE :searchLike",
              {
                searchLike: `%${search}%`,
              },
            )
            .orWhere(
              "UPPER(LTRIM(RTRIM(ISNULL(so.[DESC], '')))) LIKE :searchLike",
              {
                searchLike: `%${search}%`,
              },
            )
            .orWhere(
              "UPPER(LTRIM(RTRIM(ISNULL(r.OBSERVACION, '')))) LIKE :searchLike",
              {
                searchLike: `%${search}%`,
              },
            );
        }),
      );
    }

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((row) => this.mapRow(row));
  }

  async findOne(idRaw: string) {
    const id = this.parseId(idRaw);
    const row = await this.repo
      .createQueryBuilder('r')
      .leftJoin(
        DatSucEntity,
        'sd',
        "UPPER(LTRIM(RTRIM(ISNULL(sd.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(r.SUC_DESTINO, ''))))",
      )
      .leftJoin(
        DatSucEntity,
        'so',
        "UPPER(LTRIM(RTRIM(ISNULL(so.SUC, '')))) = UPPER(LTRIM(RTRIM(ISNULL(r.SUC_ORIGEN, ''))))",
      )
      .select([
        'r.ID AS ID',
        "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_DESTINO, '')))) AS SUC_DESTINO",
        "LTRIM(RTRIM(ISNULL(sd.[DESC], ''))) AS SUC_DESTINO_DESC",
        "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_ORIGEN, '')))) AS SUC_ORIGEN",
        "LTRIM(RTRIM(ISNULL(so.[DESC], ''))) AS SUC_ORIGEN_DESC",
        'CASE WHEN ISNULL(TRY_CONVERT(INT, r.ACTIVO), 1) = 1 THEN 1 ELSE 0 END AS ACTIVO',
        "LTRIM(RTRIM(ISNULL(r.OBSERVACION, ''))) AS OBSERVACION",
        'TRY_CONVERT(VARCHAR(30), r.FCREG, 126) AS FCREG',
        'TRY_CONVERT(VARCHAR(30), r.FCMOD, 126) AS FCMOD',
      ])
      .where('r.ID = :id', { id })
      .getRawOne<Record<string, unknown>>();

    const mapped = row ? this.mapRow(row) : null;
    if (!mapped) {
      throw new NotFoundException(`DAT_SUC_COLAB_ACCESO ${id} no existe`);
    }
    return mapped;
  }

  async create(dto: CreateSucColabAccesoDto) {
    const payload = this.normalizePayload(dto);
    await this.assertValidPair(payload.SUC_DESTINO, payload.SUC_ORIGEN);
    await this.assertUnique(payload.SUC_DESTINO, payload.SUC_ORIGEN);

    try {
      const entity = this.repo.create({
        SUC_DESTINO: payload.SUC_DESTINO,
        SUC_ORIGEN: payload.SUC_ORIGEN,
        ACTIVO: payload.ACTIVO,
        OBSERVACION: payload.OBSERVACION,
        FCREG: new Date(),
        FCMOD: null,
      });
      const saved = await this.repo.save(entity);
      return this.findOne(String(saved.ID));
    } catch (err) {
      this.handleWriteError(err);
    }
  }

  async update(idRaw: string, dto: UpdateSucColabAccesoDto) {
    const current = await this.findOne(idRaw);
    const payload = this.normalizePayload({
      SUC_DESTINO: dto.SUC_DESTINO ?? current.SUC_DESTINO,
      SUC_ORIGEN: dto.SUC_ORIGEN ?? current.SUC_ORIGEN,
      ACTIVO: dto.ACTIVO ?? current.ACTIVO,
      OBSERVACION:
        dto.OBSERVACION === undefined ? current.OBSERVACION : dto.OBSERVACION,
    });
    await this.assertValidPair(payload.SUC_DESTINO, payload.SUC_ORIGEN);
    await this.assertUnique(
      payload.SUC_DESTINO,
      payload.SUC_ORIGEN,
      current.ID,
    );

    try {
      await this.repo.update(
        { ID: current.ID },
        {
          SUC_DESTINO: payload.SUC_DESTINO,
          SUC_ORIGEN: payload.SUC_ORIGEN,
          ACTIVO: payload.ACTIVO,
          OBSERVACION: payload.OBSERVACION,
          FCMOD: new Date(),
        },
      );
      return this.findOne(String(current.ID));
    } catch (err) {
      this.handleWriteError(err);
    }
  }

  async remove(idRaw: string) {
    const current = await this.findOne(idRaw);
    await this.repo.delete({ ID: current.ID });
    return { deleted: true, ID: current.ID };
  }

  private mapRow(row: Record<string, unknown>) {
    return {
      ID: this.toInt(row.ID) ?? 0,
      SUC_DESTINO: this.normalizeText(row.SUC_DESTINO) ?? '',
      SUC_DESTINO_DESC: this.normalizeText(row.SUC_DESTINO_DESC),
      SUC_ORIGEN: this.normalizeText(row.SUC_ORIGEN) ?? '',
      SUC_ORIGEN_DESC: this.normalizeText(row.SUC_ORIGEN_DESC),
      ACTIVO: this.toBool(row.ACTIVO),
      OBSERVACION: this.normalizeText(row.OBSERVACION),
      FCREG: this.normalizeText(row.FCREG),
      FCMOD: this.normalizeText(row.FCMOD),
    };
  }

  private normalizePayload(dto: {
    SUC_DESTINO: string;
    SUC_ORIGEN: string;
    ACTIVO?: boolean;
    OBSERVACION?: string | null;
  }) {
    const destino = this.normalizeUpper(dto.SUC_DESTINO);
    const origen = this.normalizeUpper(dto.SUC_ORIGEN);
    const observacion = this.normalizeText(dto.OBSERVACION);
    const activo = dto.ACTIVO ?? true;
    return {
      SUC_DESTINO: destino,
      SUC_ORIGEN: origen,
      ACTIVO: activo,
      OBSERVACION: observacion,
    };
  }

  private async assertValidPair(destino: string, origen: string) {
    if (!destino) {
      throw new BadRequestException('SUC_DESTINO es requerida');
    }
    if (!origen) {
      throw new BadRequestException('SUC_ORIGEN es requerida');
    }
    if (destino === origen) {
      throw new BadRequestException(
        'SUC_DESTINO y SUC_ORIGEN no pueden ser iguales',
      );
    }
  }

  private async assertUnique(
    destino: string,
    origen: string,
    excludeId?: number,
  ) {
    const qb = this.repo
      .createQueryBuilder('r')
      .select('1')
      .where(
        "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_DESTINO, '')))) = UPPER(:destino)",
        {
          destino,
        },
      )
      .andWhere(
        "UPPER(LTRIM(RTRIM(ISNULL(r.SUC_ORIGEN, '')))) = UPPER(:origen)",
        {
          origen,
        },
      );
    if (excludeId != null) {
      qb.andWhere('r.ID <> :excludeId', { excludeId });
    }
    const exists = await qb.getRawOne();
    if (exists) {
      throw new ConflictException(
        `La relación ${destino} -> ${origen} ya existe en DAT_SUC_COLAB_ACCESO`,
      );
    }
  }

  private handleWriteError(err: unknown): never {
    if (err instanceof QueryFailedError) {
      const raw = this.normalizeText((err as Error).message) ?? '';
      const upper = raw.toUpperCase();
      if (upper.includes('UX_DAT_SUC_COLAB_ACCESO')) {
        throw new ConflictException(
          'La relación destino/origen ya existe en DAT_SUC_COLAB_ACCESO',
        );
      }
      if (
        upper.includes('FK_') ||
        upper.includes('FOREIGN KEY') ||
        upper.includes('CONFLICTED')
      ) {
        throw new BadRequestException(
          'No se pudo guardar la relación porque la sucursal destino u origen no existe',
        );
      }
    }
    throw err as never;
  }

  private parseId(idRaw: string) {
    const parsed = Number(String(idRaw ?? '').trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('ID inválido');
    }
    return Math.trunc(parsed);
  }

  private normalizeText(value: unknown) {
    const text = String(value ?? '').trim();
    return text.length ? text : null;
  }

  private normalizeUpper(value: unknown) {
    return this.normalizeText(value)?.toUpperCase() ?? '';
  }

  private toInt(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    const parsed = Number(String(value).trim());
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  private toBool(value: unknown) {
    if (value == null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'si';
  }
}
