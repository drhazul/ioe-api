import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ApplyPromocionesDto } from './dto/apply-promociones.dto';
import { CreateCatalogOptionDto } from './dto/create-catalog-option.dto';
import { CreatePromocionBeneficioDto } from './dto/create-promocion-beneficio.dto';
import { CreatePromocionCriterioDto } from './dto/create-promocion-criterio.dto';
import { CreatePromocionDto } from './dto/create-promocion.dto';
import { ReordenarPrioridadDto } from './dto/reordenar-prioridad.dto';
import { SavePromoConfigDto } from './dto/save-promo-config.dto';
import { UpdatePromocionBeneficioDto } from './dto/update-promocion-beneficio.dto';
import { UpdatePromocionCriterioDto } from './dto/update-promocion-criterio.dto';
import { UpdatePromocionDto } from './dto/update-promocion.dto';

type PromoQuery = {
  includeInactive?: string;
  suc?: string;
  tipo?: string;
  search?: string;
};

type PromoEvalRow = {
  id: string;
  idfol: string;
  art: string | null;
  upc: string | null;
  pvtat: number;
  idProm: number;
  descPromo: string | null;
  tProm: string | null;
  idBeneficio: number;
  tBeneficio: string;
  prcDesc: number | null;
  impDesc: number | null;
  artGratis: string | null;
  upcGratis: string | null;
  cantGratis: number | null;
  precioGratis: number | null;
  prioridad: number;
  acumulable: number;
};

type PromoLegacyAggregate = {
  tipo: string;
  total: number;
};

type CatalogKind = 'T_PROM' | 'TIPO_DESC' | 'T_BENEFICIO';

type ArticuloCatalogQuery = {
  suc?: string;
  depa?: string;
  subd?: string;
  clas?: string;
  scla?: string;
  scla2?: string;
  guia?: string;
  search?: string;
};

type ApplyPromocionesLineaOptions = {
  generarGratis?: boolean;
};

@Injectable()
export class PromocionesService {
  private static readonly PROMO_GESTION_MODULE_CODES = ['PV_PROMO_GES'];
  private static readonly GESTION_ROLE_CODES = new Set([
    'ADMIN',
    'JEFOPE',
    'JEFOPER',
    'JEFE_OPERACIONES',
    'JEFOPERACIONES',
    'SUPERPV',
    'SUPERVISOR',
    'SUPERVP',
  ]);

  private parseIds(...values: Array<string | undefined>) {
    const out: number[] = [];
    for (const value of values) {
      if (!value) continue;
      for (const part of value.split(',')) {
        const n = Number(part.trim());
        if (Number.isFinite(n)) out.push(n);
      }
    }
    return out;
  }

  constructor(private readonly dataSource: DataSource) {}

  async findAll(query?: PromoQuery, user?: JwtPayload) {
    await this.ensurePromoCabColumns();
    const allowedSucs = await this.resolvePromoGestionAllowedSucs(user);
    const userId = this.resolveAccessUserId(user);

    const includeInactive = this.toBool(query?.includeInactive);
    const where: string[] = [];
    const params: unknown[] = [];

    if (!includeInactive) {
      where.push('(ISNULL(TRY_CONVERT(INT, EST), 1) IN (1, -1))');
    }

    const suc = this.normalizeText(query?.suc);
    if (suc) {
      where.push(`UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @${params.length}`);
      params.push(suc.toUpperCase());
    }

    if (allowedSucs.length) {
      const rules = allowedSucs
        .map(
          (s) =>
            `CHARINDEX(',${s},', ',' + REPLACE(REPLACE(UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))), ' ', ''), ';', ',') + ',') > 0`,
        )
        .join(' OR ');
      const ownDraftRule = `(
        (LTRIM(RTRIM(ISNULL(SUC, ''))) = '' OR LTRIM(RTRIM(ISNULL(SUC, ''))) = '*')
        AND ISNULL(TRY_CONVERT(INT, CREADO_POR), 0) = @${params.length}
      )`;
      params.push(userId > 0 ? userId : -1);
      where.push(
        `(${ownDraftRule} OR ${rules})`,
      );
    }

    const tipo = this.normalizeText(query?.tipo);
    if (tipo) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(T_PROM, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(TIPO_DESC, '')))) LIKE @${params.length})`,
      );
      params.push(`%${tipo.toUpperCase()}%`);
    }

    const search = this.normalizeText(query?.search);
    if (search) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(DESC_PROMO, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(DETALLE_PROMO, '')))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        ID_PROM,
        SUC,
        T_PROM,
        TIPO_DESC,
        FCN_INI,
        FCN_TER,
        DESC_PROMO,
        IMP_COM,
        IMP_DESC,
        PRC_DESC,
        ALCANCE,
        DETALLE_PROMO,
        EST,
        REG_CLIENTE,
        ACUMULABLE,
        COMBINABLE,
        F_PGO,
        PRIORIDAD,
        MAX_APLI_FOLIO,
        CREADO_POR,
        FCNR,
        MOD_POR,
        FCMOD
      FROM dbo.PROMO_CAB
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ISNULL(PRIORIDAD, 100) ASC, ID_PROM DESC
      `,
      params,
    );

    return (rows ?? []).map((row) => this.mapPromoRow(row));
  }

  async findOne(idPromRaw: string, user?: JwtPayload) {
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.ensurePromoCabColumns();
    await this.assertPromoScopeAccess(idProm, user);
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        ID_PROM,
        SUC,
        T_PROM,
        TIPO_DESC,
        FCN_INI,
        FCN_TER,
        DESC_PROMO,
        IMP_COM,
        IMP_DESC,
        PRC_DESC,
        ALCANCE,
        DETALLE_PROMO,
        EST,
        REG_CLIENTE,
        ACUMULABLE,
        COMBINABLE,
        F_PGO,
        PRIORIDAD,
        MAX_APLI_FOLIO,
        CREADO_POR,
        FCNR,
        MOD_POR,
        FCMOD
      FROM dbo.PROMO_CAB
      WHERE ID_PROM = @0
      `,
      [idProm],
    );
    if (!rows?.length) {
      throw new NotFoundException(`PROMO_CAB ${idProm} no existe`);
    }
    return this.mapPromoRow(rows[0]);
  }

  async listSucursales(user?: JwtPayload) {
    const allowedSucs = await this.resolvePromoGestionAllowedSucs(user);
    const rows = await this.dataSource.query(
      `
      SELECT
        LTRIM(RTRIM(ISNULL(SUC, ''))) AS SUC,
        LTRIM(RTRIM(ISNULL([DESC], ''))) AS DESCRIPCION
      FROM dbo.DAT_SUC
      WHERE LTRIM(RTRIM(ISNULL(SUC, ''))) <> ''
      ORDER BY SUC ASC
      `,
    );
    const mapped = (rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        suc: this.normalizeText(r.SUC),
        descripcion: this.normalizeText(r.DESCRIPCION),
      };
    });
    const filtered = allowedSucs.length
      ? mapped.filter((row) => allowedSucs.includes(this.normalizeUpper(row.suc)))
      : mapped;
    return [
      ...(allowedSucs.length ? [] : [{ suc: '*', descripcion: 'TODAS' }]),
      ...filtered.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          suc: this.normalizeText(r.suc),
          descripcion: this.normalizeText(r.descripcion),
        };
      }),
    ];
  }

  async listClientes(sucRaw?: string, searchRaw?: string, user?: JwtPayload) {
    const allowedSucs = await this.resolvePromoGestionAllowedSucs(user);
    const suc = this.normalizeText(sucRaw);
    this.assertRequestedSucWithinAllowed(suc, allowedSucs);
    const search = this.normalizeText(searchRaw);
    const where: string[] = [
      "TRY_CONVERT(INT, ISNULL(ESTATUS, 0)) = 0",
      'TRY_CONVERT(BIGINT, IDC) IS NOT NULL',
      'TRY_CONVERT(BIGINT, IDC) > 0',
    ];
    const params: unknown[] = [];
    if (suc) {
      where.push(`UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = @${params.length}`);
      params.push(suc.toUpperCase());
    }
    if (search) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(RazonSocialReceptor, '')))) LIKE @${params.length} OR LTRIM(RTRIM(CONVERT(NVARCHAR(40), IDC))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }

    const rows = await this.dataSource.query(
      `
      ;WITH base AS (
        SELECT
          TRY_CONVERT(BIGINT, IDC) AS CLIENTE,
          LTRIM(RTRIM(ISNULL(RazonSocialReceptor, ''))) AS NOMBRE,
          LTRIM(RTRIM(ISNULL(SUC, ''))) AS SUC
        FROM dbo.FACT_CLIENT_SHP
        WHERE ${where.join(' AND ')}
      ),
      dedup AS (
        SELECT
          CLIENTE,
          NOMBRE,
          SUC,
          ROW_NUMBER() OVER (
            PARTITION BY CLIENTE
            ORDER BY NOMBRE ASC, SUC ASC
          ) AS RN
        FROM base
        WHERE CLIENTE IS NOT NULL AND CLIENTE > 0
      )
      SELECT
        CLIENTE,
        NOMBRE,
        SUC
      FROM dedup
      WHERE RN = 1
      ORDER BY NOMBRE ASC, CLIENTE ASC
      `,
      params,
    );
    return (rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        cliente: this.toInt(r.CLIENTE) ?? 0,
        nombre: this.normalizeText(r.NOMBRE),
        suc: this.normalizeText(r.SUC),
      };
    });
  }

  async listCatalog(kind: CatalogKind) {
    await this.ensureConfigTables();
    const table = this.resolveCatalogTable(kind);
    const rows = await this.dataSource.query(
      `
      SELECT CLAVE, DESCRIPCION, EST
      FROM ${table}
      WHERE ISNULL(EST, 1) = 1
      ORDER BY CLAVE ASC
      `,
    );
    return (rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        clave: this.normalizeText(r.CLAVE),
        descripcion: this.normalizeText(r.DESCRIPCION),
        est: this.toInt(r.EST) ?? 1,
      };
    });
  }

  async createCatalogOption(kind: CatalogKind, dto: CreateCatalogOptionDto, user: JwtPayload) {
    await this.assertGestionAccess(user);
    await this.ensureConfigTables();
    const table = this.resolveCatalogTable(kind);
    const clave = this.normalizeUpper(dto.clave);
    const descripcion = this.normalizeText(dto.descripcion);
    if (!clave || !descripcion) {
      throw new BadRequestException('clave y descripcion son requeridos');
    }
    await this.dataSource.query(
      `
      IF NOT EXISTS (SELECT 1 FROM ${table} WHERE CLAVE = @0)
      BEGIN
        INSERT INTO ${table} (CLAVE, DESCRIPCION, EST, FCNR)
        VALUES (@0, @1, 1, GETDATE())
      END
      `,
      [clave, descripcion],
    );
    return this.listCatalog(kind);
  }

  async listDepa(sucRaw?: string) {
    const suc = this.normalizeText(sucRaw);
    const params: unknown[] = [];
    const filter =
      suc && suc !== '*'
        ? `WHERE EXISTS (
            SELECT 1
            FROM dbo.DAT_ART a
            WHERE a.DEPA = d.DEPA
              AND UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @0
          )`
        : '';
    if (suc && suc !== '*') params.push(suc.toUpperCase());
    const rows = await this.dataSource.query(
      `
      SELECT d.DEPA, LTRIM(RTRIM(ISNULL(d.DDEPA, ''))) AS DESCRIPCION
      FROM dbo.JRQ_DEPA d
      ${filter}
      ORDER BY d.DEPA ASC
      `,
      params,
    );
    return (rows ?? []).map((row) => this.mapCatalogNum(row, 'DEPA'));
  }

  async listSubd(depaRaw?: string) {
    const depa = this.parseMultiNumbers(depaRaw);
    const rows = depa.length
      ? await this.dataSource.query(
          `
          SELECT s.SUBD, LTRIM(RTRIM(ISNULL(s.DSUBD, ''))) AS DESCRIPCION, s.DEPA
          FROM dbo.JRQ_SUBD s
          WHERE s.DEPA IN (${depa.map((_, i) => `@${i}`).join(', ')})
          ORDER BY s.SUBD ASC
          `,
          depa,
        )
      : await this.dataSource.query(
          `
          SELECT s.SUBD, LTRIM(RTRIM(ISNULL(s.DSUBD, ''))) AS DESCRIPCION, s.DEPA
          FROM dbo.JRQ_SUBD s
          ORDER BY s.SUBD ASC
          `,
        );
    return (rows ?? []).map((row) => this.mapCatalogNum(row, 'SUBD'));
  }

  async listClas(subdRaw?: string) {
    const subd = this.parseMultiNumbers(subdRaw);
    const rows = subd.length
      ? await this.dataSource.query(
          `
          SELECT c.CLAS, LTRIM(RTRIM(ISNULL(c.DCLAS, ''))) AS DESCRIPCION, c.SUBD
          FROM dbo.JRQ_CLAS c
          WHERE c.SUBD IN (${subd.map((_, i) => `@${i}`).join(', ')})
          ORDER BY c.CLAS ASC
          `,
          subd,
        )
      : await this.dataSource.query(
          `
          SELECT c.CLAS, LTRIM(RTRIM(ISNULL(c.DCLAS, ''))) AS DESCRIPCION, c.SUBD
          FROM dbo.JRQ_CLAS c
          ORDER BY c.CLAS ASC
          `,
        );
    return (rows ?? []).map((row) => this.mapCatalogNum(row, 'CLAS'));
  }

  async listScla(clasRaw?: string) {
    const clas = this.parseMultiNumbers(clasRaw);
    const rows = clas.length
      ? await this.dataSource.query(
          `
          SELECT s.SCLA, LTRIM(RTRIM(ISNULL(s.DSCLA, ''))) AS DESCRIPCION, s.CLAS
          FROM dbo.JRQ_SCLA s
          WHERE s.CLAS IN (${clas.map((_, i) => `@${i}`).join(', ')})
          ORDER BY s.SCLA ASC
          `,
          clas,
        )
      : await this.dataSource.query(
          `
          SELECT s.SCLA, LTRIM(RTRIM(ISNULL(s.DSCLA, ''))) AS DESCRIPCION, s.CLAS
          FROM dbo.JRQ_SCLA s
          ORDER BY s.SCLA ASC
          `,
        );
    return (rows ?? []).map((row) => this.mapCatalogNum(row, 'SCLA'));
  }

  async listScla2(sclaRaw?: string) {
    const scla = this.parseMultiNumbers(sclaRaw);
    const rows = scla.length
      ? await this.dataSource.query(
          `
          SELECT s.SCLA2, LTRIM(RTRIM(ISNULL(s.DSCLA2, ''))) AS DESCRIPCION, s.SCLA
          FROM dbo.JRQ_SCLA2 s
          WHERE s.SCLA IN (${scla.map((_, i) => `@${i}`).join(', ')})
          ORDER BY s.SCLA2 ASC
          `,
          scla,
        )
      : await this.dataSource.query(
          `
          SELECT s.SCLA2, LTRIM(RTRIM(ISNULL(s.DSCLA2, ''))) AS DESCRIPCION, s.SCLA
          FROM dbo.JRQ_SCLA2 s
          ORDER BY s.SCLA2 ASC
          `,
        );
    return (rows ?? []).map((row) => this.mapCatalogNum(row, 'SCLA2'));
  }

  async listGuia(scla2Raw?: string) {
    const scla2 = this.parseMultiNumbers(scla2Raw);
    const rows = scla2.length
      ? await this.dataSource.query(
          `
          SELECT g.GUIA, LTRIM(RTRIM(ISNULL(g.DESCORT, ''))) AS DESCRIPCION, g.SCLA2
          FROM dbo.JRQ_GUIA g
          WHERE g.SCLA2 IN (${scla2.map((_, i) => `@${i}`).join(', ')})
          ORDER BY g.GUIA ASC
          `,
          scla2,
        )
      : await this.dataSource.query(
          `
          SELECT g.GUIA, LTRIM(RTRIM(ISNULL(g.DESCORT, ''))) AS DESCRIPCION, g.SCLA2
          FROM dbo.JRQ_GUIA g
          ORDER BY g.GUIA ASC
          `,
        );
    return (rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        valor: this.normalizeText(r.GUIA),
        descripcion: this.normalizeText(r.DESCRIPCION),
      };
    });
  }

  async listArticulos(query: ArticuloCatalogQuery, user?: JwtPayload) {
    const allowedSucs = await this.resolvePromoGestionAllowedSucs(user);
    const where: string[] = ["LTRIM(RTRIM(ISNULL(a.ART, ''))) <> ''"];
    const params: unknown[] = [];
    const addEq = (expr: string, val?: string) => {
      const text = this.normalizeText(val);
      if (!text) return;
      where.push(`${expr} = @${params.length}`);
      params.push(text.toUpperCase());
    };
    const sucVals = this.parseMultiTexts(query.suc).map((x) => x.toUpperCase());
    for (const suc of sucVals) {
      this.assertRequestedSucWithinAllowed(suc, allowedSucs);
    }
    if (sucVals.length) {
      const placeholders = sucVals.map((_, i) => `@${params.length + i}`).join(', ');
      where.push(`UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) IN (${placeholders})`);
      params.push(...sucVals);
    } else if (allowedSucs.length) {
      const placeholders = allowedSucs
        .map((_, i) => `@${params.length + i}`)
        .join(', ');
      where.push(`UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) IN (${placeholders})`);
      params.push(...allowedSucs);
    }

    const addInFloat = (col: string, raw?: string) => {
      const values = this.parseMultiNumbers(raw);
      if (!values.length) return;
      const placeholders = values.map((_, i) => `@${params.length + i}`).join(', ');
      where.push(`${col} IN (${placeholders})`);
      params.push(...values);
    };
    addInFloat('a.DEPA', query.depa);
    addInFloat('a.SUBD', query.subd);
    addInFloat('a.CLAS', query.clas);
    addInFloat('a.SCLA', query.scla);
    addInFloat('a.SCLA2', query.scla2);

    const guiaVals = this.parseMultiTexts(query.guia);
    if (guiaVals.length) {
      const placeholders = guiaVals.map((_, i) => `@${params.length + i}`).join(', ');
      where.push(`UPPER(LTRIM(RTRIM(ISNULL(j.GUIA, '')))) IN (${placeholders})`);
      params.push(...guiaVals.map((x) => x.toUpperCase()));
    }

    const search = this.normalizeText(query.search);
    if (search) {
      where.push(
        `(UPPER(LTRIM(RTRIM(ISNULL(a.ART, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(a.UPC, '')))) LIKE @${params.length} OR UPPER(LTRIM(RTRIM(ISNULL(a.DES, '')))) LIKE @${params.length})`,
      );
      params.push(`%${search.toUpperCase()}%`);
    }

    const rows = await this.dataSource.query(
      `
      ;WITH base AS (
        SELECT
          LTRIM(RTRIM(ISNULL(a.ART, ''))) AS ART,
          LTRIM(RTRIM(ISNULL(a.UPC, ''))) AS UPC,
          LTRIM(RTRIM(ISNULL(a.DES, ''))) AS DESCRIPCION,
          TRY_CONVERT(INT, a.DEPA) AS DEPA,
          TRY_CONVERT(INT, a.SUBD) AS SUBD,
          TRY_CONVERT(INT, a.CLAS) AS CLAS,
          TRY_CONVERT(INT, a.SCLA) AS SCLA,
          TRY_CONVERT(INT, a.SCLA2) AS SCLA2,
          LTRIM(RTRIM(ISNULL(j.GUIA, ''))) AS GUIA,
          ROW_NUMBER() OVER (
            PARTITION BY LTRIM(RTRIM(ISNULL(a.ART, ''))), LTRIM(RTRIM(ISNULL(a.UPC, '')))
            ORDER BY LTRIM(RTRIM(ISNULL(a.SUC, ''))) ASC
          ) AS RN
        FROM dbo.DAT_ART a
        OUTER APPLY (
          SELECT TOP 1 d.GUIA
          FROM dbo.DAT_DET_JRQ_SVR d
          WHERE LTRIM(RTRIM(ISNULL(d.ART, ''))) = LTRIM(RTRIM(ISNULL(a.ART, '')))
            AND (
              LTRIM(RTRIM(ISNULL(d.SUC, ''))) = LTRIM(RTRIM(ISNULL(a.SUC, '')))
              OR LTRIM(RTRIM(ISNULL(d.SUC, ''))) = ''
            )
          ORDER BY CASE WHEN LTRIM(RTRIM(ISNULL(d.SUC, ''))) = LTRIM(RTRIM(ISNULL(a.SUC, ''))) THEN 0 ELSE 1 END
        ) j
        WHERE ${where.join(' AND ')}
      )
      SELECT TOP 300
        ART, UPC, DESCRIPCION, DEPA, SUBD, CLAS, SCLA, SCLA2, GUIA
      FROM base
      WHERE RN = 1
      ORDER BY ART ASC, UPC ASC
      `,
      params,
    );
    return (rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        art: this.normalizeText(r.ART),
        upc: this.normalizeText(r.UPC),
        descripcion: this.normalizeText(r.DESCRIPCION),
        depa: this.toInt(r.DEPA),
        subd: this.toInt(r.SUBD),
        clas: this.toInt(r.CLAS),
        scla: this.toInt(r.SCLA),
        scla2: this.toInt(r.SCLA2),
        guia: this.normalizeText(r.GUIA),
      };
    });
  }

  async create(dto: CreatePromocionDto, user: JwtPayload) {
    await this.assertGestionAccess(user);
    await this.ensurePromoCabColumns();

    const data = this.normalizePromoPayload(dto);
    if (data.SUC !== undefined) {
      const allowedSucs = await this.resolvePromoGestionAllowedSucs(user);
      this.assertPromoSucTextWithinAllowed(data.SUC, allowedSucs);
    }
    const userId = this.resolveAccessUserId(user) || null;
    const requestedPriority = this.toNullableInt(data.PRIORIDAD);
    const maxPriority = await this.getMaxPromoPriority();
    data.PRIORIDAD = maxPriority + 1;
    const idProm = await this.insertPromoCab(data, userId);
    if (requestedPriority != null && requestedPriority > 0) {
      await this.reorderPromoPriority(idProm, requestedPriority, userId);
    }
    return this.findOne(String(idProm), user);
  }

  async update(idPromRaw: string, dto: UpdatePromocionDto, user: JwtPayload) {
    await this.assertGestionAccess(user);
    await this.ensurePromoCabColumns();
    const userId = this.resolveAccessUserId(user) || null;
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);

    const sets: string[] = [];
    const params: unknown[] = [];
    const addSet = (column: string, value: unknown) => {
      sets.push(`${column} = @${params.length}`);
      params.push(value);
    };

    const normalized = this.normalizePromoPayload(dto);
    const allowedSucs = await this.resolvePromoGestionAllowedSucs(user);
    if (normalized.SUC !== undefined) {
      this.assertPromoSucTextWithinAllowed(normalized.SUC, allowedSucs);
    }
    const requestedPriority =
      normalized.PRIORIDAD === undefined ? undefined : this.toNullableInt(normalized.PRIORIDAD);
    normalized.PRIORIDAD = undefined;
    this.patchPromoSets(sets, params, normalized);

    addSet('MOD_POR', userId);
    sets.push('FCMOD = GETDATE()');

    if (!sets.length) return this.findOne(String(idProm), user);

    params.push(idProm);
    await this.dataSource.query(
      `
      UPDATE dbo.PROMO_CAB
      SET ${sets.join(', ')}
      WHERE ID_PROM = @${params.length - 1}
      `,
      params,
    );

    if (requestedPriority != null && requestedPriority > 0) {
      await this.reorderPromoPriority(idProm, requestedPriority, userId);
    }

    return this.findOne(String(idProm), user);
  }

  async remove(idPromRaw: string, user: JwtPayload) {
    await this.assertGestionAccess(user);
    await this.ensurePromoCabColumns();
    const userId = this.resolveAccessUserId(user) || null;
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);

    await this.dataSource.query(
      `
      UPDATE dbo.PROMO_CAB
      SET EST = 0, MOD_POR = @0, FCMOD = GETDATE()
      WHERE ID_PROM = @1
      `,
      [userId, idProm],
    );

    return { deleted: true, idProm };
  }

  async removeHard(idPromRaw: string, user: JwtPayload) {
    this.assertAdminOnly(user);
    await this.ensurePromoCabColumns();
    const userId = this.resolveAccessUserId(user) || null;
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.ensurePromoExists(idProm);

    const hasConfig = await this.tableExists('dbo.PROMO_CONFIG');
    const hasCriterio = await this.tableExists('dbo.PROMO_REGLA_CRITERIO');
    const hasBeneficio = await this.tableExists('dbo.PROMO_REGLA_BENEFICIO');
    const hasDescApli = await this.tableExists('dbo.PROMO_TICKET_DESC_APLI');
    const hasGratisRel = await this.tableExists('dbo.PROMO_TICKET_GRATIS_REL');
    const hasGratisDet = await this.tableExists('dbo.PROMO_TICKET_GRATIS_DET');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      if (hasGratisDet && hasGratisRel) {
        await qr.query(
          `
          DELETE d
          FROM dbo.PROMO_TICKET_GRATIS_DET d
          INNER JOIN dbo.PROMO_TICKET_GRATIS_REL r
            ON r.ID_REL = d.ID_REL
          WHERE r.IDDESC = @0
          `,
          [idProm],
        );
      }
      if (hasGratisRel) {
        await qr.query(`DELETE FROM dbo.PROMO_TICKET_GRATIS_REL WHERE IDDESC = @0`, [idProm]);
      }
      if (hasDescApli) {
        await qr.query(`DELETE FROM dbo.PROMO_TICKET_DESC_APLI WHERE IDDESC = @0`, [idProm]);
      }
      if (hasConfig) {
        await qr.query(`DELETE FROM dbo.PROMO_CONFIG WHERE ID_PROM = @0`, [idProm]);
      }
      if (hasCriterio) {
        await qr.query(`DELETE FROM dbo.PROMO_REGLA_CRITERIO WHERE ID_PROM = @0`, [idProm]);
      }
      if (hasBeneficio) {
        await qr.query(`DELETE FROM dbo.PROMO_REGLA_BENEFICIO WHERE ID_PROM = @0`, [idProm]);
      }

      await qr.query(`DELETE FROM dbo.PROMO_CAB WHERE ID_PROM = @0`, [idProm]);
      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }

    return { deleted: true, hard: true, idProm, modPor: userId };
  }

  async getConfig(idPromRaw: string, user?: JwtPayload) {
    await this.ensureConfigTables();
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 *
      FROM dbo.PROMO_CONFIG
      WHERE ID_PROM = @0
      `,
      [idProm],
    );
    const row = rows?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapPromoConfigRow(row);
  }

  async saveConfig(idPromRaw: string, dto: SavePromoConfigDto, user: JwtPayload) {
    await this.assertGestionAccess(user);
    await this.ensureConfigTables();
    const userId = (await this.resolveAccessUserIdWithFallback(user)) || null;
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);

    const tBeneficio = this.normalizeUpper(dto.T_BENEFICIO);
    if (!tBeneficio) throw new BadRequestException('T_BENEFICIO es requerido');
    const hasArt = (dto.ART_LIST ?? []).some((x) => this.normalizeText(x).length > 0);
    const hasUpc = (dto.UPC_LIST ?? []).some((x) => this.normalizeText(x).length > 0);
    if (hasArt && hasUpc) {
      throw new BadRequestException('Selecciona ART o UPC, no ambos');
    }

    const sucTodas = dto.SUC_TODAS !== false;
    const sucList = sucTodas ? [] : this.sanitizeTextList(dto.SUC_LIST, true);
    const allowedSucs = await this.resolvePromoGestionAllowedSucs(user);
    if (sucTodas) {
      this.assertPromoSucTextWithinAllowed('*', allowedSucs);
    } else {
      this.assertRequestedSucsWithinAllowed(sucList, allowedSucs);
    }
    const clienteRaw = this.toNullableNumber(dto.CLIENTE);
    const cliente = clienteRaw != null && clienteRaw > 0 ? clienteRaw : null;
    if (cliente != null && sucTodas) {
      throw new BadRequestException('CLIENTE requiere una sola sucursal');
    }
    if (cliente != null && sucList.length !== 1) {
      throw new BadRequestException('CLIENTE solo puede configurarse con una sucursal');
    }

    const depaList = this.sanitizeNumberList(dto.DEPA_LIST);
    const subdList = this.sanitizeNumberList(dto.SUBD_LIST);
    const clasList = this.sanitizeNumberList(dto.CLAS_LIST);
    const sclaList = this.sanitizeNumberList(dto.SCLA_LIST);
    const scla2List = this.sanitizeNumberList(dto.SCLA2_LIST);
    const guiaList = this.sanitizeTextList(dto.GUIA_LIST, true);
    const artList = this.sanitizeTextList(dto.ART_LIST, true);
    const upcList = this.sanitizeTextList(dto.UPC_LIST, true);

    const prcDesc = this.toNullableNumber(dto.PRC_DESC);
    const impDesc = this.toNullableMoney(dto.IMP_DESC);
    const precioGratis = this.toNullableMoney(dto.PRECIO_GRATIS);
    if (tBeneficio === 'PORCENTAJE') {
      if (prcDesc == null) throw new BadRequestException('PRC_DESC es requerido');
    } else if (tBeneficio === 'IMP_FIJO') {
      if (impDesc == null) throw new BadRequestException('IMP_DESC es requerido');
    } else if (tBeneficio === 'ART_GRATIS') {
      if (precioGratis == null) {
        throw new BadRequestException('PRECIO_GRATIS es requerido para ART_GRATIS');
      }
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const existingRows = await qr.query(
        `SELECT TOP 1 ID_CONFIG FROM dbo.PROMO_CONFIG WHERE ID_PROM = @0`,
        [idProm],
      );
      const idConfig = this.toInt((existingRows?.[0] as Record<string, unknown>)?.ID_CONFIG);
      const payload = [
        idProm,
        tBeneficio,
        prcDesc,
        impDesc,
        sucTodas ? 1 : 0,
        sucList.join(','),
        cliente,
        depaList.join(','),
        subdList.join(','),
        clasList.join(','),
        sclaList.join(','),
        scla2List.join(','),
        guiaList.join(','),
        artList.join(','),
        upcList.join(','),
        precioGratis,
        dto.ACTIVO == null ? 1 : Math.trunc(dto.ACTIVO),
        userId,
      ];
      if (idConfig == null) {
        await qr.query(
          `
          INSERT INTO dbo.PROMO_CONFIG (
            ID_PROM, T_BENEFICIO, PRC_DESC, IMP_DESC, SUC_TODAS, SUC_LIST, CLIENTE,
            DEPA_LIST, SUBD_LIST, CLAS_LIST, SCLA_LIST, SCLA2_LIST, GUIA_LIST,
            ART_LIST, UPC_LIST, PRECIO_GRATIS, ACTIVO, MOD_POR, FCMOD
          )
          VALUES (
            @0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14, @15, @16, @17, GETDATE()
          )
          `,
          payload,
        );
      } else {
        await qr.query(
          `
          UPDATE dbo.PROMO_CONFIG
          SET
            T_BENEFICIO = @1,
            PRC_DESC = @2,
            IMP_DESC = @3,
            SUC_TODAS = @4,
            SUC_LIST = @5,
            CLIENTE = @6,
            DEPA_LIST = @7,
            SUBD_LIST = @8,
            CLAS_LIST = @9,
            SCLA_LIST = @10,
            SCLA2_LIST = @11,
            GUIA_LIST = @12,
            ART_LIST = @13,
            UPC_LIST = @14,
            PRECIO_GRATIS = @15,
            ACTIVO = @16,
            MOD_POR = @17,
            FCMOD = GETDATE()
          WHERE ID_PROM = @0
          `,
          payload,
        );
      }

      await this.syncLegacyRulesFromConfig(qr, idProm, {
        tBeneficio,
        prcDesc,
        impDesc,
        precioGratis,
        sucTodas,
        sucList,
        cliente,
        depaList,
        subdList,
        clasList,
        sclaList,
        scla2List,
        guiaList,
        artList,
        upcList,
      });

      await qr.query(
        `
        UPDATE dbo.PROMO_CAB
        SET
          SUC = @1,
          TIPO_DESC = @2,
          PRC_DESC = @3,
          IMP_DESC = @4,
          MOD_POR = @5,
          FCMOD = GETDATE()
        WHERE ID_PROM = @0
        `,
        [
          idProm,
          sucTodas ? '*' : sucList.join(','),
          tBeneficio === 'PORCENTAJE'
              ? 'PORCENTAJE'
              : tBeneficio === 'IMP_FIJO'
                  ? 'IMP_FIJO'
                  : 'ART_GRATIS',
          prcDesc,
          impDesc,
          userId,
        ],
      );

      await qr.commitTransaction();
    } catch (error) {
      const originalError = error;
      if (qr.isTransactionActive) {
        try {
          await qr.rollbackTransaction();
        } catch {
          // Si SQL Server ya abortó la transacción, conservamos el error original.
        }
      }
      if (
        originalError instanceof BadRequestException ||
        originalError instanceof ConflictException ||
        originalError instanceof NotFoundException ||
        originalError instanceof ForbiddenException
      ) {
        throw originalError;
      }
      const sqlMessage = this.extractSqlMessage(originalError);
      if (sqlMessage) {
        throw new ConflictException(
          `No se pudo guardar configuración de promoción: ${sqlMessage}`,
        );
      }
      throw originalError;
    } finally {
      await qr.release();
    }

    return this.getConfig(String(idProm));
  }

  async reordenarPrioridad(
    idPromRaw: string,
    dto: ReordenarPrioridadDto,
    user: JwtPayload,
  ) {
    await this.assertGestionAccess(user);
    const userId = this.resolveAccessUserId(user) || null;
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);
    const target = this.toInt(dto.prioridad);
    if (target == null || target <= 0) {
      throw new BadRequestException('prioridad inválida');
    }
    await this.reorderPromoPriority(idProm, target, userId);
    return this.findOne(String(idProm), user);
  }

  async listCriterios(idPromRaw: string, user?: JwtPayload) {
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);
    await this.ensureTableExists('dbo.PROMO_REGLA_CRITERIO');

    const rows = await this.dataSource.query(
      `
      SELECT
        ID_CRITERIO, ID_PROM, SUC, CLIENTE, DEPA, SUBD, CLAS, SCLA, SCLA2,
        GUIA, ART, UPC, EST, FCNR
      FROM dbo.PROMO_REGLA_CRITERIO
      WHERE ID_PROM = @0
      ORDER BY ID_CRITERIO ASC
      `,
      [idProm],
    );
    return rows ?? [];
  }

  async createCriterio(
    idPromRaw: string,
    dto: CreatePromocionCriterioDto,
    user: JwtPayload,
  ) {
    await this.assertGestionAccess(user);
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);
    await this.ensureTableExists('dbo.PROMO_REGLA_CRITERIO');

    const params = [
      idProm,
      this.normalizeNullableText(dto.SUC),
      this.toNullableNumber(dto.CLIENTE),
      this.toNullableNumber(dto.DEPA),
      this.toNullableNumber(dto.SUBD),
      this.toNullableNumber(dto.CLAS),
      this.toNullableNumber(dto.SCLA),
      this.toNullableNumber(dto.SCLA2),
      this.normalizeNullableText(dto.GUIA),
      this.normalizeNullableText(dto.ART),
      this.normalizeNullableText(dto.UPC),
      dto.EST == null ? 1 : Math.trunc(dto.EST),
    ];

    await this.dataSource.query(
      `
      INSERT INTO dbo.PROMO_REGLA_CRITERIO (
        ID_PROM, SUC, CLIENTE, DEPA, SUBD, CLAS, SCLA, SCLA2, GUIA, ART, UPC, EST
      )
      VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11)
      `,
      params,
    );

    return this.listCriterios(String(idProm));
  }

  async updateCriterio(
    idCriterioRaw: string,
    dto: UpdatePromocionCriterioDto,
    user: JwtPayload,
  ) {
    await this.assertGestionAccess(user);
    await this.ensureTableExists('dbo.PROMO_REGLA_CRITERIO');
    const idCriterio = this.parseBigIntStrict(idCriterioRaw, 'idCriterio');
    const idProm = await this.ensureCriterioExists(idCriterio);
    await this.assertPromoScopeAccess(idProm, user);

    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = @${params.length}`);
      params.push(val);
    };

    if (dto.SUC !== undefined) add('SUC', this.normalizeNullableText(dto.SUC));
    if (dto.CLIENTE !== undefined) add('CLIENTE', this.toNullableNumber(dto.CLIENTE));
    if (dto.DEPA !== undefined) add('DEPA', this.toNullableNumber(dto.DEPA));
    if (dto.SUBD !== undefined) add('SUBD', this.toNullableNumber(dto.SUBD));
    if (dto.CLAS !== undefined) add('CLAS', this.toNullableNumber(dto.CLAS));
    if (dto.SCLA !== undefined) add('SCLA', this.toNullableNumber(dto.SCLA));
    if (dto.SCLA2 !== undefined) add('SCLA2', this.toNullableNumber(dto.SCLA2));
    if (dto.GUIA !== undefined) add('GUIA', this.normalizeNullableText(dto.GUIA));
    if (dto.ART !== undefined) add('ART', this.normalizeNullableText(dto.ART));
    if (dto.UPC !== undefined) add('UPC', this.normalizeNullableText(dto.UPC));
    if (dto.EST !== undefined) add('EST', Math.trunc(dto.EST));

    if (!sets.length) {
      return this.dataSource.query(
        `SELECT TOP 1 * FROM dbo.PROMO_REGLA_CRITERIO WHERE ID_CRITERIO = @0`,
        [idCriterio],
      );
    }

    params.push(idCriterio);
    await this.dataSource.query(
      `
      UPDATE dbo.PROMO_REGLA_CRITERIO
      SET ${sets.join(', ')}
      WHERE ID_CRITERIO = @${params.length - 1}
      `,
      params,
    );

    const rows = await this.dataSource.query(
      `SELECT TOP 1 * FROM dbo.PROMO_REGLA_CRITERIO WHERE ID_CRITERIO = @0`,
      [idCriterio],
    );
    return rows?.[0] ?? null;
  }

  async removeCriterio(idCriterioRaw: string, user: JwtPayload) {
    await this.assertGestionAccess(user);
    await this.ensureTableExists('dbo.PROMO_REGLA_CRITERIO');
    const idCriterio = this.parseBigIntStrict(idCriterioRaw, 'idCriterio');
    const idProm = await this.ensureCriterioExists(idCriterio);
    await this.assertPromoScopeAccess(idProm, user);
    await this.dataSource.query(
      `DELETE FROM dbo.PROMO_REGLA_CRITERIO WHERE ID_CRITERIO = @0`,
      [idCriterio],
    );
    return { deleted: true, idCriterio };
  }

  async listBeneficios(idPromRaw: string, user?: JwtPayload) {
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);
    await this.ensureTableExists('dbo.PROMO_REGLA_BENEFICIO');

    const rows = await this.dataSource.query(
      `
      SELECT
        ID_BENEFICIO, ID_PROM, T_BENEFICIO, PRC_DESC, IMP_DESC, ART_GRATIS,
        UPC_GRATIS, CANT_GRATIS, PRECIO_GRATIS, PRIORIDAD, ACUMULABLE, EST, FCNR
      FROM dbo.PROMO_REGLA_BENEFICIO
      WHERE ID_PROM = @0
      ORDER BY PRIORIDAD ASC, ID_BENEFICIO ASC
      `,
      [idProm],
    );
    return rows ?? [];
  }

  async createBeneficio(
    idPromRaw: string,
    dto: CreatePromocionBeneficioDto,
    user: JwtPayload,
  ) {
    await this.assertGestionAccess(user);
    const idProm = this.parseIntStrict(idPromRaw, 'idProm');
    await this.assertPromoScopeAccess(idProm, user);
    await this.ensurePromoExists(idProm);
    await this.ensureTableExists('dbo.PROMO_REGLA_BENEFICIO');

    const tBeneficio = this.normalizeUpper(
      dto.T_BENEFICIO ?? this.inferBeneficioType(dto),
    );
    if (!tBeneficio) {
      throw new BadRequestException('T_BENEFICIO es requerido');
    }
    this.assertBeneficioType(tBeneficio);

    await this.dataSource.query(
      `
      INSERT INTO dbo.PROMO_REGLA_BENEFICIO (
        ID_PROM, T_BENEFICIO, PRC_DESC, IMP_DESC, ART_GRATIS, UPC_GRATIS,
        CANT_GRATIS, PRECIO_GRATIS, PRIORIDAD, ACUMULABLE, EST
      )
      VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10)
      `,
      [
        idProm,
        tBeneficio,
        this.toNullableNumber(dto.PRC_DESC),
        this.toNullableNumber(dto.IMP_DESC),
        this.normalizeNullableText(dto.ART_GRATIS),
        this.normalizeNullableText(dto.UPC_GRATIS),
        this.toNullableNumber(dto.CANT_GRATIS),
        this.toNullableNumber(dto.PRECIO_GRATIS) ?? 0.01,
        dto.PRIORIDAD == null ? 100 : Math.trunc(dto.PRIORIDAD),
        dto.ACUMULABLE == null ? 0 : Math.trunc(dto.ACUMULABLE),
        dto.EST == null ? 1 : Math.trunc(dto.EST),
      ],
    );
    return this.listBeneficios(String(idProm));
  }

  async updateBeneficio(
    idBeneficioRaw: string,
    dto: UpdatePromocionBeneficioDto,
    user: JwtPayload,
  ) {
    await this.assertGestionAccess(user);
    await this.ensureTableExists('dbo.PROMO_REGLA_BENEFICIO');
    const idBeneficio = this.parseBigIntStrict(idBeneficioRaw, 'idBeneficio');
    const idProm = await this.ensureBeneficioExists(idBeneficio);
    await this.assertPromoScopeAccess(idProm, user);

    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = @${params.length}`);
      params.push(val);
    };

    if (dto.T_BENEFICIO !== undefined) {
      const t = this.normalizeUpper(dto.T_BENEFICIO);
      this.assertBeneficioType(t);
      add('T_BENEFICIO', t);
    }
    if (dto.PRC_DESC !== undefined) add('PRC_DESC', this.toNullableNumber(dto.PRC_DESC));
    if (dto.IMP_DESC !== undefined) add('IMP_DESC', this.toNullableNumber(dto.IMP_DESC));
    if (dto.ART_GRATIS !== undefined) add('ART_GRATIS', this.normalizeNullableText(dto.ART_GRATIS));
    if (dto.UPC_GRATIS !== undefined) add('UPC_GRATIS', this.normalizeNullableText(dto.UPC_GRATIS));
    if (dto.CANT_GRATIS !== undefined) add('CANT_GRATIS', this.toNullableNumber(dto.CANT_GRATIS));
    if (dto.PRECIO_GRATIS !== undefined) add('PRECIO_GRATIS', this.toNullableNumber(dto.PRECIO_GRATIS));
    if (dto.PRIORIDAD !== undefined) add('PRIORIDAD', Math.trunc(dto.PRIORIDAD));
    if (dto.ACUMULABLE !== undefined) add('ACUMULABLE', Math.trunc(dto.ACUMULABLE));
    if (dto.EST !== undefined) add('EST', Math.trunc(dto.EST));

    if (!sets.length) {
      const rows = await this.dataSource.query(
        `SELECT TOP 1 * FROM dbo.PROMO_REGLA_BENEFICIO WHERE ID_BENEFICIO = @0`,
        [idBeneficio],
      );
      return rows?.[0] ?? null;
    }

    params.push(idBeneficio);
    await this.dataSource.query(
      `
      UPDATE dbo.PROMO_REGLA_BENEFICIO
      SET ${sets.join(', ')}
      WHERE ID_BENEFICIO = @${params.length - 1}
      `,
      params,
    );

    const rows = await this.dataSource.query(
      `SELECT TOP 1 * FROM dbo.PROMO_REGLA_BENEFICIO WHERE ID_BENEFICIO = @0`,
      [idBeneficio],
    );
    return rows?.[0] ?? null;
  }

  async removeBeneficio(idBeneficioRaw: string, user: JwtPayload) {
    await this.assertGestionAccess(user);
    await this.ensureTableExists('dbo.PROMO_REGLA_BENEFICIO');
    const idBeneficio = this.parseBigIntStrict(idBeneficioRaw, 'idBeneficio');
    const idProm = await this.ensureBeneficioExists(idBeneficio);
    await this.assertPromoScopeAccess(idProm, user);
    await this.dataSource.query(
      `DELETE FROM dbo.PROMO_REGLA_BENEFICIO WHERE ID_BENEFICIO = @0`,
      [idBeneficio],
    );
    return { deleted: true, idBeneficio };
  }

  async evaluarFolio(idfolRaw: string, _user: JwtPayload) {
    const idfol = this.normalizeText(idfolRaw);
    if (!idfol) throw new BadRequestException('IDFOL es requerido');
    await this.ensurePromoEvaluationProcedure();

    const resolvedIdfol = await this.resolveFolioIdfol(idfol);
    const rows = await this.dataSource.query(
      `EXEC dbo.sp_promo_evaluar_folio @IDFOL = @0`,
      [resolvedIdfol],
    );
    const mapped = (rows ?? [])
      .map((row) => this.mapEvalRow(row))
      .filter((row): row is PromoEvalRow => row != null);

    return {
      ok: true,
      idfol: resolvedIdfol,
      totalCandidates: mapped.length,
      candidates: mapped,
    };
  }

  async aplicarFolio(idfolRaw: string, dto: ApplyPromocionesDto, user: JwtPayload) {
    const idfol = this.normalizeText(idfolRaw);
    if (!idfol) throw new BadRequestException('IDFOL es requerido');
    await this.ensureTableExists('dbo.PROMO_TICKET_DESC_APLI');
    await this.ensureTableExists('dbo.PROMO_TICKET_GRATIS_REL');
    await this.ensureTableExists('dbo.PROMO_TICKET_GRATIS_DET');
    const hasPromoCtrlFolios = await this.tableExists('dbo.PROMO_CTRL_FOLIOS');
    const hasPromoIdfolApli = await this.tableExists('dbo.PROMO_IDFOL_APLI');

    const resolvedIdfol = await this.resolveFolioIdfol(idfol);
    const overwrite = dto?.overwrite !== false;
    const generarGratis = dto?.generarGratis !== false;
    const ticketLogCols = await this.loadTableColumns('dbo.PV_TICKET_LOG');
    const hasIdPromoCol = ticketLogCols.has('IDPROMO');
    const hasTipoPromoCol = ticketLogCols.has('TIPOPROMO');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (overwrite) {
        const resetSets = [
          'PVTAT = ROUND(ISNULL(TRY_CONVERT(FLOAT, CTD), 0) * ISNULL(TRY_CONVERT(MONEY, PVTA), 0), 2)',
          'UPDATED_AT = GETDATE()',
        ];
        if (hasIdPromoCol) resetSets.push('IDPROMO = NULL');
        if (hasTipoPromoCol) resetSets.push('TIPOPROMO = NULL');
        await qr.query(
          `
          UPDATE dbo.PV_TICKET_LOG
          SET ${resetSets.join(',\n              ')}
          WHERE IDFOL = @0
          `,
          [resolvedIdfol],
        );
        await qr.query(
          `DELETE FROM dbo.PROMO_TICKET_DESC_APLI WHERE IDFOL = @0`,
          [resolvedIdfol],
        );
        await qr.query(
          `
          DELETE d
          FROM dbo.PROMO_TICKET_GRATIS_DET d
          INNER JOIN dbo.PROMO_TICKET_GRATIS_REL r
            ON r.ID_REL = d.ID_REL
          WHERE r.IDFOL_ORIG = @0
          `,
          [resolvedIdfol],
        );
        await qr.query(
          `DELETE FROM dbo.PROMO_TICKET_GRATIS_REL WHERE IDFOL_ORIG = @0`,
          [resolvedIdfol],
        );
        if (hasPromoIdfolApli) {
          await qr.query(
            `DELETE FROM dbo.PROMO_IDFOL_APLI WHERE IDFOL = @0 OR IDFOLNVO = @0`,
            [resolvedIdfol],
          );
        }
        if (hasPromoCtrlFolios) {
          await qr.query(
            `DELETE FROM dbo.PROMO_CTRL_FOLIOS WHERE IDFOL = @0 OR IDFOLNVO = @0`,
            [resolvedIdfol],
          );
        }
      }

      await this.ensurePromoEvaluationProcedure();
      const evalRowsRaw = await qr.query(
        `EXEC dbo.sp_promo_evaluar_folio @IDFOL = @0`,
        [resolvedIdfol],
      );
      const evalRows = (evalRowsRaw ?? [])
        .map((row) => this.mapEvalRow(row))
        .filter((row): row is PromoEvalRow => row != null);

      const lineMap = new Map<string, PromoEvalRow[]>();
      for (const row of evalRows) {
        const list = lineMap.get(row.id) ?? [];
        list.push(row);
        lineMap.set(row.id, list);
      }

      let totalDescuento = 0;
      let aplicaciones = 0;
      let gratisPendientes = 0;
      const legacySummary = new Map<number, PromoLegacyAggregate>();

      for (const [lineId, candidates] of lineMap.entries()) {
        const first = candidates[0];
        const pvtatOrig = this.round2(first.pvtat);
        const qtyRows = await qr.query(
          `
          SELECT TOP 1 ISNULL(TRY_CONVERT(FLOAT, CTD), 0) AS CTD
          FROM dbo.PV_TICKET_LOG
          WHERE ID = @0
          `,
          [lineId],
        );
        const ctdLine = this.toPositiveNumber(
          (qtyRows?.[0] as Record<string, unknown>)?.CTD,
        ) ?? 1;
        let acumulado = 0;
        let forcedGratisPrice: number | null = null;
        let forcedGratisTotal: number | null = null;
        let appliedPromoId: number | null = null;
        let appliedTipoPromo: string | null = null;

        const sorted = [...candidates].sort((a, b) => {
          if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
          if (a.idProm !== b.idProm) return a.idProm - b.idProm;
          return a.idBeneficio - b.idBeneficio;
        });
        const anyNoAcumulable = sorted.some(
          (x) => (x.acumulable ?? 0) !== 1,
        );
        const estimateBenefit = (row: PromoEvalRow) => {
          const tipo = this.normalizeUpper(row.tBeneficio);
          if (tipo === 'ART_GRATIS') {
            const precioGratis = this.toPositiveMoney(row.precioGratis) ?? 0.01;
            return this.round2(Math.max(pvtatOrig - ctdLine * precioGratis, 0));
          }
          if (tipo === 'PORCENTAJE') {
            const pct = this.toPositiveNumber(row.prcDesc) ?? 0;
            return this.round2(Math.max((pvtatOrig * pct) / 100, 0));
          }
          if (tipo === 'IMP_FIJO') {
            return this.round2(Math.max(this.toPositiveMoney(row.impDesc) ?? 0, 0));
          }
          return 0;
        };
        const candidatesToApply = anyNoAcumulable
          ? (() => {
              let best: PromoEvalRow | null = null;
              let bestBenefit = -1;
              for (const c of sorted) {
                const benefit = estimateBenefit(c);
                if (benefit > bestBenefit) {
                  bestBenefit = benefit;
                  best = c;
                  continue;
                }
                if (
                  benefit === bestBenefit &&
                  best != null &&
                  c.prioridad < best.prioridad
                ) {
                  best = c;
                }
              }
              return best == null ? [] : [best];
            })()
          : sorted;

        for (const candidate of candidatesToApply) {
          const tipo = this.normalizeUpper(candidate.tBeneficio);

          if (tipo === 'ART_GRATIS') {
            const precioGratis = this.toPositiveMoney(candidate.precioGratis) ?? 0.01;
            forcedGratisPrice = precioGratis;
            forcedGratisTotal = this.round2(ctdLine * precioGratis);
            const descuentoGratis = this.round2(
              Math.max(pvtatOrig - (forcedGratisTotal ?? 0), 0),
            );
            appliedPromoId = candidate.idProm;
            appliedTipoPromo = 'ART_GRATIS';
            aplicaciones += 1;
            totalDescuento = this.round2(totalDescuento + descuentoGratis);
            if (generarGratis) {
              const relInsert = await qr.query(
                `
                INSERT INTO dbo.PROMO_TICKET_GRATIS_REL (
                  IDFOL_ORIG, IDDESC, ESTATUS, IDUSUARIO
                )
                VALUES (@0, @1, 'PENDIENTE', @2);
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS ID_REL;
                `,
                [resolvedIdfol, candidate.idProm, Number(user.sub ?? 0) || null],
              );
              const idRel = Number((relInsert?.[0] as Record<string, unknown>)?.ID_REL ?? 0);
              if (idRel > 0) {
                await qr.query(
                  `
                  INSERT INTO dbo.PROMO_TICKET_GRATIS_DET (
                    ID_REL, ART, UPC, CTD, PVTA, ESTATUS
                  )
                  VALUES (@0, @1, @2, @3, @4, 'PENDIENTE')
                  `,
                  [
                    idRel,
                    this.normalizeText(candidate.artGratis ?? candidate.art),
                    this.normalizeText(candidate.upcGratis ?? candidate.upc),
                    this.toPositiveNumber(candidate.cantGratis) ?? 1,
                    this.toPositiveMoney(candidate.precioGratis) ?? 0.01,
                  ],
                );
                gratisPendientes += 1;
              }
            }
            this.addLegacySummary(
              legacySummary,
              candidate.idProm,
              candidate.tProm ?? candidate.tBeneficio,
              descuentoGratis,
            );
            break;
          }

          let descuento = 0;
          if (tipo === 'PORCENTAJE') {
            const pct = this.toPositiveNumber(candidate.prcDesc) ?? 0;
            descuento = this.round2((pvtatOrig * pct) / 100);
          } else if (tipo === 'IMP_FIJO') {
            descuento = this.round2(this.toPositiveMoney(candidate.impDesc) ?? 0);
          } else {
            continue;
          }

          const restante = this.round2(Math.max(pvtatOrig - acumulado, 0));
          if (restante <= 0) break;
          if (descuento <= 0) continue;

          const aplicado = this.round2(Math.min(descuento, restante));
          if (aplicado > 0 && appliedPromoId == null) {
            appliedPromoId = candidate.idProm;
            appliedTipoPromo = tipo;
          }
          acumulado = this.round2(acumulado + aplicado);
          const pvtatFin = this.round2(Math.max(pvtatOrig - acumulado, 0));

          await qr.query(
            `
            INSERT INTO dbo.PROMO_TICKET_DESC_APLI (
              ID, IDFOL, UPC, ART, IDDESC, IMPTDESC, FCNDES, PVTAT_ORIG, PVTAT_FIN, IDUSUARIO
            )
            VALUES (@0, @1, @2, @3, @4, @5, GETDATE(), @6, @7, @8)
            `,
            [
              lineId,
              resolvedIdfol,
              candidate.upc,
              candidate.art,
              candidate.idProm,
              aplicado,
              pvtatOrig,
              pvtatFin,
              Number(user.sub ?? 0) || null,
            ],
          );
          aplicaciones += 1;
          totalDescuento = this.round2(totalDescuento + aplicado);
          this.addLegacySummary(
            legacySummary,
            candidate.idProm,
            candidate.tProm ?? candidate.tBeneficio,
            aplicado,
          );

          if (anyNoAcumulable || (candidate.acumulable ?? 0) !== 1) {
            break;
          }
        }

        if (forcedGratisPrice != null && forcedGratisTotal != null) {
          const setParts = [
            'PVTA = @1',
            'PVTAT = @2',
            'UPDATED_AT = GETDATE()',
          ];
          const params: unknown[] = [lineId, forcedGratisPrice, forcedGratisTotal];
          if (hasIdPromoCol) {
            setParts.push(`IDPROMO = @${params.length}`);
            params.push(appliedPromoId);
          }
          if (hasTipoPromoCol) {
            setParts.push(`TIPOPROMO = @${params.length}`);
            params.push(appliedTipoPromo);
          }
          await qr.query(
            `
            UPDATE dbo.PV_TICKET_LOG
            SET ${setParts.join(',\n                ')}
            WHERE ID = @0
            `,
            params,
          );
        } else {
          const nuevoPvtat = this.round2(Math.max(pvtatOrig - acumulado, 0));
          const nuevoPvta = this.round2(nuevoPvtat / ctdLine);
          const setParts = ['PVTA = @1', 'PVTAT = @2', 'UPDATED_AT = GETDATE()'];
          const params: unknown[] = [lineId, nuevoPvta, nuevoPvtat];
          if (hasIdPromoCol) {
            setParts.push(`IDPROMO = @${params.length}`);
            params.push(appliedPromoId);
          }
          if (hasTipoPromoCol) {
            setParts.push(`TIPOPROMO = @${params.length}`);
            params.push(appliedTipoPromo);
          }
          await qr.query(
            `
            UPDATE dbo.PV_TICKET_LOG
            SET ${setParts.join(', ')}
            WHERE ID = @0
            `,
            params,
          );
        }
      }

      if (hasPromoCtrlFolios || hasPromoIdfolApli) {
        await this.persistLegacyPromoTables(
          qr,
          resolvedIdfol,
          legacySummary,
          hasPromoCtrlFolios,
          hasPromoIdfolApli,
        );
      }

      await qr.commitTransaction();

      return {
        ok: true,
        idfol: resolvedIdfol,
        aplicaciones,
        totalDescuento,
        gratisPendientes,
      };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async aplicarLinea(
    lineIdRaw: string,
    options: ApplyPromocionesLineaOptions,
    user: JwtPayload,
  ) {
    const lineId = this.normalizeText(lineIdRaw);
    if (!lineId) throw new BadRequestException('ID de linea es requerido');
    await this.ensureTableExists('dbo.PROMO_TICKET_DESC_APLI');
    await this.ensureTableExists('dbo.PROMO_TICKET_GRATIS_REL');
    await this.ensureTableExists('dbo.PROMO_TICKET_GRATIS_DET');
    const generarGratis = options?.generarGratis !== false;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const ticketLogCols = await this.loadTableColumns('dbo.PV_TICKET_LOG');
      const hasIdPromoCol = ticketLogCols.has('IDPROMO');
      const hasTipoPromoCol = ticketLogCols.has('TIPOPROMO');

      const lineRows = await qr.query(
        `
        ;WITH ctx AS (
          SELECT TOP 1
            t.ID,
            t.IDFOL,
            LTRIM(RTRIM(ISNULL(t.ART, ''))) AS ART,
            LTRIM(RTRIM(ISNULL(t.UPC, ''))) AS UPC,
            LTRIM(RTRIM(ISNULL(t.DES, ''))) AS DES,
            ISNULL(TRY_CONVERT(FLOAT, t.CTD), 0) AS CTD,
            ff.SUC AS FOL_SUC,
            TRY_CONVERT(INT, ff.CLIEN) AS CLIENTE
          FROM dbo.PV_TICKET_LOG t
          OUTER APPLY (
            SELECT TOP 1 f.SUC, f.CLIEN
            FROM dbo.PV_CTR_FOL_ASVR f
            WHERE f.IDFOL = t.IDFOL OR f.IDFOLINICIAL = t.IDFOL
            ORDER BY CASE WHEN f.IDFOL = t.IDFOL THEN 0 ELSE 1 END, ISNULL(f.FCNM, f.FCN) DESC
          ) ff
          WHERE t.ID = @0
        )
        SELECT TOP 1
          ctx.ID,
          ctx.IDFOL,
          ctx.ART,
          ctx.UPC,
          ctx.DES,
          ctx.CTD,
          LTRIM(RTRIM(ISNULL(ctx.FOL_SUC, ''))) AS SUC,
          ctx.CLIENTE,
          ISNULL(TRY_CONVERT(MONEY, a.PVTA), TRY_CONVERT(MONEY, t.PVTA)) AS PVTA_BASE,
          TRY_CONVERT(FLOAT, a.DEPA) AS DEPA,
          TRY_CONVERT(FLOAT, a.SUBD) AS SUBD,
          TRY_CONVERT(FLOAT, a.CLAS) AS CLAS,
          TRY_CONVERT(FLOAT, a.SCLA) AS SCLA,
          TRY_CONVERT(FLOAT, a.SCLA2) AS SCLA2,
          LTRIM(RTRIM(ISNULL(j.GUIA, ''))) AS GUIA
        FROM ctx
        INNER JOIN dbo.PV_TICKET_LOG t
          ON t.ID = ctx.ID
        OUTER APPLY (
          SELECT TOP 1 aa.PVTA, aa.DEPA, aa.SUBD, aa.CLAS, aa.SCLA, aa.SCLA2
          FROM dbo.DAT_ART aa
          WHERE (
                  LTRIM(RTRIM(ISNULL(aa.ART, ''))) = ctx.ART
                  OR (ctx.UPC <> '' AND LTRIM(RTRIM(ISNULL(aa.UPC, ''))) = ctx.UPC)
                )
            AND (
                  LTRIM(RTRIM(ISNULL(aa.SUC, ''))) = LTRIM(RTRIM(ISNULL(ctx.FOL_SUC, '')))
                  OR LTRIM(RTRIM(ISNULL(aa.SUC, ''))) = ''
                )
          ORDER BY CASE WHEN LTRIM(RTRIM(ISNULL(aa.SUC, ''))) = LTRIM(RTRIM(ISNULL(ctx.FOL_SUC, ''))) THEN 0 ELSE 1 END
        ) a
        OUTER APPLY (
          SELECT TOP 1 jj.GUIA
          FROM dbo.DAT_DET_JRQ_SVR jj
          WHERE (LTRIM(RTRIM(ISNULL(jj.ART, ''))) = ctx.ART OR (ctx.UPC <> '' AND LTRIM(RTRIM(ISNULL(jj.UPC, ''))) = ctx.UPC))
            AND (
              LTRIM(RTRIM(ISNULL(jj.SUC, ''))) = LTRIM(RTRIM(ISNULL(ctx.FOL_SUC, '')))
              OR LTRIM(RTRIM(ISNULL(jj.SUC, ''))) = ''
            )
          ORDER BY CASE WHEN LTRIM(RTRIM(ISNULL(jj.SUC, ''))) = LTRIM(RTRIM(ISNULL(ctx.FOL_SUC, ''))) THEN 0 ELSE 1 END
        ) j
        `,
        [lineId],
      );
      const line = (lineRows?.[0] ?? null) as Record<string, unknown> | null;
      if (!line) {
        throw new NotFoundException(`No existe linea ${lineId}`);
      }

      const idfol = this.normalizeText(line.IDFOL);
      const art = this.normalizeText(line.ART);
      const upc = this.normalizeText(line.UPC);
      const suc = this.normalizeText(line.SUC);
      const cliente = this.toInt(line.CLIENTE);
      const qty = this.toPositiveNumber(line.CTD) ?? 1;
      const basePvta = this.toPositiveMoney(line.PVTA_BASE) ?? 0;
      const depa = this.toNumber(line.DEPA);
      const subd = this.toNumber(line.SUBD);
      const clas = this.toNumber(line.CLAS);
      const scla = this.toNumber(line.SCLA);
      const scla2 = this.toNumber(line.SCLA2);
      const guia = this.normalizeText(line.GUIA);

      const resetSets = [
        'PVTA = @1',
        'PVTAT = ROUND(@1 * ISNULL(TRY_CONVERT(FLOAT, CTD), 0), 2)',
        'UPDATED_AT = GETDATE()',
      ];
      const resetParams: unknown[] = [lineId, basePvta];
      if (hasIdPromoCol) resetSets.push('IDPROMO = NULL');
      if (hasTipoPromoCol) resetSets.push('TIPOPROMO = NULL');
      await qr.query(
        `
        UPDATE dbo.PV_TICKET_LOG
        SET ${resetSets.join(', ')}
        WHERE ID = @0
        `,
        resetParams,
      );
      await qr.query(
        `DELETE FROM dbo.PROMO_TICKET_DESC_APLI WHERE ID = @0`,
        [lineId],
      );

      const candidatesRaw = await qr.query(
        `
        SELECT
          c.ID_PROM,
          c.T_PROM,
          rb.ID_BENEFICIO,
          UPPER(LTRIM(RTRIM(ISNULL(rb.T_BENEFICIO, '')))) AS T_BENEFICIO,
          TRY_CONVERT(FLOAT, rb.PRC_DESC) AS PRC_DESC,
          TRY_CONVERT(MONEY, rb.IMP_DESC) AS IMP_DESC,
          TRY_CONVERT(MONEY, rb.PRECIO_GRATIS) AS PRECIO_GRATIS,
          ISNULL(TRY_CONVERT(INT, c.PRIORIDAD), 100) AS PRIORIDAD,
          ISNULL(TRY_CONVERT(INT, c.ACUMULABLE), 0) AS ACUMULABLE
        FROM dbo.PROMO_CAB c
        INNER JOIN dbo.PROMO_REGLA_BENEFICIO rb
          ON rb.ID_PROM = c.ID_PROM
         AND rb.EST = 1
        WHERE (c.EST IN (1, -1) OR c.EST IS NULL)
          AND (c.FCN_INI IS NULL OR CONVERT(DATE, c.FCN_INI) <= CONVERT(DATE, GETDATE()))
          AND (c.FCN_TER IS NULL OR CONVERT(DATE, c.FCN_TER) >= CONVERT(DATE, GETDATE()))
          AND (
            LTRIM(RTRIM(ISNULL(c.SUC, ''))) = ''
            OR LTRIM(RTRIM(ISNULL(c.SUC, ''))) = '*'
            OR CHARINDEX(
                 ',' + UPPER(@1) + ',',
                 ',' + REPLACE(REPLACE(UPPER(LTRIM(RTRIM(ISNULL(c.SUC, '')))), ' ', ''), ';', ',') + ','
               ) > 0
          )
          AND EXISTS (
            SELECT 1
            FROM dbo.PROMO_REGLA_CRITERIO rc
            WHERE rc.ID_PROM = c.ID_PROM
              AND rc.EST = 1
              AND (
                LTRIM(RTRIM(ISNULL(rc.SUC, ''))) = ''
                OR LTRIM(RTRIM(ISNULL(rc.SUC, ''))) = '*'
                OR CHARINDEX(
                     ',' + UPPER(@1) + ',',
                     ',' + REPLACE(REPLACE(UPPER(LTRIM(RTRIM(ISNULL(rc.SUC, '')))), ' ', ''), ';', ',') + ','
                   ) > 0
              )
              AND (rc.CLIENTE IS NULL OR rc.CLIENTE = @2)
              AND (rc.DEPA IS NULL OR rc.DEPA = @3)
              AND (rc.SUBD IS NULL OR rc.SUBD = @4)
              AND (rc.CLAS IS NULL OR rc.CLAS = @5)
              AND (rc.SCLA IS NULL OR rc.SCLA = @6)
              AND (rc.SCLA2 IS NULL OR rc.SCLA2 = @7)
              AND (LTRIM(RTRIM(ISNULL(rc.GUIA, ''))) = '' OR LTRIM(RTRIM(ISNULL(rc.GUIA, ''))) = @8)
              AND (LTRIM(RTRIM(ISNULL(rc.ART, ''))) = '' OR LTRIM(RTRIM(ISNULL(rc.ART, ''))) = @9)
              AND (LTRIM(RTRIM(ISNULL(rc.UPC, ''))) = '' OR LTRIM(RTRIM(ISNULL(rc.UPC, ''))) = @10)
          )
        ORDER BY ISNULL(TRY_CONVERT(INT, c.PRIORIDAD), 100) ASC, c.ID_PROM ASC, rb.ID_BENEFICIO ASC
        `,
        [lineId, suc, cliente, depa, subd, clas, scla, scla2, guia, art, upc],
      );

      if (!candidatesRaw?.length) {
        await qr.commitTransaction();
        return {
          ok: true,
          idfol,
          lineId,
          aplicaciones: 0,
          totalDescuento: 0,
          gratisPendientes: 0,
        };
      }

      let currentPvta = basePvta;
      let totalDescuento = 0;
      let aplicaciones = 0;
      let gratisPendientes = 0;
      let appliedPromoId: number | null = null;
      let appliedTipoPromo: string | null = null;
      const orderedCandidates = [...(candidatesRaw as Record<string, unknown>[])].sort(
        (a, b) => {
          const pa = this.toInt(a.PRIORIDAD) ?? 100;
          const pb = this.toInt(b.PRIORIDAD) ?? 100;
          if (pa !== pb) return pa - pb;
          const ia = this.toInt(a.ID_PROM) ?? 0;
          const ib = this.toInt(b.ID_PROM) ?? 0;
          if (ia !== ib) return ia - ib;
          const ba = this.toInt(a.ID_BENEFICIO) ?? 0;
          const bb = this.toInt(b.ID_BENEFICIO) ?? 0;
          return ba - bb;
        },
      );
      const anyNoAcumulable = orderedCandidates.some(
        (x) => (this.toInt(x.ACUMULABLE) ?? 0) !== 1,
      );

      const estimateBenefitTotal = (
        raw: Record<string, unknown>,
        pvta: number,
        ctd: number,
      ) => {
        const tipo = this.normalizeUpper(raw.T_BENEFICIO);
        if (tipo === 'ART_GRATIS') {
          const precioGratis = this.toPositiveMoney(raw.PRECIO_GRATIS) ?? 0.01;
          return this.round2(Math.max((pvta - precioGratis) * ctd, 0));
        }
        if (tipo === 'PORCENTAJE') {
          const pct = this.toPositiveNumber(raw.PRC_DESC) ?? 0;
          return this.round2(Math.max(((pvta * pct) / 100) * ctd, 0));
        }
        if (tipo === 'IMP_FIJO') {
          const imp = this.toPositiveMoney(raw.IMP_DESC) ?? 0;
          return this.round2(Math.max(Math.min(imp, pvta) * ctd, 0));
        }
        return 0;
      };

      const candidatesToApply = anyNoAcumulable
        ? (() => {
            let best: Record<string, unknown> | null = null;
            let bestBenefit = -1;
            for (const c of orderedCandidates) {
              const benefit = estimateBenefitTotal(c, basePvta, qty);
              if (benefit > bestBenefit) {
                bestBenefit = benefit;
                best = c;
                continue;
              }
              if (benefit === bestBenefit && best != null) {
                const prioBest = this.toInt(best['PRIORIDAD']) ?? 100;
                const prioNow = this.toInt(c['PRIORIDAD']) ?? 100;
                if (prioNow < prioBest) best = c;
              }
            }
            return best == null ? [] : [best];
          })()
        : orderedCandidates;

      for (const raw of candidatesToApply) {
        const tipo = this.normalizeUpper(raw.T_BENEFICIO);
        const idProm = this.toInt(raw.ID_PROM);
        if (idProm == null) continue;

        if (tipo === 'ART_GRATIS') {
          const precioGratis = this.toPositiveMoney(raw.PRECIO_GRATIS) ?? 0.01;
          const descuento = this.round2(Math.max((currentPvta - precioGratis) * qty, 0));
          totalDescuento = this.round2(totalDescuento + descuento);
          aplicaciones += 1;
          appliedPromoId = idProm;
          appliedTipoPromo = 'ART_GRATIS';
          currentPvta = precioGratis;

          if (generarGratis) {
            const relInsert = await qr.query(
              `
              INSERT INTO dbo.PROMO_TICKET_GRATIS_REL (IDFOL_ORIG, IDDESC, ESTATUS, IDUSUARIO)
              VALUES (@0, @1, 'PENDIENTE', @2);
              SELECT CAST(SCOPE_IDENTITY() AS BIGINT) AS ID_REL;
              `,
              [idfol, idProm, Number(user.sub ?? 0) || null],
            );
            const idRel = Number((relInsert?.[0] as Record<string, unknown>)?.ID_REL ?? 0);
            if (idRel > 0) {
              await qr.query(
                `
                INSERT INTO dbo.PROMO_TICKET_GRATIS_DET (
                  ID_REL, ART, UPC, CTD, PVTA, ESTATUS
                )
                VALUES (@0, @1, @2, @3, @4, 'PENDIENTE')
                `,
                [idRel, art, upc, 1, precioGratis],
              );
              gratisPendientes += 1;
            }
          }
          break;
        }

        let descuentoUnit = 0;
        if (tipo === 'PORCENTAJE') {
          const pct = this.toPositiveNumber(raw.PRC_DESC) ?? 0;
          descuentoUnit = this.round2((currentPvta * pct) / 100);
        } else if (tipo === 'IMP_FIJO') {
          descuentoUnit = this.round2(this.toPositiveMoney(raw.IMP_DESC) ?? 0);
        } else {
          continue;
        }
        if (descuentoUnit <= 0 || currentPvta <= 0) continue;

        const aplicadoUnit = this.round2(Math.min(descuentoUnit, currentPvta));
        const nextPvta = this.round2(Math.max(currentPvta - aplicadoUnit, 0));
        const aplicadoTotal = this.round2(aplicadoUnit * qty);
        totalDescuento = this.round2(totalDescuento + aplicadoTotal);
        aplicaciones += 1;

        await qr.query(
          `
          INSERT INTO dbo.PROMO_TICKET_DESC_APLI (
            ID, IDFOL, UPC, ART, IDDESC, IMPTDESC, FCNDES, PVTAT_ORIG, PVTAT_FIN, IDUSUARIO
          )
          VALUES (@0, @1, @2, @3, @4, @5, GETDATE(), @6, @7, @8)
          `,
          [
            lineId,
            idfol,
            upc || null,
            art || null,
            idProm,
            aplicadoTotal,
            this.round2(currentPvta * qty),
            this.round2(nextPvta * qty),
            Number(user.sub ?? 0) || null,
          ],
        );

        if (appliedPromoId == null) {
          appliedPromoId = idProm;
          appliedTipoPromo = tipo;
        }
        currentPvta = nextPvta;
        const acumulable = this.toInt(raw.ACUMULABLE) ?? 0;
        if (anyNoAcumulable || acumulable !== 1) break;
      }

      const setParts = [
        'PVTA = @1',
        'PVTAT = ROUND(@1 * ISNULL(TRY_CONVERT(FLOAT, CTD), 0), 2)',
        'UPDATED_AT = GETDATE()',
      ];
      const setParams: unknown[] = [lineId, currentPvta];
      if (hasIdPromoCol) {
        setParts.push(`IDPROMO = @${setParams.length}`);
        setParams.push(appliedPromoId);
      }
      if (hasTipoPromoCol) {
        setParts.push(`TIPOPROMO = @${setParams.length}`);
        setParams.push(appliedTipoPromo);
      }
      await qr.query(
        `
        UPDATE dbo.PV_TICKET_LOG
        SET ${setParts.join(', ')}
        WHERE ID = @0
        `,
        setParams,
      );

      await qr.commitTransaction();
      return {
        ok: true,
        idfol,
        lineId,
        aplicaciones,
        totalDescuento,
        gratisPendientes,
      };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async clearPromoStateForLine(lineIdRaw: string) {
    const lineId = this.normalizeText(lineIdRaw);
    if (!lineId) throw new BadRequestException('ID de linea es requerido');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const ticketLogCols = await this.loadTableColumns('dbo.PV_TICKET_LOG');
      const setParts: string[] = [];
      if (ticketLogCols.has('IDPROMO')) setParts.push('IDPROMO = NULL');
      if (ticketLogCols.has('TIPOPROMO')) setParts.push('TIPOPROMO = NULL');
      if (setParts.length) {
        setParts.push('UPDATED_AT = GETDATE()');
        await qr.query(
          `
          UPDATE dbo.PV_TICKET_LOG
          SET ${setParts.join(', ')}
          WHERE ID = @0
          `,
          [lineId],
        );
      }

      const hasDescApli = await this.tableExists('dbo.PROMO_TICKET_DESC_APLI');
      if (hasDescApli) {
        await qr.query(
          `
          DELETE FROM dbo.PROMO_TICKET_DESC_APLI
          WHERE ID = @0
          `,
          [lineId],
        );
      }

      await qr.commitTransaction();
      return { ok: true, lineId };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async aplicadasPorFolio(idfolRaw: string) {
    const idfol = this.normalizeText(idfolRaw);
    if (!idfol) throw new BadRequestException('IDFOL es requerido');
    await this.ensurePromoAplicadasProcedure();
    const resolvedIdfol = await this.resolveFolioIdfol(idfol);
    const rows = await this.dataSource.query(
      `EXEC dbo.sp_promo_desc_aplicadas_folio @IDFOL = @0`,
      [resolvedIdfol],
    );
    return {
      ok: true,
      idfol: resolvedIdfol,
      rows: rows ?? [],
    };
  }

  private async ensurePromoCabColumns() {
    await this.ensureTableExists('dbo.PROMO_CAB');
    const columns = await this.loadTableColumns('dbo.PROMO_CAB');
    const missing = [
      'TIPO_DESC',
      'PRC_DESC',
      'IMP_DESC',
      'PRIORIDAD',
      'COMBINABLE',
      'MAX_APLI_FOLIO',
      'CREADO_POR',
      'FCNR',
      'MOD_POR',
      'FCMOD',
    ].filter((column) => !columns.has(column));
    if (missing.length) {
      throw new ConflictException(
        `PROMO_CAB sin columnas nuevas (${missing.join(', ')}). Ejecuta sql/2026-05-09_promociones_descuentos_base.sql`,
      );
    }
  }

  private async ensurePromoEvaluationProcedure() {
    const has = await this.procedureExists('dbo.sp_promo_evaluar_folio');
    if (!has) {
      throw new ConflictException(
        'No existe dbo.sp_promo_evaluar_folio. Ejecuta sql/2026-05-09_promociones_descuentos_base.sql',
      );
    }
  }

  private async ensurePromoAplicadasProcedure() {
    const has = await this.procedureExists('dbo.sp_promo_desc_aplicadas_folio');
    if (!has) {
      throw new ConflictException(
        'No existe dbo.sp_promo_desc_aplicadas_folio. Ejecuta sql/2026-05-09_promociones_descuentos_base.sql',
      );
    }
  }

  private async ensurePromoExists(idProm: number) {
    const rows = await this.dataSource.query(
      `SELECT TOP 1 ID_PROM FROM dbo.PROMO_CAB WHERE ID_PROM = @0`,
      [idProm],
    );
    if (!rows?.length) {
      throw new NotFoundException(`PROMO_CAB ${idProm} no existe`);
    }
  }

  private async ensureCriterioExists(idCriterio: bigint) {
    const rows = await this.dataSource.query(
      `SELECT TOP 1 ID_CRITERIO, ID_PROM FROM dbo.PROMO_REGLA_CRITERIO WHERE ID_CRITERIO = @0`,
      [idCriterio.toString()],
    );
    if (!rows?.length) {
      throw new NotFoundException(`PROMO_REGLA_CRITERIO ${idCriterio} no existe`);
    }
    return this.toInt((rows[0] as Record<string, unknown>).ID_PROM) ?? 0;
  }

  private async ensureBeneficioExists(idBeneficio: bigint) {
    const rows = await this.dataSource.query(
      `SELECT TOP 1 ID_BENEFICIO, ID_PROM FROM dbo.PROMO_REGLA_BENEFICIO WHERE ID_BENEFICIO = @0`,
      [idBeneficio.toString()],
    );
    if (!rows?.length) {
      throw new NotFoundException(`PROMO_REGLA_BENEFICIO ${idBeneficio} no existe`);
    }
    return this.toInt((rows[0] as Record<string, unknown>).ID_PROM) ?? 0;
  }

  private parsePromoSucText(value: unknown) {
    const raw = this.normalizeText(value).toUpperCase();
    if (!raw || raw === '*') return { all: true, sucs: [] as string[] };
    const sucs = this.parseMultiTexts(raw).map((x) => this.normalizeUpper(x));
    return { all: false, sucs };
  }

  private assertRequestedSucWithinAllowed(sucRaw: string, allowedSucs: string[]) {
    if (!allowedSucs.length) return;
    const suc = this.normalizeUpper(sucRaw);
    if (!suc) return;
    if (!allowedSucs.includes(suc)) {
      throw new ForbiddenException(`Sin acceso a sucursal ${suc}`);
    }
  }

  private assertRequestedSucsWithinAllowed(sucList: string[], allowedSucs: string[]) {
    if (!allowedSucs.length) return;
    for (const suc of sucList) {
      this.assertRequestedSucWithinAllowed(suc, allowedSucs);
    }
  }

  private assertPromoSucTextWithinAllowed(sucRaw: unknown, allowedSucs: string[]) {
    if (!allowedSucs.length) return;
    const parsed = this.parsePromoSucText(sucRaw);
    if (parsed.all) {
      throw new ForbiddenException(
        'No autorizado para gestionar promociones con TODAS las sucursales',
      );
    }
    this.assertRequestedSucsWithinAllowed(parsed.sucs, allowedSucs);
  }

  private async resolvePromoGestionAllowedSucs(user?: JwtPayload | null) {
    if (this.isAdmin(user)) return [] as string[];

    const userId = await this.resolveAccessUserIdWithFallback(user);
    if (!userId) {
      throw new ForbiddenException('Usuario inválido para resolver sucursales');
    }

    const safeCodes = PromocionesService.PROMO_GESTION_MODULE_CODES
      .map((code) => code.replace(/'/g, "''"))
      .map((code) => `'${code}'`)
      .join(', ');

    const rows = await this.dataSource.query(
      `SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(CAST(ums.SUC AS NVARCHAR(20)), '')))) AS SUC
       FROM dbo.USR_MOD_SUC ums
       INNER JOIN dbo.USUARIO u
         ON UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, '')))) = UPPER(LTRIM(RTRIM(ISNULL(ums.USUARIO, ''))))
       WHERE u.IDUSUARIO = @0
         AND ISNULL(ums.ACTIVO, 1) = 1
         AND UPPER(LTRIM(RTRIM(ISNULL(ums.MODULO, '')))) IN (${safeCodes})`,
      [userId],
    );

    const sucs = this.sanitizeTextList(
      (rows ?? []).map((row) => (row as Record<string, unknown>).SUC),
      true,
    );
    if (sucs.length) return sucs;

    const fallbackSuc = this.normalizeUpper(user?.suc ?? '');
    if (fallbackSuc) return [fallbackSuc];

    throw new ForbiddenException(
      `Usuario sin sucursales autorizadas para módulo ${PromocionesService.PROMO_GESTION_MODULE_CODES.join(', ')}`,
    );
  }

  private async assertPromoScopeAccess(idProm: number, user?: JwtPayload | null) {
    const allowedSucs = await this.resolvePromoGestionAllowedSucs(user);
    if (!allowedSucs.length) return;
    const userId = await this.resolveAccessUserIdWithFallback(user);

    const rows = await this.dataSource.query(
      `SELECT TOP 1 SUC, CREADO_POR FROM dbo.PROMO_CAB WHERE ID_PROM = @0`,
      [idProm],
    );
    if (!rows?.length) {
      throw new NotFoundException(`PROMO_CAB ${idProm} no existe`);
    }

    const row = rows[0] as Record<string, unknown>;
    const createdBy = this.toInt(row.CREADO_POR) ?? 0;
    if (userId > 0 && createdBy === userId) return;

    const promoSucs = this.parsePromoSucText(row.SUC);
    if (promoSucs.all) {
      throw new ForbiddenException('Sin acceso para gestionar promoción global');
    }

    const intersects = promoSucs.sucs.some((suc) => allowedSucs.includes(suc));
    if (!intersects) {
      throw new ForbiddenException(
        `Sin acceso a la promoción ${idProm} por sucursal`,
      );
    }
  }

  private async ensureTableExists(tableName: string) {
    const exists = await this.tableExists(tableName);
    if (!exists) {
      throw new ConflictException(`No existe tabla ${tableName}`);
    }
  }

  private async tableExists(tableName: string) {
    const rows = await this.dataSource.query(
      `SELECT CASE WHEN OBJECT_ID(@0, 'U') IS NULL THEN 0 ELSE 1 END AS T_EXISTS`,
      [tableName],
    );
    return Number((rows?.[0] as Record<string, unknown>)?.T_EXISTS ?? 0) === 1;
  }

  private async procedureExists(procedureName: string) {
    const rows = await this.dataSource.query(
      `SELECT CASE WHEN OBJECT_ID(@0, 'P') IS NULL THEN 0 ELSE 1 END AS P_EXISTS`,
      [procedureName],
    );
    return Number((rows?.[0] as Record<string, unknown>)?.P_EXISTS ?? 0) === 1;
  }

  private async loadTableColumns(tableName: string) {
    const rows = await this.dataSource.query(
      `
      SELECT UPPER(name) AS COL
      FROM sys.columns
      WHERE object_id = OBJECT_ID(@0)
      `,
      [tableName],
    );
    return new Set<string>(
      (rows ?? []).map((row) =>
        this.normalizeUpper((row as Record<string, unknown>).COL),
      ),
    );
  }

  private async ensureConfigTables() {
    await this.ensureTableExists('dbo.PROMO_CONFIG');
    await this.ensureTableExists('dbo.PROMO_CAT_T_PROM');
    await this.ensureTableExists('dbo.PROMO_CAT_TIPO_DESC');
    await this.ensureTableExists('dbo.PROMO_CAT_T_BENEFICIO');
    const cols = await this.loadTableColumns('dbo.PROMO_CONFIG');
    if (!cols.has('PRECIO_GRATIS')) {
      throw new ConflictException(
        'PROMO_CONFIG requiere columna PRECIO_GRATIS. Ejecuta sql/2026-05-10_promociones_precio_gratis_patch.sql',
      );
    }
  }

  private resolveCatalogTable(kind: CatalogKind) {
    if (kind === 'T_PROM') return 'dbo.PROMO_CAT_T_PROM';
    if (kind === 'TIPO_DESC') return 'dbo.PROMO_CAT_TIPO_DESC';
    return 'dbo.PROMO_CAT_T_BENEFICIO';
  }

  private parseMultiNumbers(raw?: string) {
    const values = this.parseMultiTexts(raw)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x));
    return Array.from(new Set(values));
  }

  private parseMultiTexts(raw?: string) {
    const text = this.normalizeText(raw);
    if (!text) return [];
    return Array.from(
      new Set(
        text
          .split(',')
          .map((x) => this.normalizeText(x))
          .filter((x) => x.length > 0),
      ),
    );
  }

  private sanitizeTextList(values: unknown, upper = false) {
    if (!Array.isArray(values)) return [];
    const list = values
      .map((x) => this.normalizeText(x))
      .filter((x) => x.length > 0)
      .map((x) => (upper ? x.toUpperCase() : x));
    return Array.from(new Set(list));
  }

  private sanitizeNumberList(values: unknown) {
    if (!Array.isArray(values)) return [];
    const list = values
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x))
      .map((x) => Math.trunc(x));
    return Array.from(new Set(list));
  }

  private mapCatalogNum(row: unknown, field: string) {
    const r = row as Record<string, unknown>;
    return {
      valor: this.toInt(r[field]) ?? 0,
      descripcion: this.normalizeText(r.DESCRIPCION),
    };
  }

  private mapPromoConfigRow(row: Record<string, unknown>) {
    return {
      idConfig: this.toInt(row.ID_CONFIG) ?? 0,
      idProm: this.toInt(row.ID_PROM) ?? 0,
      tBeneficio: this.normalizeText(row.T_BENEFICIO),
      prcDesc: this.toNumber(row.PRC_DESC),
      impDesc: this.toMoney(row.IMP_DESC),
      precioGratis: this.toMoney(row.PRECIO_GRATIS),
      sucTodas: (this.toInt(row.SUC_TODAS) ?? 1) === 1,
      sucList: this.parseMultiTexts(this.normalizeText(row.SUC_LIST)),
      cliente: this.toPositiveInt(row.CLIENTE),
      depaList: this.parseMultiNumbers(this.normalizeText(row.DEPA_LIST)),
      subdList: this.parseMultiNumbers(this.normalizeText(row.SUBD_LIST)),
      clasList: this.parseMultiNumbers(this.normalizeText(row.CLAS_LIST)),
      sclaList: this.parseMultiNumbers(this.normalizeText(row.SCLA_LIST)),
      scla2List: this.parseMultiNumbers(this.normalizeText(row.SCLA2_LIST)),
      guiaList: this.parseMultiTexts(this.normalizeText(row.GUIA_LIST)),
      artList: this.parseMultiTexts(this.normalizeText(row.ART_LIST)),
      upcList: this.parseMultiTexts(this.normalizeText(row.UPC_LIST)),
      activo: this.toInt(row.ACTIVO) ?? 1,
      fcnr: this.toIsoDate(row.FCNR),
      fcmod: this.toIsoDate(row.FCMOD),
    };
  }

  private async getMaxPromoPriority() {
    const rows = await this.dataSource.query(
      `
      SELECT ISNULL(MAX(TRY_CONVERT(INT, PRIORIDAD)), 0) AS MAX_PRIO
      FROM dbo.PROMO_CAB
      `,
    );
    return this.toInt((rows?.[0] as Record<string, unknown>)?.MAX_PRIO) ?? 0;
  }

  private async reorderPromoPriority(idProm: number, targetPriorityRaw: number, modPor: number | null) {
    const targetPriority = Math.max(1, Math.trunc(targetPriorityRaw));
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const currRows = await qr.query(
        `
        SELECT TOP 1 TRY_CONVERT(INT, PRIORIDAD) AS PRIORIDAD
        FROM dbo.PROMO_CAB
        WHERE ID_PROM = @0
        `,
        [idProm],
      );
      const current = this.toInt((currRows?.[0] as Record<string, unknown>)?.PRIORIDAD) ?? 1;
      if (current !== targetPriority) {
        if (targetPriority < current) {
          await qr.query(
            `
            UPDATE dbo.PROMO_CAB
            SET PRIORIDAD = TRY_CONVERT(INT, PRIORIDAD) + 1
            WHERE ID_PROM <> @0
              AND TRY_CONVERT(INT, PRIORIDAD) >= @1
              AND TRY_CONVERT(INT, PRIORIDAD) < @2
            `,
            [idProm, targetPriority, current],
          );
        } else {
          await qr.query(
            `
            UPDATE dbo.PROMO_CAB
            SET PRIORIDAD = TRY_CONVERT(INT, PRIORIDAD) - 1
            WHERE ID_PROM <> @0
              AND TRY_CONVERT(INT, PRIORIDAD) <= @1
              AND TRY_CONVERT(INT, PRIORIDAD) > @2
            `,
            [idProm, targetPriority, current],
          );
        }
      }

      await qr.query(
        `
        UPDATE dbo.PROMO_CAB
        SET PRIORIDAD = @1, MOD_POR = @2, FCMOD = GETDATE()
        WHERE ID_PROM = @0
        `,
        [idProm, targetPriority, modPor],
      );
      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  private async syncLegacyRulesFromConfig(
    qr: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
    idProm: number,
    config: {
      tBeneficio: string;
      prcDesc: number | null;
      impDesc: number | null;
      precioGratis: number | null;
      sucTodas: boolean;
      sucList: string[];
      cliente: number | null;
      depaList: number[];
      subdList: number[];
      clasList: number[];
      sclaList: number[];
      scla2List: number[];
      guiaList: string[];
      artList: string[];
      upcList: string[];
    },
  ) {
    await qr.query(`DELETE FROM dbo.PROMO_REGLA_CRITERIO WHERE ID_PROM = @0`, [idProm]);
    await qr.query(`DELETE FROM dbo.PROMO_REGLA_BENEFICIO WHERE ID_PROM = @0`, [idProm]);

    const sucs = config.sucTodas ? [null] : config.sucList.map((s) => s.toUpperCase());
    const depas = config.depaList.length ? config.depaList : [null];
    const subds = config.subdList.length ? config.subdList : [null];
    const clases = config.clasList.length ? config.clasList : [null];
    const sclas = config.sclaList.length ? config.sclaList : [null];
    const scla2s = config.scla2List.length ? config.scla2List : [null];
    const guias = config.guiaList.length ? config.guiaList : [null];
    const arts = config.artList.length ? config.artList : [null];
    const upcs = config.upcList.length ? config.upcList : [null];

    if (config.artList.length || config.upcList.length) {
      for (const suc of sucs) {
        const selectedArts = config.artList.length ? config.artList : [null];
        const selectedUpcs = config.upcList.length ? config.upcList : [null];
        for (const art of selectedArts) {
          for (const upc of selectedUpcs) {
            await qr.query(
              `
              INSERT INTO dbo.PROMO_REGLA_CRITERIO (
                ID_PROM, SUC, CLIENTE, DEPA, SUBD, CLAS, SCLA, SCLA2, GUIA, ART, UPC, EST
              )
              VALUES (@0, @1, @2, NULL, NULL, NULL, NULL, NULL, NULL, @3, @4, 1)
              `,
              [idProm, suc, config.cliente, art, upc],
            );
          }
        }
      }
    } else {
    for (const suc of sucs) {
      for (const depa of depas) {
        for (const subd of subds) {
          for (const clas of clases) {
            for (const scla of sclas) {
              for (const scla2 of scla2s) {
                for (const guia of guias) {
                  for (const art of arts) {
                    for (const upc of upcs) {
                      await qr.query(
                        `
                        INSERT INTO dbo.PROMO_REGLA_CRITERIO (
                          ID_PROM, SUC, CLIENTE, DEPA, SUBD, CLAS, SCLA, SCLA2, GUIA, ART, UPC, EST
                        )
                        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, 1)
                        `,
                        [
                          idProm,
                          suc,
                          config.cliente,
                          depa,
                          subd,
                          clas,
                          scla,
                          scla2,
                          guia,
                          art,
                          upc,
                        ],
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    }

    await qr.query(
      `
      INSERT INTO dbo.PROMO_REGLA_BENEFICIO (
        ID_PROM, T_BENEFICIO, PRC_DESC, IMP_DESC, ART_GRATIS, UPC_GRATIS,
        CANT_GRATIS, PRECIO_GRATIS, PRIORIDAD, ACUMULABLE, EST
      )
      VALUES (@0, @1, @2, @3, NULL, NULL, NULL, @4, 100, 0, 1)
      `,
      [
        idProm,
        config.tBeneficio,
        config.prcDesc,
        config.impDesc,
        config.precioGratis ?? 0.01,
      ],
    );
  }

  private addLegacySummary(
    target: Map<number, PromoLegacyAggregate>,
    idProm: number,
    tipoRaw: string | null,
    descuento: number,
  ) {
    const current = target.get(idProm);
    const tipo = this.normalizeText(tipoRaw) || current?.tipo || 'DESCUENTO';
    const total = this.round2((current?.total ?? 0) + this.round2(descuento));
    target.set(idProm, { tipo, total });
  }

  private buildLegacyId(base: string, idProm: number) {
    const raw = `${base}|${idProm}`;
    return raw.length > 255 ? raw.slice(0, 255) : raw;
  }

  private async resolveFolioClient(qr: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> }, idfol: string) {
    const rows = await qr.query(
      `
      SELECT TOP 1 TRY_CONVERT(INT, CLIEN) AS CLIENTE
      FROM dbo.PV_CTR_FOL_ASVR
      WHERE IDFOL = @0 OR IDFOLINICIAL = @0
      ORDER BY CASE WHEN IDFOL = @0 THEN 0 ELSE 1 END, ISNULL(FCNM, FCN) DESC
      `,
      [idfol],
    );
    return this.toInt((rows?.[0] as Record<string, unknown>)?.CLIENTE);
  }

  private async persistLegacyPromoTables(
    qr: { query: (sql: string, params?: unknown[]) => Promise<unknown[]> },
    idfol: string,
    legacySummary: Map<number, PromoLegacyAggregate>,
    hasPromoCtrlFolios: boolean,
    hasPromoIdfolApli: boolean,
  ) {
    if (!legacySummary.size) return;
    const cliente = await this.resolveFolioClient(qr, idfol);

    for (const [idProm, agg] of legacySummary.entries()) {
      const idLegacy = this.buildLegacyId(idfol, idProm);
      if (hasPromoIdfolApli) {
        await qr.query(
          `
          MERGE dbo.PROMO_IDFOL_APLI AS T
          USING (
            SELECT @0 AS ID, @1 AS IDFOL, @2 AS PROMO_APLI, @3 AS T_PROM, CAST(NULL AS NVARCHAR(255)) AS IDFOLNVO
          ) AS S
          ON T.ID = S.ID
          WHEN MATCHED THEN
            UPDATE SET
              T.IDFOL = S.IDFOL,
              T.PROMO_APLI = S.PROMO_APLI,
              T.T_PROM = S.T_PROM,
              T.IDFOLNVO = S.IDFOLNVO
          WHEN NOT MATCHED THEN
            INSERT (ID, IDFOL, PROMO_APLI, T_PROM, IDFOLNVO)
            VALUES (S.ID, S.IDFOL, S.PROMO_APLI, S.T_PROM, S.IDFOLNVO);
          `,
          [idLegacy, idfol, agg.total, agg.tipo],
        );
      }

      if (hasPromoCtrlFolios) {
        await qr.query(
          `
          MERGE dbo.PROMO_CTRL_FOLIOS AS T
          USING (
            SELECT @0 AS ID_FOLIO, @1 AS ID_PROMO, @2 AS IDFOL, @3 AS CLIENTE, @4 AS ESTATUS, CAST(NULL AS NVARCHAR(255)) AS IDFOLNVO
          ) AS S
          ON T.ID_FOLIO = S.ID_FOLIO
          WHEN MATCHED THEN
            UPDATE SET
              T.ID_PROMO = S.ID_PROMO,
              T.IDFOL = S.IDFOL,
              T.CLIENTE = S.CLIENTE,
              T.ESTATUS = S.ESTATUS,
              T.IDFOLNVO = S.IDFOLNVO
          WHEN NOT MATCHED THEN
            INSERT (ID_FOLIO, ID_PROMO, IDFOL, CLIENTE, ESTATUS, IDFOLNVO)
            VALUES (S.ID_FOLIO, S.ID_PROMO, S.IDFOL, S.CLIENTE, S.ESTATUS, S.IDFOLNVO);
          `,
          [idLegacy, idProm, idfol, cliente, 'APLICADO'],
        );
      }
    }
  }

  private mapPromoRow(raw: unknown) {
    const row = raw as Record<string, unknown>;
    return {
      idProm: this.toInt(row.ID_PROM) ?? 0,
      suc: this.normalizeNullableText(row.SUC),
      tProm: this.normalizeNullableText(row.T_PROM),
      tipoDesc: this.normalizeNullableText(row.TIPO_DESC),
      fcnIni: this.toIsoDate(row.FCN_INI),
      fcnTer: this.toIsoDate(row.FCN_TER),
      descPromo: this.normalizeNullableText(row.DESC_PROMO),
      impCom: this.toMoney(row.IMP_COM),
      impDesc: this.toMoney(row.IMP_DESC),
      prcDesc: this.toNumber(row.PRC_DESC),
      alcance: this.normalizeNullableText(row.ALCANCE),
      detallePromo: this.normalizeNullableText(row.DETALLE_PROMO),
      est: this.toInt(row.EST),
      regCliente: this.toInt(row.REG_CLIENTE),
      acumulable: this.toInt(row.ACUMULABLE),
      combinable: this.toInt(row.COMBINABLE),
      fPgo: this.normalizeNullableText(row.F_PGO),
      prioridad: this.toInt(row.PRIORIDAD),
      maxApliFolio: this.toInt(row.MAX_APLI_FOLIO),
      creadoPor: this.toInt(row.CREADO_POR),
      fcnr: this.toIsoDate(row.FCNR),
      modPor: this.toInt(row.MOD_POR),
      fcmod: this.toIsoDate(row.FCMOD),
    };
  }

  private mapEvalRow(raw: unknown): PromoEvalRow | null {
    const row = raw as Record<string, unknown>;
    const id = this.normalizeText(row.ID);
    const idfol = this.normalizeText(row.IDFOL);
    const idProm = this.toInt(row.ID_PROM);
    const idBeneficio = this.toInt(row.ID_BENEFICIO);
    const tBeneficio = this.normalizeUpper(row.T_BENEFICIO);
    const pvtat = this.toMoney(row.PVTAT);

    if (!id || !idfol || idProm == null || idBeneficio == null || !tBeneficio) {
      return null;
    }

    return {
      id,
      idfol,
      art: this.normalizeNullableText(row.ART),
      upc: this.normalizeNullableText(row.UPC),
      pvtat: this.round2(pvtat ?? 0),
      idProm,
      descPromo: this.normalizeNullableText(row.DESC_PROMO),
      tProm: this.normalizeNullableText(row.T_PROM),
      idBeneficio,
      tBeneficio,
      prcDesc: this.toNumber(row.PRC_DESC),
      impDesc: this.toMoney(row.IMP_DESC),
      artGratis: this.normalizeNullableText(row.ART_GRATIS),
      upcGratis: this.normalizeNullableText(row.UPC_GRATIS),
      cantGratis: this.toNumber(row.CANT_GRATIS),
      precioGratis: this.toMoney(row.PRECIO_GRATIS),
      prioridad: this.toInt(row.PRIORIDAD) ?? 100,
      acumulable: this.toInt(row.ACUMULABLE) ?? 0,
    };
  }

  private normalizePromoPayload(dto: Partial<CreatePromocionDto>) {
    return {
      SUC: dto.SUC === undefined ? undefined : this.normalizeNullableText(dto.SUC),
      T_PROM:
        dto.T_PROM === undefined ? undefined : this.normalizeNullableText(dto.T_PROM),
      TIPO_DESC:
        dto.TIPO_DESC === undefined
          ? undefined
          : this.normalizeNullableText(dto.TIPO_DESC),
      FCN_INI: dto.FCN_INI === undefined ? undefined : this.normalizeNullableText(dto.FCN_INI),
      FCN_TER: dto.FCN_TER === undefined ? undefined : this.normalizeNullableText(dto.FCN_TER),
      DESC_PROMO:
        dto.DESC_PROMO === undefined
          ? undefined
          : this.normalizeNullableText(dto.DESC_PROMO),
      IMP_COM: dto.IMP_COM === undefined ? undefined : this.toNullableMoney(dto.IMP_COM),
      IMP_DESC: dto.IMP_DESC === undefined ? undefined : this.toNullableMoney(dto.IMP_DESC),
      PRC_DESC: dto.PRC_DESC === undefined ? undefined : this.toNullableNumber(dto.PRC_DESC),
      ALCANCE:
        dto.ALCANCE === undefined ? undefined : this.normalizeNullableText(dto.ALCANCE),
      DETALLE_PROMO:
        dto.DETALLE_PROMO === undefined
          ? undefined
          : this.normalizeNullableText(dto.DETALLE_PROMO),
      EST: dto.EST === undefined ? undefined : this.toNullableInt(dto.EST),
      REG_CLIENTE:
        dto.REG_CLIENTE === undefined ? undefined : this.toNullableInt(dto.REG_CLIENTE),
      ACUMULABLE:
        dto.ACUMULABLE === undefined ? undefined : this.toNullableInt(dto.ACUMULABLE),
      COMBINABLE:
        dto.COMBINABLE === undefined ? undefined : this.toNullableInt(dto.COMBINABLE),
      F_PGO: dto.F_PGO === undefined ? undefined : this.normalizeNullableText(dto.F_PGO),
      PRIORIDAD:
        dto.PRIORIDAD === undefined ? undefined : this.toNullableInt(dto.PRIORIDAD),
      MAX_APLI_FOLIO:
        dto.MAX_APLI_FOLIO === undefined
          ? undefined
          : this.toNullableInt(dto.MAX_APLI_FOLIO),
    };
  }

  private async insertPromoCab(
    data: Record<string, unknown>,
    createdBy: number | null,
  ) {
    const cols: string[] = [];
    const vals: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      cols.push(col);
      vals.push(`@${params.length}`);
      params.push(val);
    };

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      push(key, value);
    }
    push('CREADO_POR', createdBy);

    if (!cols.length) {
      throw new BadRequestException('Sin datos para crear promoción');
    }

    const rows = await this.dataSource.query(
      `
      INSERT INTO dbo.PROMO_CAB (${cols.join(', ')})
      VALUES (${vals.join(', ')});
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS ID_PROM;
      `,
      params,
    );
    const idProm = this.toInt((rows?.[0] as Record<string, unknown>)?.ID_PROM);
    if (idProm == null) {
      throw new ConflictException('No se pudo recuperar ID_PROM');
    }
    return idProm;
  }

  private patchPromoSets(
    sets: string[],
    params: unknown[],
    data: Record<string, unknown>,
  ) {
    const add = (col: string, val: unknown) => {
      sets.push(`${col} = @${params.length}`);
      params.push(val);
    };
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      add(key, value);
    }
  }

  private inferBeneficioType(dto: CreatePromocionBeneficioDto) {
    if (this.toNullableNumber(dto.PRC_DESC) != null) return 'PORCENTAJE';
    if (this.toNullableNumber(dto.IMP_DESC) != null) return 'IMP_FIJO';
    if (
      this.normalizeNullableText(dto.ART_GRATIS) ||
      this.normalizeNullableText(dto.UPC_GRATIS)
    ) {
      return 'ART_GRATIS';
    }
    return '';
  }

  private assertBeneficioType(tipo: string) {
    if (!['PORCENTAJE', 'IMP_FIJO', 'ART_GRATIS'].includes(tipo)) {
      throw new BadRequestException(
        'T_BENEFICIO inválido. Usa PORCENTAJE, IMP_FIJO o ART_GRATIS',
      );
    }
  }

  private async resolveFolioIdfol(idfolInput: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 IDFOL
      FROM dbo.PV_CTR_FOL_ASVR
      WHERE IDFOL = @0 OR IDFOLINICIAL = @0
      ORDER BY CASE WHEN IDFOL = @0 THEN 0 ELSE 1 END, ISNULL(FCNM, FCN) DESC
      `,
      [idfolInput],
    );
    const idfol = this.normalizeText((rows?.[0] as Record<string, unknown>)?.IDFOL);
    if (!idfol) {
      throw new NotFoundException(`No existe folio ${idfolInput}`);
    }
    return idfol;
  }

  private async assertGestionAccess(user: JwtPayload) {
    if (this.isAdmin(user)) return;

    const userId = await this.resolveAccessUserIdWithFallback(user);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new ForbiddenException('Usuario inválido para gestionar promociones');
    }

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 UPPER(LTRIM(RTRIM(ISNULL(r.CODIGO, '')))) AS ROLE_CODE
      FROM dbo.USUARIO u
      LEFT JOIN dbo.ROL r
        ON r.IDROL = u.IDROL
      WHERE u.IDUSUARIO = @0
      `,
      [userId],
    );
    const roleCode = this.normalizeUpper((rows?.[0] as Record<string, unknown>)?.ROLE_CODE);
    if (!PromocionesService.GESTION_ROLE_CODES.has(roleCode)) {
      throw new ForbiddenException(
        'Solo admin, jefe operaciones y supervisor pueden gestionar promociones',
      );
    }
  }

  private assertAdminOnly(user?: JwtPayload | null) {
    if (this.isAdmin(user)) return;
    throw new ForbiddenException('Solo admin puede eliminar promociones');
  }

  private isAdmin(user?: JwtPayload | null) {
    const raw = (user ?? {}) as Record<string, unknown>;
    const username = this.normalizeUpper(
      raw.username ?? raw.USERNAME ?? raw.usuario ?? raw.user ?? '',
    );
    if (username === 'ADMIN') return true;

    const roleId = Number(raw.roleId ?? raw.IDROL ?? raw.idRol ?? raw.id_rol ?? 0);
    const adminRoleIds = this.parseIds(
      process.env.ADMIN_ROLE_IDS,
      process.env.ADMIN_ROLE_ID,
    );
    const allowedRoleIds = adminRoleIds.length ? adminRoleIds : [0, 1];
    if (Number.isFinite(roleId) && allowedRoleIds.includes(roleId)) return true;

    return false;
  }

  private resolveAccessUserId(user?: JwtPayload | null) {
    const raw = (user ?? {}) as Record<string, unknown>;
    const sub = Number(raw.sub ?? raw.SUB ?? 0);
    if (Number.isFinite(sub) && sub > 0) return sub;
    const idUsuario = Number(
      raw.idUsuario ??
        raw.idusuario ??
        raw.IDUSUARIO ??
        raw.userId ??
        raw.userid ??
        raw.USER_ID ??
        raw.id ??
        raw.ID ??
        raw.uid ??
        raw.UID ??
        0,
    );
    if (Number.isFinite(idUsuario) && idUsuario > 0) return idUsuario;
    return 0;
  }

  private async resolveAccessUserIdWithFallback(
    user?: JwtPayload | null,
  ): Promise<number> {
    const directUserId = this.resolveAccessUserId(user);
    if (directUserId > 0) return directUserId;

    const raw = (user ?? {}) as Record<string, unknown>;
    const username = this.normalizeUpper(
      raw.username ?? raw.USERNAME ?? raw.usuario ?? raw.user ?? '',
    );
    if (!username) return 0;

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 u.IDUSUARIO
      FROM dbo.USUARIO u
      WHERE UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, '')))) = @0
      `,
      [username],
    );

    const fallbackUserId =
      this.toInt((rows?.[0] as Record<string, unknown>)?.IDUSUARIO) ?? 0;
    return fallbackUserId > 0 ? fallbackUserId : 0;
  }

  private async resolveAccessUsername(user?: JwtPayload | null) {
    const raw = (user ?? {}) as Record<string, unknown>;
    const tokenUsername = this.normalizeUpper(
      raw.username ?? raw.USERNAME ?? raw.usuario ?? '',
    );
    if (tokenUsername) return tokenUsername;

    const userId = this.resolveAccessUserId(user);
    if (!userId) return '';

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, '')))) AS USERNAME
      FROM dbo.USUARIO u
      WHERE u.IDUSUARIO = @0
      `,
      [userId],
    );
    return this.normalizeUpper((rows?.[0] as Record<string, unknown>)?.USERNAME);
  }

  private normalizeUpper(value: unknown) {
    return this.normalizeText(value).toUpperCase();
  }

  private normalizeText(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeNullableText(value: unknown) {
    const text = this.normalizeText(value);
    return text.length ? text : null;
  }

  private toNumber(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private toNullableNumber(value: unknown) {
    return this.toNumber(value);
  }

  private toNullableInt(value: unknown) {
    const num = this.toNumber(value);
    return num == null ? null : Math.trunc(num);
  }

  private toInt(value: unknown) {
    const num = this.toNumber(value);
    return num == null ? null : Math.trunc(num);
  }

  private toPositiveInt(value: unknown) {
    const n = this.toInt(value);
    return n != null && n > 0 ? n : null;
  }

  private toMoney(value: unknown) {
    const num = this.toNumber(value);
    return num == null ? null : this.round2(num);
  }

  private toNullableMoney(value: unknown) {
    const money = this.toMoney(value);
    return money == null ? null : money;
  }

  private round2(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private parseIntStrict(value: unknown, label: string) {
    const n = this.toInt(value);
    if (n == null || n <= 0) {
      throw new BadRequestException(`${label} inválido`);
    }
    return n;
  }

  private parseBigIntStrict(value: unknown, label: string) {
    try {
      const parsed = BigInt(String(value ?? '').trim());
      if (parsed <= 0n) throw new Error('non positive');
      return parsed;
    } catch {
      throw new BadRequestException(`${label} inválido`);
    }
  }

  private toIsoDate(value: unknown) {
    if (value == null) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  private toBool(value?: unknown) {
    if (value == null) return false;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    return (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'si' ||
      normalized === 'yes'
    );
  }

  private toPositiveNumber(value: unknown) {
    const num = this.toNumber(value);
    if (num == null || num <= 0) return null;
    return num;
  }

  private toPositiveMoney(value: unknown) {
    const num = this.toMoney(value);
    if (num == null || num <= 0) return null;
    return num;
  }

  private extractSqlMessage(error: unknown) {
    if (!error || typeof error !== 'object') return '';
    const e = error as Record<string, unknown>;
    const candidates = [
      e.message,
      (e.originalError as Record<string, unknown> | undefined)?.message,
      (e.cause as Record<string, unknown> | undefined)?.message,
    ];
    for (const c of candidates) {
      const text = this.normalizeText(c);
      if (text) return text;
    }
    return '';
  }
}
