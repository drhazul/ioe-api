import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { CreateOrdFlujoVisDto } from './dto/create-ord-flujo-vis.dto';
import { UpdateOrdFlujoVisDto } from './dto/update-ord-flujo-vis.dto';

type OrdFlujoVisQuery = {
  includeInactive?: string;
  modulo?: string;
  panelMode?: string;
  roleCode?: string;
  esta?: string;
};

type OrdFlujoVisRow = {
  id: number;
  modulo: string;
  panelMode: string;
  roleCode: string;
  esta: number;
  soloExterno: boolean;
  activo: boolean;
  orden: number | null;
  fcreg: string | null;
  fcmod: string | null;
};

type OrdFlujoVisCatalogRole = {
  roleCode: string;
  roleName: string;
};

type OrdFlujoVisCatalogEstado = {
  esta: number;
  tipo: string;
  ordenSugerido: number;
};

@Injectable()
export class OrdFlujoVisService {
  constructor(private readonly dataSource: DataSource) {}

  async getCatalogos() {
    await this.ensureTableExists();
    const [roles, estados] = await Promise.all([
      this.getRolesCatalog(),
      this.getEstadosCatalog(),
    ]);
    return {
      modulo: 'DAT_JAO_ORD',
      roles,
      estados,
    };
  }

  async findAll(query?: OrdFlujoVisQuery) {
    await this.ensureTableExists();
    const includeInactive = this.toBool(query?.includeInactive);
    const filters: string[] = [];
    const params: unknown[] = [];

    if (!includeInactive) {
      filters.push('ISNULL(TRY_CONVERT(INT, ACTIVO), 1) = 1');
    }

    const modulo = this.normalizeModulo(query?.modulo, { required: false });
    if (modulo) {
      filters.push(`UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) = ${this.param(params.length)}`);
      params.push(modulo);
    }

    const panelMode = this.normalizePanelMode(query?.panelMode, {
      required: false,
    });
    if (panelMode) {
      filters.push(
        `LOWER(LTRIM(RTRIM(ISNULL(PANEL_MODE, '')))) = ${this.param(params.length)}`,
      );
      params.push(panelMode);
    }

    const roleCode = this.normalizeRoleCode(query?.roleCode, {
      required: false,
    });
    if (roleCode) {
      filters.push(
        `UPPER(LTRIM(RTRIM(ISNULL(ROLE_CODE, '')))) = ${this.param(params.length)}`,
      );
      params.push(roleCode);
    }

    const esta = this.toFloatOrNull(query?.esta);
    if (esta != null) {
      filters.push(
        `ROUND(TRY_CONVERT(DECIMAL(10,3), ESTA), 3) = ROUND(TRY_CONVERT(DECIMAL(10,3), ${this.param(params.length)}), 3)`,
      );
      params.push(esta);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = await this.dataSource.query(
      `
      SELECT
        TRY_CONVERT(INT, ID) AS ID,
        UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) AS MODULO,
        LOWER(LTRIM(RTRIM(ISNULL(PANEL_MODE, '')))) AS PANEL_MODE,
        UPPER(LTRIM(RTRIM(ISNULL(ROLE_CODE, '')))) AS ROLE_CODE,
        TRY_CONVERT(FLOAT, ESTA) AS ESTA,
        CASE WHEN ISNULL(TRY_CONVERT(INT, SOLO_EXTERNO), 0) = 1 THEN 1 ELSE 0 END AS SOLO_EXTERNO,
        CASE WHEN ISNULL(TRY_CONVERT(INT, ACTIVO), 1) = 1 THEN 1 ELSE 0 END AS ACTIVO,
        TRY_CONVERT(INT, ORDEN) AS ORDEN,
        TRY_CONVERT(VARCHAR(30), FCREG, 126) AS FCREG,
        TRY_CONVERT(VARCHAR(30), FCMOD, 126) AS FCMOD
      FROM dbo.DAT_JAO_ORD_FLUJO_VIS
      ${whereSql}
      ORDER BY
        MODULO ASC,
        PANEL_MODE ASC,
        ROLE_CODE ASC,
        CASE WHEN ORDEN IS NULL THEN 1 ELSE 0 END ASC,
        ORDEN ASC,
        ESTA ASC
      `,
      params,
    );

    return (Array.isArray(rows) ? rows : [])
      .map((row) => this.mapRow(row))
      .filter((item): item is OrdFlujoVisRow => item != null);
  }

  async findOne(idRaw: string) {
    await this.ensureTableExists();
    const id = this.parseId(idRaw);

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        TRY_CONVERT(INT, ID) AS ID,
        UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) AS MODULO,
        LOWER(LTRIM(RTRIM(ISNULL(PANEL_MODE, '')))) AS PANEL_MODE,
        UPPER(LTRIM(RTRIM(ISNULL(ROLE_CODE, '')))) AS ROLE_CODE,
        TRY_CONVERT(FLOAT, ESTA) AS ESTA,
        CASE WHEN ISNULL(TRY_CONVERT(INT, SOLO_EXTERNO), 0) = 1 THEN 1 ELSE 0 END AS SOLO_EXTERNO,
        CASE WHEN ISNULL(TRY_CONVERT(INT, ACTIVO), 1) = 1 THEN 1 ELSE 0 END AS ACTIVO,
        TRY_CONVERT(INT, ORDEN) AS ORDEN,
        TRY_CONVERT(VARCHAR(30), FCREG, 126) AS FCREG,
        TRY_CONVERT(VARCHAR(30), FCMOD, 126) AS FCMOD
      FROM dbo.DAT_JAO_ORD_FLUJO_VIS
      WHERE TRY_CONVERT(INT, ID) = @0
      `,
      [id],
    );

    const mapped = this.mapRow(rows?.[0]);
    if (!mapped) {
      throw new NotFoundException(`DAT_JAO_ORD_FLUJO_VIS ${id} no existe`);
    }
    return mapped;
  }

  async create(dto: CreateOrdFlujoVisDto) {
    await this.ensureTableExists();
    const payload = await this.normalizePayload(dto);
    await this.assertUnique(payload);

    try {
      const rows = await this.dataSource.query(
        `
        INSERT INTO dbo.DAT_JAO_ORD_FLUJO_VIS
          (MODULO, PANEL_MODE, ROLE_CODE, ESTA, SOLO_EXTERNO, ACTIVO, ORDEN, FCREG, FCMOD)
        VALUES
          (@0, @1, @2, @3, @4, @5, @6, GETDATE(), NULL);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS ID;
        `,
        [
          payload.modulo,
          payload.panelMode,
          payload.roleCode,
          payload.esta,
          payload.soloExterno ? 1 : 0,
          payload.activo ? 1 : 0,
          payload.orden,
        ],
      );

      const id = this.toInt((rows?.[0] as Record<string, unknown>)?.ID);
      if (!id) {
        throw new ConflictException('No se pudo recuperar ID creado');
      }
      return this.findOne(String(id));
    } catch (err) {
      this.handleWriteError(err);
    }
  }

  async update(idRaw: string, dto: UpdateOrdFlujoVisDto) {
    await this.ensureTableExists();
    const id = this.parseId(idRaw);
    await this.ensureExists(id);

    const sets: string[] = [];
    const params: unknown[] = [];
    const addSet = (column: string, value: unknown) => {
      sets.push(`${column} = ${this.param(params.length)}`);
      params.push(value);
    };

    let modulo: string | undefined;
    let panelMode: string | undefined;
    let roleCode: string | undefined;
    let esta: number | undefined;

    if (dto.MODULO !== undefined) {
      modulo = this.normalizeModulo(dto.MODULO, { required: true });
      addSet('MODULO', modulo);
    }
    if (dto.PANEL_MODE !== undefined) {
      panelMode = this.normalizePanelMode(dto.PANEL_MODE, { required: true });
      addSet('PANEL_MODE', panelMode);
    }
    if (dto.ROLE_CODE !== undefined) {
      roleCode =
        this.normalizeRoleCode(dto.ROLE_CODE, { required: true }) ?? '';
      await this.ensureRoleCodeExists(roleCode);
      addSet('ROLE_CODE', roleCode);
    }
    if (dto.ESTA !== undefined) {
      esta = await this.ensureValidEsta(dto.ESTA);
      addSet('ESTA', esta);
      addSet('ORDEN', this.buildOrdenFromEsta(esta));
    }
    if (dto.SOLO_EXTERNO !== undefined) {
      addSet('SOLO_EXTERNO', dto.SOLO_EXTERNO ? 1 : 0);
    }
    if (dto.ACTIVO !== undefined) {
      addSet('ACTIVO', dto.ACTIVO ? 1 : 0);
    }
    if (!sets.length) {
      return this.findOne(String(id));
    }

    const current = await this.findOne(String(id));
    await this.assertUnique(
      {
        modulo: modulo ?? current.modulo,
        panelMode: panelMode ?? current.panelMode,
        roleCode: roleCode ?? current.roleCode,
        esta: esta ?? current.esta,
        soloExterno: dto.SOLO_EXTERNO ?? current.soloExterno,
        activo: dto.ACTIVO ?? current.activo,
        orden: esta !== undefined ? this.buildOrdenFromEsta(esta) : current.orden,
      },
      id,
    );

    try {
      await this.dataSource.query(
        `
        UPDATE dbo.DAT_JAO_ORD_FLUJO_VIS
        SET ${sets.join(', ')},
            FCMOD = GETDATE()
        WHERE TRY_CONVERT(INT, ID) = ${this.param(params.length)}
        `,
        [...params, id],
      );
      return this.findOne(String(id));
    } catch (err) {
      this.handleWriteError(err);
    }
  }

  async updateEstado(idRaw: string, estado: boolean) {
    const updated = await this.update(idRaw, { ACTIVO: estado });
    return {
      updated: true,
      id: updated.id,
      activo: updated.activo,
    };
  }

  async remove(idRaw: string) {
    await this.ensureTableExists();
    const id = this.parseId(idRaw);
    await this.ensureExists(id);

    try {
      await this.dataSource.query(
        `
        DELETE FROM dbo.DAT_JAO_ORD_FLUJO_VIS
        WHERE TRY_CONVERT(INT, ID) = @0
        `,
        [id],
      );
    } catch (err) {
      this.handleWriteError(err);
    }

    return {
      deleted: true,
      id,
    };
  }

  private async assertUnique(
    payload: {
      modulo: string;
      panelMode: string;
      roleCode: string;
      esta: number;
      soloExterno: boolean;
      activo: boolean;
      orden: number | null;
    },
    excludeId?: number,
  ) {
    const params: unknown[] = [
      payload.modulo,
      payload.panelMode,
      payload.roleCode,
      payload.esta,
    ];

    let sql = `
      SELECT TOP 1 TRY_CONVERT(INT, ID) AS ID
      FROM dbo.DAT_JAO_ORD_FLUJO_VIS
      WHERE UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) = @0
        AND LOWER(LTRIM(RTRIM(ISNULL(PANEL_MODE, '')))) = @1
        AND UPPER(LTRIM(RTRIM(ISNULL(ROLE_CODE, '')))) = @2
        AND ROUND(TRY_CONVERT(DECIMAL(10,3), ESTA), 3) = ROUND(TRY_CONVERT(DECIMAL(10,3), @3), 3)
    `;

    if (excludeId != null) {
      sql += ` AND TRY_CONVERT(INT, ID) <> @4`;
      params.push(excludeId);
    }

    const rows = await this.dataSource.query(sql, params);
    if (rows?.length) {
      throw new ConflictException(
        `Ya existe configuración para ${payload.modulo}/${payload.panelMode}/${payload.roleCode}/ESTA=${payload.esta}`,
      );
    }
  }

  private async normalizePayload(dto: CreateOrdFlujoVisDto) {
    const modulo = this.normalizeModulo(dto.MODULO, { required: true });
    const panelMode = this.normalizePanelMode(dto.PANEL_MODE, {
      required: true,
    });
    const roleCode =
      this.normalizeRoleCode(dto.ROLE_CODE, { required: true }) ?? '';
    await this.ensureRoleCodeExists(roleCode);
    if (!modulo || !panelMode || !roleCode) {
      throw new BadRequestException('MODULO, PANEL_MODE y ROLE_CODE son requeridos');
    }
    const esta = await this.ensureValidEsta(dto.ESTA);
    return {
      modulo,
      panelMode,
      roleCode,
      esta,
      soloExterno: dto.SOLO_EXTERNO ?? false,
      activo: dto.ACTIVO ?? true,
      orden: this.buildOrdenFromEsta(esta),
    };
  }

  private normalizeModulo(
    value: unknown,
    options: { required: boolean },
  ): string | undefined {
    const text = String(value ?? '')
      .trim()
      .toUpperCase();
    if (!text) {
      if (options.required) {
        throw new BadRequestException('MODULO es requerido');
      }
      return undefined;
    }
    if (text.length > 50) {
      throw new BadRequestException('MODULO excede 50 caracteres');
    }
    return text;
  }

  private normalizePanelMode(
    value: unknown,
    options: { required: boolean },
  ): string | undefined {
    const text = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!text) {
      if (options.required) {
        throw new BadRequestException('PANEL_MODE es requerido');
      }
      return undefined;
    }
    const allowed = new Set(['operativo', 'estado', 'anulados', 'entregadas']);
    if (!allowed.has(text)) {
      throw new BadRequestException(
        'PANEL_MODE invalido. Use operativo|estado|anulados|entregadas',
      );
    }
    return text;
  }

  private normalizeRoleCode(
    value: unknown,
    options: { required: boolean },
  ): string | undefined {
    const text = String(value ?? '')
      .trim()
      .toUpperCase();
    if (!text) {
      if (options.required) {
        throw new BadRequestException('ROLE_CODE es requerido');
      }
      return undefined;
    }
    if (text.length > 50) {
      throw new BadRequestException('ROLE_CODE excede 50 caracteres');
    }
    return text;
  }

  private async ensureValidEsta(value: unknown) {
    const parsed = this.toFloatOrNull(value);
    if (parsed == null) {
      throw new BadRequestException('ESTA debe ser numerico');
    }
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 1 AS OK
      FROM dbo.DAT_EST_ORD
      WHERE ROUND(TRY_CONVERT(DECIMAL(10,3), ESTA), 3) = ROUND(TRY_CONVERT(DECIMAL(10,3), @0), 3)
      `,
      [parsed],
    );
    if (!rows?.length) {
      throw new BadRequestException(`ESTA ${parsed} no existe en DAT_EST_ORD`);
    }
    return parsed;
  }

  private buildOrdenFromEsta(esta: number) {
    return Math.round(esta * 10);
  }

  private async ensureRoleCodeExists(roleCode: string) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 IDROL
      FROM dbo.ROL
      WHERE UPPER(LTRIM(RTRIM(ISNULL(CODIGO, '')))) = @0
      `,
      [roleCode.trim().toUpperCase()],
    );
    if (!rows?.length) {
      throw new BadRequestException(`ROLE_CODE ${roleCode} no existe en ROL`);
    }
  }

  private parseId(value: unknown) {
    const id = this.toInt(value);
    if (id == null || id <= 0) {
      throw new BadRequestException('id invalido');
    }
    return id;
  }

  private param(index: number) {
    return `@${index}`;
  }

  private toBool(value?: string) {
    const text = String(value ?? '')
      .trim()
      .toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'si';
  }

  private toFloatOrNull(value: unknown) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const num = Number(text);
    return Number.isFinite(num) ? num : null;
  }

  private toInt(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : null;
  }

  private mapRow(row: unknown): OrdFlujoVisRow | null {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    const id = this.toInt(r.ID);
    const modulo = String(r.MODULO ?? '').trim().toUpperCase();
    const panelMode = String(r.PANEL_MODE ?? '').trim().toLowerCase();
    const roleCode = String(r.ROLE_CODE ?? '').trim().toUpperCase();
    const esta = this.toFloatOrNull(r.ESTA);
    if (!id || !modulo || !panelMode || !roleCode || esta == null) return null;

    return {
      id,
      modulo,
      panelMode,
      roleCode,
      esta,
      soloExterno: this.toInt(r.SOLO_EXTERNO) === 1,
      activo: this.toInt(r.ACTIVO) !== 0,
      orden: this.toInt(r.ORDEN),
      fcreg: String(r.FCREG ?? '').trim() || null,
      fcmod: String(r.FCMOD ?? '').trim() || null,
    };
  }

  private async ensureExists(id: number) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 TRY_CONVERT(INT, ID) AS ID
      FROM dbo.DAT_JAO_ORD_FLUJO_VIS
      WHERE TRY_CONVERT(INT, ID) = @0
      `,
      [id],
    );
    if (!rows?.length) {
      throw new NotFoundException(`DAT_JAO_ORD_FLUJO_VIS ${id} no existe`);
    }
  }

  private async ensureTableExists() {
    const rows = await this.dataSource.query(`
      SELECT CASE WHEN OBJECT_ID('dbo.DAT_JAO_ORD_FLUJO_VIS') IS NULL THEN 0 ELSE 1 END AS EXISTS_TABLE
    `);
    const exists =
      Number(
        (rows?.[0] as Record<string, unknown> | undefined)?.EXISTS_TABLE ?? 0,
      ) === 1;
    if (!exists) {
      throw new NotFoundException(
        'No existe tabla dbo.DAT_JAO_ORD_FLUJO_VIS. Ejecute sql/2026-05-03_dat_jao_ord_flujo_vis.sql',
      );
    }
  }

  private async getRolesCatalog(): Promise<OrdFlujoVisCatalogRole[]> {
    const rows = await this.dataSource.query(`
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(r.CODIGO, '')))) AS ROLE_CODE,
        LTRIM(RTRIM(ISNULL(r.NOMBRE, ''))) AS ROLE_NAME
      FROM dbo.ROL r
      INNER JOIN dbo.DEPARTAMENTO d
        ON d.IDDEPTO = r.IDDEPTO
      WHERE ISNULL(TRY_CONVERT(INT, r.ACTIVO), 0) = 1
        AND ISNULL(TRY_CONVERT(INT, d.ACTIVO), 0) = 1
        AND UPPER(LTRIM(RTRIM(ISNULL(d.NOMBRE, '')))) = 'TALLER'
        AND LTRIM(RTRIM(ISNULL(r.CODIGO, ''))) <> ''
      ORDER BY UPPER(LTRIM(RTRIM(ISNULL(r.CODIGO, ''))))
    `);

    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        const roleCode = String(r.ROLE_CODE ?? '')
          .trim()
          .toUpperCase();
        if (!roleCode) return null;
        return {
          roleCode,
          roleName: String(r.ROLE_NAME ?? '').trim(),
        };
      })
      .filter((item): item is OrdFlujoVisCatalogRole => item != null);
  }

  private async getEstadosCatalog(): Promise<OrdFlujoVisCatalogEstado[]> {
    const rows = await this.dataSource.query(`
      SELECT
        TRY_CONVERT(FLOAT, ESTA) AS ESTA,
        LTRIM(RTRIM(ISNULL(TIPO, ''))) AS TIPO
      FROM dbo.DAT_EST_ORD
      WHERE TRY_CONVERT(FLOAT, ESTA) IS NOT NULL
      ORDER BY TRY_CONVERT(FLOAT, ESTA)
    `);

    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        const esta = this.toFloatOrNull(r.ESTA);
        if (esta == null) return null;
        return {
          esta,
          tipo: String(r.TIPO ?? '').trim(),
          ordenSugerido: this.buildOrdenFromEsta(esta),
        };
      })
      .filter((item): item is OrdFlujoVisCatalogEstado => item != null);
  }

  private handleWriteError(err: unknown): never {
    if (err instanceof QueryFailedError) {
      const message = String((err as { message?: unknown }).message ?? '');
      const upper = message.toUpperCase();
      if (
        upper.includes('UNIQUE') ||
        upper.includes('DUPLICATE') ||
        upper.includes('UX_DAT_JAO_ORD_FLUJO_VIS_UNQ')
      ) {
        throw new ConflictException('Ya existe el registro para MODULO/PANEL_MODE/ROLE_CODE/ESTA');
      }
      if (upper.includes('REFERENCE') || upper.includes('FOREIGN KEY')) {
        throw new ConflictException(
          'No se puede eliminar/actualizar porque el registro está referenciado',
        );
      }
    }
    throw err;
  }
}
