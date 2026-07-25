import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class FaltantesSobrantesService {
  private pool?: sql.ConnectionPool;

  constructor(
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async catalogos(user: JwtPayload) {
    const pool = await this.getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT
        TRY_CONVERT(INT, q.SUC) AS suc,
        LTRIM(RTRIM(ISNULL(s.[DESC], ''))) AS nombre
      FROM dbo.FYSQNAVIGSVR q
      LEFT JOIN dbo.DAT_SUC s
        ON TRY_CONVERT(INT, s.SUC) = TRY_CONVERT(INT, q.SUC)
      WHERE TRY_CONVERT(INT, q.SUC) IS NOT NULL
      ORDER BY TRY_CONVERT(INT, q.SUC);

      SELECT DISTINCT
        TRY_CONVERT(INT, SUC) AS suc,
        LTRIM(RTRIM(CONVERT(VARCHAR(40), QNA))) AS qna,
        UPPER(LTRIM(RTRIM(ISNULL(VIGENTE, '')))) AS vigente
      FROM dbo.FYSQNAVIGSVR
      WHERE TRY_CONVERT(INT, SUC) IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(CONVERT(VARCHAR(40), QNA))), '') IS NOT NULL
      ORDER BY TRY_CONVERT(INT, SUC), LTRIM(RTRIM(CONVERT(VARCHAR(40), QNA))) DESC;
    `);
    const sucursales = result.recordsets[0] ?? [];
    const periodos = result.recordsets[1] ?? [];
    const allowed = await this.allowedSucs(user);
    return {
      sucursales: sucursales.filter(
        (row) => allowed === null || allowed.has(Number(row.suc)),
      ),
      periodos: periodos.filter(
        (row) => allowed === null || allowed.has(Number(row.suc)),
      ),
    };
  }

  async reporteAjustes(sucRaw: string, qnaRaw: string, user: JwtPayload) {
    const suc = Number(sucRaw);
    const qna = String(qnaRaw ?? '').trim();
    if (!Number.isInteger(suc) || suc <= 0 || !/^\d{4,12}$/.test(qna)) {
      throw new BadRequestException('suc y qna validas son requeridas.');
    }
    const allowed = await this.allowedSucs(user);
    if (allowed !== null && !allowed.has(suc)) {
      throw new ForbiddenException(`No autorizado para sucursal ${suc}.`);
    }
    const pool = await this.getPool();
    const result = await pool
      .request()
      .input('SUC', sql.Int, suc)
      .input('QNA', sql.VarChar(20), qna)
      .execute('dbo.FYS_REPORTE_AJUSTES_WEB');
    const row = result.recordset?.[0] ?? null;
    await this.audit.log({
      IDUSUARIO: Number(user.sub ?? 0) || null,
      ACTION: 'CONSULTAR_REPORTE_AJUSTES',
      MODULO: 'FALTANTES_Y_SOBRANTES',
      ENTIDAD: 'FYS_REPORTE_CIERRE_QNA_RESUMEN',
      ENTIDAD_ID: `${suc}-${qna}`,
      SUC: String(suc),
      METADATA_JSON: JSON.stringify({ suc, qna, encontrado: Boolean(row) }),
    });
    return row;
  }

  private async allowedSucs(user: JwtPayload): Promise<Set<number> | null> {
    const raw = user as unknown as Record<string, unknown>;
    const roleId = Number(raw.roleId ?? raw.IDROL ?? 0);
    const username = String(raw.username ?? '')
      .trim()
      .toUpperCase();
    if (roleId === 0 || roleId === 1 || username === 'ADMIN') return null;
    const digits = String(raw.suc ?? '').replace(/\D/g, '');
    const allowed = new Set<number>();
    if (digits) allowed.add(Number(digits));
    const rows = await this.dataSource.query(
      `SELECT DISTINCT SUC FROM dbo.USR_MOD_SUC
       WHERE UPPER(LTRIM(RTRIM(ISNULL(USUARIO, '')))) = @0
         AND UPPER(LTRIM(RTRIM(ISNULL(MODULO, '')))) IN ('FAL_Y_SOB', 'FALTANTES_Y_SOBRANTES')
         AND ISNULL(ACTIVO, 1) = 1`,
      [username],
    );
    for (const row of rows ?? []) {
      const value = Number(String(row.SUC ?? '').replace(/\D/g, ''));
      if (Number.isInteger(value) && value > 0) allowed.add(value);
    }
    return allowed;
  }

  private async getPool() {
    if (this.pool?.connected) return this.pool;
    const host = this.config.get<string>('FYS_DB_HOST');
    const user = this.config.get<string>('FYS_DB_USER');
    const password = this.config.get<string>('FYS_DB_PASS');
    const database = this.config.get<string>('FYS_DB_NAME');
    if (!host || !user || !password || !database) {
      throw new ServiceUnavailableException(
        'Conexion FYS no configurada (FYS_DB_HOST/USER/PASS/NAME).',
      );
    }
    this.pool = await new sql.ConnectionPool({
      server: host,
      port: Number(this.config.get('FYS_DB_PORT') ?? 1433),
      user,
      password,
      database,
      options: {
        encrypt: this.config.get('FYS_DB_ENCRYPT') === 'true',
        trustServerCertificate:
          this.config.get('FYS_DB_TRUST_CERT') !== 'false',
      },
    }).connect();
    return this.pool;
  }
}
