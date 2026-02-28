import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { CreateDatFormDto } from './dto/create-dat-form.dto';
import { UpdateDatFormDto } from './dto/update-dat-form.dto';

type DatFormQuery = {
  includeInactive?: string;
  form?: string;
  nom?: string;
  estado?: string;
};

type DatFormColumns = {
  hasId: boolean;
  hasAspel: boolean;
  hasForm: boolean;
  hasNom: boolean;
  hasEstado: boolean;
};

type DatFormRow = {
  idform: number | null;
  aspel: number | null;
  form: string;
  nom: string;
  estado: boolean;
};

@Injectable()
export class DatFormService {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(query?: DatFormQuery) {
    const cols = await this.getColumns();
    this.ensureFormColumn(cols);

    const includeInactive = this.toBool(query?.includeInactive);
    const estadoFilter = this.toBoolOrNull(query?.estado);

    const filters: string[] = [];
    const params: unknown[] = [];

    if (cols.hasEstado) {
      if (estadoFilter != null) {
        filters.push(`ISNULL(TRY_CONVERT(INT, ESTADO), 1) = ${estadoFilter ? 1 : 0}`);
      } else if (!includeInactive) {
        filters.push('ISNULL(TRY_CONVERT(INT, ESTADO), 1) = 1');
      }
    }

    const formText = String(query?.form ?? '').trim().toUpperCase();
    if (formText.length > 0) {
      filters.push(
        `UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) LIKE ${this.param(params.length)}`,
      );
      params.push(`%${formText}%`);
    }

    const nomText = String(query?.nom ?? '').trim().toUpperCase();
    if (cols.hasNom && nomText.length > 0) {
      filters.push(
        `UPPER(LTRIM(RTRIM(ISNULL(NOM, '')))) LIKE ${this.param(params.length)}`,
      );
      params.push(`%${nomText}%`);
    }

    const estadoExpr = cols.hasEstado
      ? "CASE WHEN ISNULL(TRY_CONVERT(INT, ESTADO), 1) = 1 THEN 1 ELSE 0 END"
      : '1';
    const whereSql = filters.length == 0 ? '' : `WHERE ${filters.join(' AND ')}`;

    const sql = `
      SELECT
        ${cols.hasId ? 'TRY_CONVERT(INT, IDFORM)' : 'NULL'} AS IDFORM,
        ${cols.hasAspel ? 'TRY_CONVERT(INT, ASPEL)' : 'NULL'} AS ASPEL,
        UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) AS FORM,
        ${cols.hasNom ? "LTRIM(RTRIM(ISNULL(NOM, '')))" : "''"} AS NOM,
        ${estadoExpr} AS ESTADO
      FROM dbo.DAT_FORM
      ${whereSql}
      ORDER BY
        CASE WHEN ${cols.hasAspel ? 'ASPEL' : 'NULL'} IS NULL THEN 1 ELSE 0 END,
        ${cols.hasAspel ? 'ASPEL' : 'FORM'} ASC,
        FORM ASC
    `;

    const rows = await this.dataSource.query(sql, params);
    return (rows ?? [])
      .map((row) => this.mapRow(row, cols))
      .filter((item): item is NonNullable<typeof item> => item != null);
  }

  async findOne(idformRaw: string) {
    const idform = this.parseId(idformRaw);
    const cols = await this.getColumns();
    this.ensureIdColumn(cols);
    this.ensureFormColumn(cols);

    const rows = await this.dataSource.query(
      `
      SELECT TOP 1
        TRY_CONVERT(INT, IDFORM) AS IDFORM,
        ${cols.hasAspel ? 'TRY_CONVERT(INT, ASPEL)' : 'NULL'} AS ASPEL,
        UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) AS FORM,
        ${cols.hasNom ? "LTRIM(RTRIM(ISNULL(NOM, '')))" : "''"} AS NOM,
        ${
          cols.hasEstado
            ? "CASE WHEN ISNULL(TRY_CONVERT(INT, ESTADO), 1) = 1 THEN 1 ELSE 0 END"
            : '1'
        } AS ESTADO
      FROM dbo.DAT_FORM
      WHERE IDFORM = @0
      `,
      [idform],
    );

    if (!rows?.length) {
      throw new NotFoundException(`DAT_FORM ${idform} no existe`);
    }
    const mapped = this.mapRow(rows[0], cols);
    if (!mapped) {
      throw new NotFoundException(`DAT_FORM ${idform} no existe`);
    }
    return mapped;
  }

  async create(dto: CreateDatFormDto) {
    const cols = await this.getColumns();
    this.ensureIdColumn(cols);
    this.ensureFormColumn(cols);

    if (dto.ASPEL !== undefined && !cols.hasAspel) {
      throw new ConflictException('DAT_FORM no contiene columna ASPEL');
    }
    if (dto.NOM !== undefined && !cols.hasNom) {
      throw new ConflictException('DAT_FORM no contiene columna NOM');
    }
    if (dto.ESTADO !== undefined && !cols.hasEstado) {
      throw new ConflictException(
        'DAT_FORM no contiene columna ESTADO. Ejecute sql/DAT_FORM_schema_alter.sql',
      );
    }

    const form = this.normalizeForm(dto.FORM);
    await this.assertFormUnique(form, cols);

    const insertCols: string[] = [];
    const insertVals: string[] = [];
    const params: unknown[] = [];
    const addValue = (col: string, value: unknown) => {
      insertCols.push(col);
      insertVals.push(this.param(params.length));
      params.push(value);
    };

    if (cols.hasAspel && dto.ASPEL !== undefined) {
      addValue('ASPEL', dto.ASPEL == null ? null : Math.trunc(dto.ASPEL));
    }
    addValue('FORM', form);
    if (cols.hasNom && dto.NOM !== undefined) {
      addValue('NOM', this.normalizeText(dto.NOM));
    }
    if (cols.hasEstado && dto.ESTADO !== undefined) {
      addValue('ESTADO', dto.ESTADO ? 1 : 0);
    }

    try {
      const rows = await this.dataSource.query(
        `
        INSERT INTO dbo.DAT_FORM (${insertCols.join(', ')})
        VALUES (${insertVals.join(', ')});
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS IDFORM;
        `,
        params,
      );
      const createdId = this.toInt((rows?.[0] as Record<string, unknown>)?.IDFORM);
      if (createdId == null) {
        throw new ConflictException('No se pudo recuperar IDFORM al crear DAT_FORM');
      }
      return this.findOne(String(createdId));
    } catch (err) {
      this.handleWriteError(err, form);
    }
  }

  async update(idformRaw: string, dto: UpdateDatFormDto) {
    const idform = this.parseId(idformRaw);
    const cols = await this.getColumns();
    this.ensureIdColumn(cols);
    this.ensureFormColumn(cols);
    await this.ensureExists(idform);

    const sets: string[] = [];
    const params: unknown[] = [];
    const addSet = (col: string, value: unknown) => {
      sets.push(`${col} = ${this.param(params.length)}`);
      params.push(value);
    };

    if (dto.ASPEL !== undefined) {
      if (!cols.hasAspel) throw new ConflictException('DAT_FORM no contiene columna ASPEL');
      addSet('ASPEL', dto.ASPEL == null ? null : Math.trunc(dto.ASPEL));
    }

    if (dto.FORM !== undefined) {
      const form = this.normalizeForm(dto.FORM);
      await this.assertFormUnique(form, cols, idform);
      addSet('FORM', form);
    }

    if (dto.NOM !== undefined) {
      if (!cols.hasNom) throw new ConflictException('DAT_FORM no contiene columna NOM');
      addSet('NOM', this.normalizeText(dto.NOM));
    }

    if (dto.ESTADO !== undefined) {
      if (!cols.hasEstado) {
        throw new ConflictException(
          'DAT_FORM no contiene columna ESTADO. Ejecute sql/DAT_FORM_schema_alter.sql',
        );
      }
      addSet('ESTADO', dto.ESTADO ? 1 : 0);
    }

    if (sets.length == 0) {
      return this.findOne(String(idform));
    }

    try {
      await this.dataSource.query(
        `
        UPDATE dbo.DAT_FORM
        SET ${sets.join(', ')}
        WHERE IDFORM = ${this.param(params.length)}
        `,
        [...params, idform],
      );
      return this.findOne(String(idform));
    } catch (err) {
      this.handleWriteError(err);
    }
  }

  async updateEstado(idformRaw: string, estado: boolean) {
    const updated = await this.update(idformRaw, { ESTADO: estado });
    const idform = updated.idform ?? this.parseId(idformRaw);

    return {
      updated: true,
      idform,
      estado: updated.estado,
    };
  }

  async remove(idformRaw: string) {
    const idform = this.parseId(idformRaw);
    const cols = await this.getColumns();
    this.ensureIdColumn(cols);
    await this.ensureExists(idform);

    try {
      await this.dataSource.query(
        `
        DELETE FROM dbo.DAT_FORM
        WHERE IDFORM = @0
        `,
        [idform],
      );
    } catch (err) {
      this.handleWriteError(err);
    }

    return {
      deleted: true,
      idform,
    };
  }

  private async getColumns(): Promise<DatFormColumns> {
    const existsRows = await this.dataSource.query(
      `
      SELECT CASE WHEN OBJECT_ID('dbo.DAT_FORM') IS NULL THEN 0 ELSE 1 END AS EXISTS_TABLE
      `,
    );
    const exists =
      Number((existsRows?.[0] as Record<string, unknown> | undefined)?.EXISTS_TABLE ?? 0) ===
      1;
    if (!exists) {
      throw new NotFoundException('No existe tabla dbo.DAT_FORM');
    }

    const columns = await this.dataSource.query(
      `
      SELECT UPPER(name) AS COL
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.DAT_FORM')
      `,
    );
    const cols = new Set<string>(
      (columns ?? []).map((row) =>
        String((row as Record<string, unknown>).COL ?? '').trim().toUpperCase(),
      ),
    );

    return {
      hasId: cols.has('IDFORM'),
      hasAspel: cols.has('ASPEL'),
      hasForm: cols.has('FORM'),
      hasNom: cols.has('NOM'),
      hasEstado: cols.has('ESTADO'),
    };
  }

  private ensureIdColumn(cols: DatFormColumns) {
    if (!cols.hasId) {
      throw new ConflictException(
        'DAT_FORM no contiene IDFORM. Ejecute sql/DAT_FORM_schema_alter.sql',
      );
    }
  }

  private ensureFormColumn(cols: DatFormColumns) {
    if (!cols.hasForm) {
      throw new NotFoundException('La tabla DAT_FORM no contiene columna FORM');
    }
  }

  private async ensureExists(idform: number) {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 IDFORM
      FROM dbo.DAT_FORM
      WHERE IDFORM = @0
      `,
      [idform],
    );
    if (!rows?.length) {
      throw new NotFoundException(`DAT_FORM ${idform} no existe`);
    }
  }

  private async assertFormUnique(form: string, cols: DatFormColumns, excludeId?: number) {
    const params: unknown[] = [form];
    let sql = `
      SELECT TOP 1 ${cols.hasId ? 'IDFORM' : 'FORM'} AS KEYVAL
      FROM dbo.DAT_FORM
      WHERE UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) = ${this.param(0)}
    `;

    if (excludeId != null && cols.hasId) {
      sql += ` AND IDFORM <> ${this.param(1)}`;
      params.push(excludeId);
    }

    const rows = await this.dataSource.query(sql, params);
    if (rows?.length) {
      throw new ConflictException(`La forma ${form} ya existe en DAT_FORM`);
    }
  }

  private mapRow(row: unknown, cols: DatFormColumns): DatFormRow | null {
    const r = row as Record<string, unknown>;
    const form = String(r.FORM ?? '').trim().toUpperCase();
    if (!form) return null;

    return {
      idform: cols.hasId ? this.toInt(r.IDFORM) : null,
      aspel: cols.hasAspel ? this.toInt(r.ASPEL) : null,
      form,
      nom: cols.hasNom ? String(r.NOM ?? '').trim() : '',
      estado: cols.hasEstado ? Number(r.ESTADO ?? 0) === 1 : true,
    };
  }

  private normalizeForm(value: string) {
    const form = String(value ?? '').trim().toUpperCase();
    if (form.length == 0) {
      throw new BadRequestException('FORM es requerido');
    }
    if (form.length > 50) {
      throw new BadRequestException('FORM excede 50 caracteres');
    }
    return form;
  }

  private normalizeText(value: string | null | undefined) {
    const text = String(value ?? '').trim();
    if (text.length == 0) return null;
    return text.length > 50 ? text.substring(0, 50) : text;
  }

  private parseId(value: unknown) {
    const id = this.toInt(value);
    if (id == null || id <= 0) {
      throw new BadRequestException('idform invalido');
    }
    return id;
  }

  private param(index: number) {
    return `@${index}`;
  }

  private handleWriteError(err: unknown, form?: string): never {
    if (err instanceof QueryFailedError) {
      const message = String((err as { message?: unknown }).message ?? '');
      const messageUpper = message.toUpperCase();
      if (
        messageUpper.includes('UNIQUE') ||
        messageUpper.includes('DUPLICATE') ||
        messageUpper.includes('PK_DAT_FORM') ||
        messageUpper.includes('UQ_')
      ) {
        throw new ConflictException(
          `La forma ${form ?? ''} ya existe en DAT_FORM`.trim(),
        );
      }
      if (
        messageUpper.includes('REFERENCE') ||
        messageUpper.includes('FOREIGN KEY') ||
        messageUpper.includes('CONSTRAINT')
      ) {
        throw new ConflictException(
          'No se puede eliminar/actualizar DAT_FORM porque está referenciada por otros registros',
        );
      }
    }
    throw err;
  }

  private toBool(value?: string) {
    const text = String(value ?? '').trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'si';
  }

  private toBoolOrNull(value?: string) {
    const text = String(value ?? '').trim().toLowerCase();
    if (text.length == 0) return null;
    if (text === '1' || text === 'true' || text === 'yes' || text === 'si') {
      return true;
    }
    if (text === '0' || text === 'false' || text === 'no') {
      return false;
    }
    return null;
  }

  private toInt(value: unknown) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : null;
  }
}
