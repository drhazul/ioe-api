import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { UsrModSucEntity } from '../usr-mod-suc/usr-mod-suc.entity';
import { CtrlCtasConsultaDto } from './dto/ctrl-ctas-consulta.dto';

@Injectable()
export class CtrlCtasService {
  private static readonly CTRL_CTAS_MODULE_CODES = [
    'DAT_CONS_CTAS',
    'DAT_CTRL_CTAS',
    'DAT_CTRL_CUENTAS',
  ] as const;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UsrModSucEntity)
    private readonly usrModSucRepo: Repository<UsrModSucEntity>,
  ) {}

  private isAdmin(user?: JwtPayload | null) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private normalizeList(values?: string[]) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of values ?? []) {
      const value = String(raw ?? '').trim();
      if (!value.length || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }

  private parseDate(value?: string) {
    if (!value) return null;
    const normalized = value.trim();
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Fecha invalida: ${value}`);
    }
    return normalized;
  }

  private normalizeDateRange(
    fecIniRaw: string | null,
    fecFinRaw: string | null,
  ) {
    // Compatibilidad con SPs legacy que, al recibir NULL, fuerzan ventana corta.
    const minDate = '1900-01-01';
    const maxDate = '2100-12-31';

    const fecIni = fecIniRaw ?? minDate;
    const fecFin = fecFinRaw ?? maxDate;

    const start = new Date(fecIni);
    const end = new Date(fecFin);
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        'Rango de fechas invalido: fecIni es mayor a fecFin',
      );
    }

    return { fecIni, fecFin };
  }

  private requireUserSuc(user?: JwtPayload | null) {
    const suc = String(user?.suc ?? '').trim();
    if (!suc.length) {
      throw new ForbiddenException('Usuario sin sucursal asignada');
    }
    return suc;
  }

  private async resolveAuthorizedSucs(user: JwtPayload) {
    if (this.isAdmin(user)) return [];

    const username = String(user?.username ?? '').trim();
    if (!username.length) {
      throw new ForbiddenException('Usuario sin username');
    }

    const rows = await this.usrModSucRepo.find({
      select: { SUC: true },
      where: {
        USUARIO: username,
        ACTIVO: true,
        MODULO: In([...CtrlCtasService.CTRL_CTAS_MODULE_CODES]),
      },
      order: { SUC: 'ASC' },
    });

    const sucs = this.normalizeList(rows.map((row) => row.SUC));
    if (sucs.length) return sucs;

    // Compatibilidad legacy: si no hay asignaciones en USR_MOD_SUC, mantiene la SUC del usuario.
    return [this.requireUserSuc(user)];
  }

  private async resolveSucs(user: JwtPayload, sucs?: string[]) {
    const requested = this.normalizeList(sucs);

    if (this.isAdmin(user)) {
      return requested;
    }

    const allowed = await this.resolveAuthorizedSucs(user);
    if (!requested.length) return allowed;

    const allowedSet = new Set(allowed);
    const filtered = requested.filter((item) => allowedSet.has(item));

    if (!filtered.length) {
      throw new ForbiddenException('Sucursal no autorizada para el usuario');
    }

    return filtered;
  }

  private parseSucsQuery(sucs?: string) {
    if (!sucs) return [];
    return this.normalizeList(
      sucs
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length),
    );
  }

  private normalizeLimit(limit?: string | number, fallback = 200) {
    const raw = Number(limit ?? fallback);
    if (!Number.isFinite(raw) || raw <= 0) return fallback;
    return Math.min(Math.floor(raw), 500);
  }

  private async hasIdopvColumn() {
    const rows = await this.dataSource.query(
      `
      SELECT CASE WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL THEN 0 ELSE 1 END AS HAS_IDOPV
      `,
    );
    const row = (rows?.[0] ?? {}) as Record<string, unknown>;
    const value = Number(row.HAS_IDOPV ?? row.has_idopv ?? 0);
    return Number.isFinite(value) && value === 1;
  }

  private async hasDatCtrlSucData() {
    const rows = await this.dataSource.query(
      `
      SELECT TOP 1 1 AS HAS_SUC
      FROM dbo.DAT_CTRL_CTAS
      WHERE NULLIF(LTRIM(RTRIM(SUC)), '') IS NOT NULL
      `,
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private getConsultaSelectSql(
    consultaName:
      | 'sp_ctrlctas_resumen_cliente'
      | 'sp_ctrlctas_resumen_transaccion'
      | 'sp_ctrlctas_detalle_transaccion',
  ) {
    switch (consultaName) {
      case 'sp_ctrlctas_resumen_cliente':
        return `
      SELECT
        ctas.CLIENT,
        cli.RazonSocialReceptor,
        SUM(ISNULL(ctas.IMPT, 0)) AS TOTAL
      FROM dbo.DAT_CTRL_CTAS ctas
      LEFT JOIN dbo.FACT_CLIENT_SHP cli
        ON cli.IDC = ctas.CLIENT
      WHERE
        (
          NOT EXISTS(SELECT 1 FROM @Sucs)
          OR ctas.SUC IN (SELECT Value FROM @Sucs)
          OR NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), ctas.SUC))), '') IS NULL
        )
        AND (NOT EXISTS(SELECT 1 FROM @Ctas) OR ctas.CTA IN (SELECT Value FROM @Ctas))
        AND (NOT EXISTS(SELECT 1 FROM @Clsds) OR ctas.CLSD IN (SELECT Value FROM @Clsds))
        AND (NOT EXISTS(SELECT 1 FROM @IdFols) OR ctas.IDFOL IN (SELECT Value FROM @IdFols))
        AND (NOT EXISTS(SELECT 1 FROM @Clients) OR CAST(ctas.CLIENT AS nvarchar(255)) IN (SELECT Value FROM @Clients))
        AND (@6 IS NULL OR ctas.FCND >= @6)
        AND (@7 IS NULL OR ctas.FCND < DATEADD(day, 1, @7))
        AND (
          COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
          OR NOT EXISTS(SELECT 1 FROM @Opvs)
          OR EXISTS (
            SELECT 1
            FROM OPENJSON((SELECT ctas.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) opv
            WHERE opv.[key] = 'IDOPV'
              AND LTRIM(RTRIM(CONVERT(nvarchar(255), opv.[value]))) IN (SELECT Value FROM @Opvs)
          )
        )
      GROUP BY ctas.CLIENT, cli.RazonSocialReceptor
      ORDER BY TOTAL DESC;
      `;
      case 'sp_ctrlctas_resumen_transaccion':
        return `
      SELECT
        ctas.CLIENT,
        cli.RazonSocialReceptor,
        ctas.CTA,
        ctas.IDFOL,
        SUM(ISNULL(ctas.IMPT, 0)) AS TOTAL
      FROM dbo.DAT_CTRL_CTAS ctas
      LEFT JOIN dbo.FACT_CLIENT_SHP cli
        ON cli.IDC = ctas.CLIENT
      WHERE
        (
          NOT EXISTS(SELECT 1 FROM @Sucs)
          OR ctas.SUC IN (SELECT Value FROM @Sucs)
          OR NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), ctas.SUC))), '') IS NULL
        )
        AND (NOT EXISTS(SELECT 1 FROM @Ctas) OR ctas.CTA IN (SELECT Value FROM @Ctas))
        AND (NOT EXISTS(SELECT 1 FROM @Clsds) OR ctas.CLSD IN (SELECT Value FROM @Clsds))
        AND (NOT EXISTS(SELECT 1 FROM @IdFols) OR ctas.IDFOL IN (SELECT Value FROM @IdFols))
        AND (NOT EXISTS(SELECT 1 FROM @Clients) OR CAST(ctas.CLIENT AS nvarchar(255)) IN (SELECT Value FROM @Clients))
        AND (@6 IS NULL OR ctas.FCND >= @6)
        AND (@7 IS NULL OR ctas.FCND < DATEADD(day, 1, @7))
        AND (
          COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
          OR NOT EXISTS(SELECT 1 FROM @Opvs)
          OR EXISTS (
            SELECT 1
            FROM OPENJSON((SELECT ctas.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) opv
            WHERE opv.[key] = 'IDOPV'
              AND LTRIM(RTRIM(CONVERT(nvarchar(255), opv.[value]))) IN (SELECT Value FROM @Opvs)
          )
        )
      GROUP BY ctas.CLIENT, cli.RazonSocialReceptor, ctas.CTA, ctas.IDFOL
      ORDER BY ctas.CLIENT, ctas.CTA, ctas.IDFOL;
      `;
      case 'sp_ctrlctas_detalle_transaccion':
      default:
        return `
      SELECT
        ctas.NDOC,
        ctas.SUC,
        ctas.FCND,
        ctas.CLIENT,
        cli.RazonSocialReceptor,
        ctas.CTA,
        ctas.CLSD,
        ctas.IDFOL,
        ctas.RTXT,
        ctas.IMPT,
        CASE
          WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL THEN NULL
          ELSE (
            SELECT TOP 1 LTRIM(RTRIM(CONVERT(nvarchar(255), opv.[value])))
            FROM OPENJSON((SELECT ctas.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) opv
            WHERE opv.[key] = 'IDOPV'
          )
        END AS IDOPV
      FROM dbo.DAT_CTRL_CTAS ctas
      LEFT JOIN dbo.FACT_CLIENT_SHP cli
        ON cli.IDC = ctas.CLIENT
      WHERE
        ctas.IDFOL IN (SELECT Value FROM @IdFols)
        AND (
          NOT EXISTS(SELECT 1 FROM @Sucs)
          OR ctas.SUC IN (SELECT Value FROM @Sucs)
          OR NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), ctas.SUC))), '') IS NULL
        )
        AND (NOT EXISTS(SELECT 1 FROM @Ctas) OR ctas.CTA IN (SELECT Value FROM @Ctas))
        AND (NOT EXISTS(SELECT 1 FROM @Clsds) OR ctas.CLSD IN (SELECT Value FROM @Clsds))
        AND (NOT EXISTS(SELECT 1 FROM @Clients) OR CAST(ctas.CLIENT AS nvarchar(255)) IN (SELECT Value FROM @Clients))
        AND (@6 IS NULL OR ctas.FCND >= @6)
        AND (@7 IS NULL OR ctas.FCND < DATEADD(day, 1, @7))
        AND (
          COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
          OR NOT EXISTS(SELECT 1 FROM @Opvs)
          OR EXISTS (
            SELECT 1
            FROM OPENJSON((SELECT ctas.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)) opv
            WHERE opv.[key] = 'IDOPV'
              AND LTRIM(RTRIM(CONVERT(nvarchar(255), opv.[value]))) IN (SELECT Value FROM @Opvs)
          )
        )
      ORDER BY ctas.FCND DESC, ctas.NDOC;
      `;
    }
  }

  private async executeConsulta(
    procedureName:
      | 'sp_ctrlctas_resumen_cliente'
      | 'sp_ctrlctas_resumen_transaccion'
      | 'sp_ctrlctas_detalle_transaccion',
    dto: CtrlCtasConsultaDto,
    user: JwtPayload,
  ) {
    const hasIdopv = await this.hasIdopvColumn();
    const requestedSucs = this.normalizeList(dto.sucs);
    let sucs = await this.resolveSucs(user, requestedSucs);
    if (!this.isAdmin(user) && requestedSucs.length === 0 && sucs.length > 0) {
      const hasSucData = await this.hasDatCtrlSucData();
      // Compatibilidad inicial: si DAT_CTRL_CTAS aun no tiene SUC poblada,
      // no forzar filtro por sucursal para permitir consulta global.
      if (!hasSucData) {
        sucs = [];
      }
    }
    const ctas = this.normalizeList(dto.ctas);
    const clients = this.normalizeList(dto.clients);
    const clsds = this.normalizeList(dto.clsds);
    const idfols = this.normalizeList([...(dto.idfols ?? []), dto.idfol ?? '']);
    const opvs = hasIdopv ? this.normalizeList(dto.opvs) : [];
    const dateRange = this.normalizeDateRange(
      this.parseDate(dto.fecIni),
      this.parseDate(dto.fecFin),
    );

    if (
      procedureName === 'sp_ctrlctas_detalle_transaccion' &&
      idfols.length === 0
    ) {
      throw new BadRequestException(
        'Para detalle se requiere al menos un IDFOL',
      );
    }
    const consultaSql = this.getConsultaSelectSql(procedureName);

    const rows = await this.dataSource.query(
      `
      DECLARE @Sucs dbo.StringList255;
      DECLARE @Ctas dbo.StringList255;
      DECLARE @Clients dbo.StringList255;
      DECLARE @Clsds dbo.StringList255;
      DECLARE @IdFols dbo.StringList255;
      DECLARE @Opvs dbo.StringList255;

      INSERT INTO @Sucs (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@0)
      WHERE LTRIM(RTRIM([value])) <> '';

      INSERT INTO @Ctas (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@1)
      WHERE LTRIM(RTRIM([value])) <> '';

      INSERT INTO @Clients (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@2)
      WHERE LTRIM(RTRIM([value])) <> '';

      INSERT INTO @Clsds (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@3)
      WHERE LTRIM(RTRIM([value])) <> '';

      INSERT INTO @IdFols (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@4)
      WHERE LTRIM(RTRIM([value])) <> '';

      INSERT INTO @Opvs (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@5)
      WHERE LTRIM(RTRIM([value])) <> '';

      ${consultaSql}
      `,
      [
        JSON.stringify(sucs),
        JSON.stringify(ctas),
        JSON.stringify(clients),
        JSON.stringify(clsds),
        JSON.stringify(idfols),
        JSON.stringify(opvs),
        dateRange.fecIni,
        dateRange.fecFin,
      ],
    );

    return rows;
  }

  async getConfig(user: JwtPayload) {
    const hasIdopv = await this.hasIdopvColumn();
    const isAdmin = this.isAdmin(user);
    const allowedSucs = isAdmin ? [] : await this.resolveAuthorizedSucs(user);
    return {
      hasIdopv,
      isAdmin,
      forcedSuc: !isAdmin && allowedSucs.length === 1 ? allowedSucs[0] : null,
      allowedSucs,
      canSelectSucs: isAdmin || allowedSucs.length > 1,
    };
  }

  async resumenCliente(dto: CtrlCtasConsultaDto, user: JwtPayload) {
    return this.executeConsulta('sp_ctrlctas_resumen_cliente', dto, user);
  }

  async resumenTransaccion(dto: CtrlCtasConsultaDto, user: JwtPayload) {
    return this.executeConsulta('sp_ctrlctas_resumen_transaccion', dto, user);
  }

  async detalleTransaccion(dto: CtrlCtasConsultaDto, user: JwtPayload) {
    return this.executeConsulta('sp_ctrlctas_detalle_transaccion', dto, user);
  }

  async catalogCtas(
    user: JwtPayload,
    query?: { search?: string; sucs?: string; limit?: string },
  ) {
    const sucs = await this.resolveSucs(user, this.parseSucsQuery(query?.sucs));
    const search = String(query?.search ?? '').trim();
    const limit = this.normalizeLimit(query?.limit, 200);

    return this.dataSource.query(
      `
      DECLARE @Sucs dbo.StringList255;
      DECLARE @Limit int = @2;

      INSERT INTO @Sucs (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@0)
      WHERE LTRIM(RTRIM([value])) <> '';

      SELECT TOP (@Limit)
        cat.CTA,
        cat.DCTA,
        cat.RELACION,
        cat.SUC
      FROM dbo.DAT_CAT_CTAS cat
      WHERE (
          @1 IS NULL
          OR cat.CTA LIKE '%' + @1 + '%'
          OR cat.DCTA LIKE '%' + @1 + '%'
          OR cat.RELACION LIKE '%' + @1 + '%'
        )
        AND (
          NOT EXISTS(SELECT 1 FROM @Sucs)
          OR cat.SUC IN (SELECT Value FROM @Sucs)
          OR cat.SUC IS NULL
        )
      ORDER BY cat.CTA ASC;
      `,
      [JSON.stringify(sucs), search || null, limit],
    );
  }

  async catalogClientes(
    user: JwtPayload,
    query?: { search?: string; sucs?: string; limit?: string },
  ) {
    const sucs = await this.resolveSucs(user, this.parseSucsQuery(query?.sucs));
    const search = String(query?.search ?? '').trim();
    const limit = this.normalizeLimit(query?.limit, 200);

    return this.dataSource.query(
      `
      DECLARE @Sucs dbo.StringList255;
      DECLARE @Limit int = @2;

      INSERT INTO @Sucs (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@0)
      WHERE LTRIM(RTRIM([value])) <> '';

      SELECT DISTINCT TOP (@Limit)
        cli.IDC,
        CAST(cli.IDC AS nvarchar(255)) AS IDC_TEXT,
        cli.RazonSocialReceptor,
        cli.SUC
      FROM dbo.FACT_CLIENT_SHP cli
      WHERE (
          @1 IS NULL
          OR CAST(cli.IDC AS nvarchar(255)) LIKE '%' + @1 + '%'
          OR cli.RazonSocialReceptor LIKE '%' + @1 + '%'
        )
        AND (
          NOT EXISTS(SELECT 1 FROM @Sucs)
          OR cli.SUC IN (SELECT Value FROM @Sucs)
          OR cli.SUC IS NULL
        )
      ORDER BY cli.RazonSocialReceptor ASC, cli.IDC ASC;
      `,
      [JSON.stringify(sucs), search || null, limit],
    );
  }

  async catalogOpvs(
    user: JwtPayload,
    query?: { search?: string; sucs?: string; limit?: string },
  ) {
    const hasIdopv = await this.hasIdopvColumn();
    if (!hasIdopv) return [];

    const sucs = await this.resolveSucs(user, this.parseSucsQuery(query?.sucs));
    const search = String(query?.search ?? '').trim();
    const limit = this.normalizeLimit(query?.limit, 200);

    return this.dataSource.query(
      `
      DECLARE @Sucs dbo.StringList255;
      DECLARE @Limit int = @2;

      INSERT INTO @Sucs (Value)
      SELECT DISTINCT LTRIM(RTRIM([value]))
      FROM OPENJSON(@0)
      WHERE LTRIM(RTRIM([value])) <> '';

      SELECT TOP (@Limit)
        opv.IDOPV,
        opv.NOMB,
        opv.APELP,
        opv.APELM,
        opv.CONT,
        opv.SUC,
        opv.ESTATUS,
        LTRIM(RTRIM(CONCAT(ISNULL(opv.NOMB, ''), ' ', ISNULL(opv.APELP, ''), ' ', ISNULL(opv.APELM, '')))) AS NOMBRE_COMPLETO
      FROM dbo.PV_OPV opv
      WHERE (
          @1 IS NULL
          OR opv.IDOPV LIKE '%' + @1 + '%'
          OR opv.NOMB LIKE '%' + @1 + '%'
          OR opv.APELP LIKE '%' + @1 + '%'
          OR opv.APELM LIKE '%' + @1 + '%'
          OR opv.CONT LIKE '%' + @1 + '%'
        )
        AND (
          NOT EXISTS(SELECT 1 FROM @Sucs)
          OR opv.SUC IN (SELECT Value FROM @Sucs)
        )
      ORDER BY opv.IDOPV ASC;
      `,
      [JSON.stringify(sucs), search || null, limit],
    );
  }
}
