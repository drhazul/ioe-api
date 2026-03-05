import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource, QueryFailedError, QueryRunner } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ListFormaPagoCambioTodayQueryDto } from './dto/list-forma-pago-cambio-today-query.dto';
import { UpdateFormaPagoCambioDto } from './dto/update-forma-pago-cambio.dto';

type EligibleAut = 'AD' | 'AP' | 'CR' | 'VF';

type SupervisorAuthorizer = {
  idUsuario: number;
  username: string;
  roleCode: string;
};

type CambioDetalleRow = {
  FCN: Date | string | null;
  IDFOL: string | null;
  AUT_ASVR: string | null;
  AUT_FORM: string | null;
  TRA: string | null;
  OPVM: string | null;
  IDF: string | null;
  FORM: string | null;
  IMPD: number | null;
  SUC: string | null;
  CLIEN: string | null;
};

@Injectable()
export class FormasPagoCambiosService {
  private static readonly AUT_ALLOWED: EligibleAut[] = ['AD', 'AP', 'CR', 'VF'];

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async listCatalog() {
    try {
      const rows = await this.dataSource.query(`
        SELECT
          UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) AS FORM,
          UPPER(LTRIM(RTRIM(ISNULL(TIPOTRAN, '')))) AS TIPOTRAN,
          MIN(ISNULL(BLOQ, 0)) AS BLOQ
        FROM dbo.VW_PV_FORM_TIPOTRAN_DISTINCT
        WHERE NULLIF(LTRIM(RTRIM(ISNULL(FORM, ''))), '') IS NOT NULL
        GROUP BY
          UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))),
          UPPER(LTRIM(RTRIM(ISNULL(TIPOTRAN, ''))))
        ORDER BY
          UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) ASC,
          UPPER(LTRIM(RTRIM(ISNULL(TIPOTRAN, '')))) ASC
      `);

      return (rows ?? []).map((row: Record<string, unknown>) => ({
        FORM: this.normalizeUpper(row.FORM),
        TIPOTRAN: this.normalizeUpper(row.TIPOTRAN),
        BLOQ: this.toInt(row.BLOQ) ?? 0,
      }));
    } catch (error) {
      throw this.mapError(
        error,
        'No se pudo consultar catálogo de formas de pago',
      );
    }
  }

  async listToday(user: JwtPayload, query?: ListFormaPagoCambioTodayQueryDto) {
    try {
      const opv = this.resolveOpv(user);
      const formTable = await this.resolveFormTable();
      const hasFormAut = await this.hasColumn(this.dataSource, formTable, 'AUT');
      const hasSuc = await this.hasColumn(
        this.dataSource,
        'dbo.PV_CTR_FOL_ASVR',
        'SUC',
      );
      const hasClien = await this.hasColumn(
        this.dataSource,
        'dbo.PV_CTR_FOL_ASVR',
        'CLIEN',
      );
      const formAutSelect = hasFormAut
        ? 'CAST(F.AUT AS nvarchar(255))'
        : 'CAST(NULL AS nvarchar(255))';
      const sucSelect = hasSuc
        ? 'CAST(A.SUC AS nvarchar(50))'
        : 'CAST(NULL AS nvarchar(50))';
      const clienSelect = hasClien
        ? "CASE WHEN TRY_CONVERT(decimal(19,0), A.CLIEN) IS NOT NULL THEN CONVERT(nvarchar(255), CONVERT(decimal(19,0), A.CLIEN)) ELSE LTRIM(RTRIM(CONVERT(nvarchar(255), A.CLIEN))) END"
        : 'CAST(NULL AS nvarchar(255))';
      const clienExpr = hasClien
        ? "CASE WHEN TRY_CONVERT(decimal(19,0), A.CLIEN) IS NOT NULL THEN CONVERT(nvarchar(255), CONVERT(decimal(19,0), A.CLIEN)) ELSE LTRIM(RTRIM(CONVERT(nvarchar(255), A.CLIEN))) END"
        : "CAST('' AS nvarchar(255))";

      const idfolSearch = this.normalize(query?.idfol);
      const clienSearch = this.normalize(query?.clien);
      const params: unknown[] = [opv];
      const where: string[] = [
        'CONVERT(date, A.FCN) = CONVERT(date, GETDATE())',
        "UPPER(LTRIM(RTRIM(ISNULL(A.OPVM, '')))) = @0",
        "A.AUT IN ('AD', 'AP', 'CR', 'VF')",
      ];

      if (idfolSearch) {
        params.push(`%${idfolSearch}%`);
        where.push(`CAST(A.IDFOL AS nvarchar(255)) LIKE @${params.length - 1}`);
      }
      if (clienSearch) {
        params.push(`%${clienSearch}%`);
        where.push(`${clienExpr} LIKE @${params.length - 1}`);
      }

      const rows = await this.dataSource.query(
        `
        SELECT
          CONVERT(date, A.FCN) AS FCN,
          CAST(A.AUT AS nvarchar(10)) AS AUT_ASVR,
          CAST(A.AUT AS nvarchar(10)) AS AUT,
          CAST(A.IDFOL AS nvarchar(255)) AS IDFOL,
          CAST(A.TRA AS nvarchar(255)) AS TRA,
          CAST(A.OPVM AS nvarchar(255)) AS OPVM,
          ${sucSelect} AS SUC,
          ${clienSelect} AS CLIEN,
          CAST(F.IDF AS nvarchar(255)) AS IDF,
          CAST(F.FORM AS nvarchar(255)) AS FORM,
          CAST(ISNULL(F.IMPD, 0) AS decimal(18,2)) AS IMPD,
          ${formAutSelect} AS AUT_FORM
        FROM dbo.PV_CTR_FOL_ASVR A WITH (NOLOCK)
        LEFT JOIN ${formTable} F WITH (NOLOCK)
          ON F.IDFOL = A.IDFOL
        WHERE ${where.join('\n          AND ')}
        ORDER BY A.FCN DESC, A.IDFOL DESC, F.IDF DESC
        `,
        params,
      );

      return (rows ?? []).map((raw: Record<string, unknown>) =>
        this.mapCambioDetalleRow(raw),
      );
    } catch (error) {
      throw this.mapError(
        error,
        'No se pudo consultar transacciones para cambio de forma de pago',
      );
    }
  }

  async updateForma(
    idfRaw: string,
    dto: UpdateFormaPagoCambioDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    const idf = this.normalize(idfRaw);
    if (!idf) {
      throw new BadRequestException('idf es requerido');
    }

    const newForm = this.normalizeUpper(dto.newForm ?? dto.FORM ?? '');
    if (!newForm) {
      throw new BadRequestException('Debe enviar newForm/FORM');
    }

    const requestedAut = this.normalize(dto.aut ?? dto.AUT ?? '');
    const clearAutRequested = dto.clearAut === true;

    const authPassword = this.normalize(dto.AUTH_PASSWORD ?? '');
    if (!authPassword) {
      throw new ForbiddenException(
        'Se requiere contraseña de usuario SUPERPV',
      );
    }

    const supervisor = await this.findSuperPvAuthorizerByPassword(authPassword);
    if (!supervisor) {
      throw new ForbiddenException('Autorización SUPERPV inválida');
    }

    let qr: QueryRunner | null = null;
    try {
      qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();

      const formTable = await this.resolveFormTable(qr);
      const hasFormAut = await this.hasColumn(qr, formTable, 'AUT');
      if (!hasFormAut) {
        throw new BadRequestException(
          `La tabla ${formTable} no tiene columna AUT para registrar referencia`,
        );
      }
      await this.ensureFormAllowed(qr, newForm);

      const targetRows = await qr.query(
        `
        SELECT TOP 1
          CONVERT(date, A.FCN) AS FCN,
          CAST(A.AUT AS nvarchar(10)) AS AUT_ASVR,
          CAST(A.IDFOL AS nvarchar(255)) AS IDFOL,
          CAST(A.TRA AS nvarchar(255)) AS TRA,
          CAST(A.OPVM AS nvarchar(255)) AS OPVM,
          CAST(F.IDF AS nvarchar(255)) AS IDF,
          CAST(F.FORM AS nvarchar(255)) AS FORM,
          CAST(ISNULL(F.IMPD, 0) AS decimal(18,2)) AS IMPD,
          CAST(F.AUT AS nvarchar(255)) AS AUT_FORM
        FROM dbo.PV_CTR_FOL_ASVR A WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN ${formTable} F WITH (UPDLOCK, HOLDLOCK)
          ON F.IDFOL = A.IDFOL
        WHERE CAST(F.IDF AS nvarchar(255)) = @0
        `,
        [idf],
      );

      const targetRaw = (targetRows?.[0] ?? null) as Record<
        string,
        unknown
      > | null;
      if (!targetRaw) {
        throw new NotFoundException(`No existe detalle de forma IDF ${idf}`);
      }

      const target = this.mapCambioDetalleRow(targetRaw);
      const opv = this.resolveOpv(user);

      if (!this.isToday(target.FCN)) {
        throw new ForbiddenException(
          'Solo se permite cambio de forma para transacciones del día',
        );
      }
      if (
        !FormasPagoCambiosService.AUT_ALLOWED.includes(
          target.AUT_ASVR as EligibleAut,
        )
      ) {
        throw new ForbiddenException(
          'La transacción no tiene AUT permitido para cambio de forma',
        );
      }
      if (this.normalizeUpper(target.OPVM) !== opv) {
        throw new ForbiddenException(
          'La transacción no pertenece al OPV autenticado',
        );
      }

      const beforeForm = this.normalizeUpper(target.FORM);
      const beforeAut = this.normalize(target.AUT_FORM);
      if (beforeForm === newForm) {
        throw new BadRequestException(
          'La forma nueva coincide con la forma actual',
        );
      }

      const fromEfectivoToOther =
        beforeForm === 'EFECTIVO' && newForm !== 'EFECTIVO';
      const fromOtherToEfectivo =
        beforeForm !== 'EFECTIVO' && newForm === 'EFECTIVO';

      if (fromEfectivoToOther && !requestedAut) {
        throw new BadRequestException(
          'Debe generar/asignar referencia para cambio de EFECTIVO a forma no efectivo',
        );
      }

      let nextAut: string | null = null;
      if (fromOtherToEfectivo || clearAutRequested || newForm === 'EFECTIVO') {
        nextAut = null;
      } else if (requestedAut) {
        nextAut = requestedAut;
      } else if (beforeAut) {
        nextAut = beforeAut;
      }

      await qr.query(
        `
        UPDATE ${formTable}
          SET FORM = @1,
              AUT = @2
        WHERE CAST(IDF AS nvarchar(255)) = @0
        `,
        [idf, newForm, nextAut],
      );

      const afterRows = await qr.query(
        `
        SELECT TOP 1
          CAST(IDF AS nvarchar(255)) AS IDF,
          CAST(IDFOL AS nvarchar(255)) AS IDFOL,
          CAST(FORM AS nvarchar(255)) AS FORM,
          CAST(AUT AS nvarchar(255)) AS AUT
        FROM ${formTable}
        WHERE CAST(IDF AS nvarchar(255)) = @0
        `,
        [idf],
      );
      const afterRaw = (afterRows?.[0] ?? null) as Record<
        string,
        unknown
      > | null;
      if (!afterRaw) {
        throw new NotFoundException(`No existe detalle actualizado IDF ${idf}`);
      }

      await qr.commitTransaction();

      await this.audit.log({
        IDUSUARIO: supervisor.idUsuario || null,
        ACTION: 'PUT',
        MODULO: 'cambio_forma_pago',
        ENTIDAD: formTable.includes('SVR')
          ? 'PV_CTR_FOL_FORM_SVR'
          : 'PV_CTR_FOL_FORM',
        ENTIDAD_ID: idf,
        SUC: user?.suc ?? null,
        METADATA_JSON: JSON.stringify({
          idf,
          idfol: this.normalize(target.IDFOL),
          before: { FORM: beforeForm, AUT: beforeAut || null },
          after: {
            FORM: this.normalizeUpper(afterRaw.FORM),
            AUT: this.normalize(afterRaw.AUT) || null,
          },
          supervisorId: supervisor.idUsuario,
          supervisorUsername: supervisor.username,
          requestedBy: {
            idUsuario: Number(user?.sub ?? 0) || null,
            username: user?.username ?? null,
          },
        }),
        IP: ip,
      });

      return {
        IDF: this.normalize(afterRaw.IDF),
        IDFOL: this.normalize(afterRaw.IDFOL),
        BEFORE_FORM: beforeForm,
        AFTER_FORM: this.normalizeUpper(afterRaw.FORM),
        BEFORE_AUT: beforeAut,
        AFTER_AUT: this.normalize(afterRaw.AUT),
      };
    } catch (error) {
      if (qr?.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      throw this.mapError(error, 'No se pudo actualizar forma de pago');
    } finally {
      if (qr) {
        await qr.release();
      }
    }
  }

  private async ensureFormAllowed(qr: QueryRunner, form: string) {
    const rows = await qr.query(
      `
      SELECT TOP 1
        UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) AS FORM,
        ISNULL(BLOQ, 0) AS BLOQ
      FROM dbo.VW_PV_FORM_TIPOTRAN_DISTINCT
      WHERE UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) = @0
      ORDER BY ISNULL(BLOQ, 0) ASC
      `,
      [form],
    );
    const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
    if (!row) {
      throw new BadRequestException(
        `La forma ${form} no existe en catálogo permitido`,
      );
    }
    const bloq = this.toInt(row.BLOQ) ?? 1;
    if (bloq !== 0) {
      throw new BadRequestException(`La forma ${form} está bloqueada`);
    }
  }

  private async resolveFormTable(qr?: QueryRunner) {
    const runner = qr ?? this.dataSource;
    const hasSvrRows = await runner.query(
      "SELECT CASE WHEN OBJECT_ID('dbo.PV_CTR_FOL_FORM_SVR','U') IS NULL THEN 0 ELSE 1 END AS HAS_TABLE",
    );
    const hasSvr = this.toInt((hasSvrRows?.[0] ?? {}).HAS_TABLE) === 1;
    if (hasSvr) return 'dbo.PV_CTR_FOL_FORM_SVR';

    const hasLegacyRows = await runner.query(
      "SELECT CASE WHEN OBJECT_ID('dbo.PV_CTR_FOL_FORM','U') IS NULL THEN 0 ELSE 1 END AS HAS_TABLE",
    );
    const hasLegacy = this.toInt((hasLegacyRows?.[0] ?? {}).HAS_TABLE) === 1;
    if (hasLegacy) return 'dbo.PV_CTR_FOL_FORM';

    throw new NotFoundException(
      'No existe tabla de formas de pago (PV_CTR_FOL_FORM_SVR/PV_CTR_FOL_FORM)',
    );
  }

  private async hasColumn(
    runner: QueryRunner | DataSource,
    tableName: string,
    columnName: string,
  ) {
    const rows = await runner.query(
      "SELECT CASE WHEN COL_LENGTH(@0, @1) IS NULL THEN 0 ELSE 1 END AS HAS_COL",
      [tableName, columnName],
    );
    return this.toInt((rows?.[0] ?? {}).HAS_COL) === 1;
  }

  private async findSuperPvAuthorizerByPassword(
    password: string,
  ): Promise<SupervisorAuthorizer | null> {
    const rows = await this.dataSource.query(
      `
      SELECT
        u.IDUSUARIO,
        u.USERNAME,
        u.PASSWORD_HASH,
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
      const hash = this.normalize(row.PASSWORD_HASH);
      if (!hash) continue;
      const valid = await bcrypt.compare(password, hash);
      if (!valid) continue;
      return {
        idUsuario: this.toInt(row.IDUSUARIO) ?? 0,
        username: this.normalize(row.USERNAME),
        roleCode: this.normalizeUpper(row.ROLE_CODE),
      };
    }

    return null;
  }

  private mapCambioDetalleRow(row: Record<string, unknown>): CambioDetalleRow {
    const autAsvr = this.normalizeUpper(row.AUT_ASVR ?? row.AUT);
    return {
      FCN: (row.FCN ?? null) as Date | string | null,
      IDFOL: this.normalize(row.IDFOL) || null,
      AUT_ASVR: autAsvr || null,
      AUT_FORM: this.normalize(row.AUT_FORM) || null,
      TRA: this.normalize(row.TRA) || null,
      OPVM: this.normalizeUpper(row.OPVM) || null,
      IDF: this.normalize(row.IDF) || null,
      FORM: this.normalizeUpper(row.FORM) || null,
      IMPD: this.toNumber(row.IMPD) ?? 0,
      SUC: this.normalize(row.SUC) || null,
      CLIEN: this.normalize(row.CLIEN) || null,
    };
  }

  private resolveOpv(user: JwtPayload) {
    const opv = this.normalizeUpper(user?.username ?? '');
    if (!opv) {
      throw new BadRequestException(
        'No se pudo resolver OPV del usuario autenticado',
      );
    }
    return opv;
  }

  private isToday(value: unknown) {
    if (!value) return false;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  private normalize(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown) {
    return this.normalize(value).toUpperCase();
  }

  private toInt(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Math.trunc(value) : null;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNumber(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private mapError(error: unknown, fallback: string) {
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException ||
      error instanceof ForbiddenException
    ) {
      return error;
    }
    if (error instanceof QueryFailedError) {
      const message = this.normalize((error as Error).message);
      if (message) return new BadRequestException(message);
    }
    return new BadRequestException(fallback);
  }
}
