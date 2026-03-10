import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CajaGeneralFormaDetalleQueryDto } from './dto/caja-general-forma-detalle-query.dto';
import { CajaGeneralGlobalQueryDto } from './dto/caja-general-global-query.dto';
import { CajaGeneralOpvQueryDto } from './dto/caja-general-opv-query.dto';
import { CerrarEntregaOpvDto } from './dto/cerrar-entrega-opv.dto';
import { ReactivarEntregaOpvDto } from './dto/reactivar-entrega-opv.dto';

type SupervisorAuthorizer = {
  idUsuario: number;
  username: string;
  roleCode: string;
};

@Injectable()
export class CajaGeneralService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async getResumenOpv(query: CajaGeneralOpvQueryDto, user: JwtPayload) {
    try {
      const suc = this.normalizeUpper(query.suc);
      const opv = this.normalizeUpper(query.opv);
      const fcn = this.normalizeDate(query.fcn);
      const tipo = this.operationTipo();

      this.assertSucursalAccess(suc, user);

      await this.dataSource.query(
        'EXEC dbo.sp_cg_sync_entrega_opv_abierta @SUC=@0, @FCN=@1, @OPV=@2, @TIPO_CORTE=@3',
        [suc, fcn, opv, tipo],
      );

      const [
        validationRows,
        headerRows,
        formasRows,
        transRows,
        ventasRows,
        efectivoRows,
      ] = await Promise.all([
        this.dataSource.query(
          'EXEC dbo.sp_cg_validar_opv_para_entrega @SUC=@0, @FCN=@1, @OPV=@2',
          [suc, fcn, opv],
        ),
        this.dataSource.query(
          'EXEC dbo.sp_cg_resumen_opv @SUC=@0, @FCN=@1, @OPV=@2, @TIPO_CORTE=@3',
          [suc, fcn, opv, tipo],
        ),
        this.dataSource.query(
          'EXEC dbo.sp_cg_resumen_formas_pago_opv @SUC=@0, @FCN=@1, @OPV=@2, @TIPO_CORTE=@3',
          [suc, fcn, opv, tipo],
        ),
        this.dataSource.query(
          'EXEC dbo.sp_cg_resumen_transacciones_opv @SUC=@0, @FCN=@1, @OPV=@2, @TIPO_CORTE=@3',
          [suc, fcn, opv, tipo],
        ),
        this.dataSource.query(
          'EXEC dbo.sp_cg_resumen_ventas_departamento_opv @SUC=@0, @FCN=@1, @OPV=@2, @TIPO_CORTE=@3',
          [suc, fcn, opv, tipo],
        ),
        this.dataSource.query(
          'EXEC dbo.sp_cg_resumen_efectivo_opv @SUC=@0, @FCN=@1, @OPV=@2',
          [suc, fcn, opv],
        ),
      ]);

      return {
        ok: true,
        suc,
        fcn,
        opv,
        tipo,
        validation: this.firstRow(validationRows),
        header: this.firstRow(headerRows),
        formasPago: formasRows ?? [],
        transacciones: transRows ?? [],
        ventas: ventasRows ?? [],
        efectivo: efectivoRows ?? [],
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar resumen de entrega OPV');
    }
  }

  async getDetalleFormaOpv(
    query: CajaGeneralFormaDetalleQueryDto,
    user: JwtPayload,
  ) {
    try {
      const suc = this.normalizeUpper(query.suc);
      const opv = this.normalizeUpper(query.opv);
      const fcn = this.normalizeDate(query.fcn);
      const tipo = this.normalizeTipo(query.tipo);
      const form = this.normalizeUpper(query.form);

      if (!form) {
        throw new BadRequestException('form es obligatorio');
      }

      this.assertSucursalAccess(suc, user);

      const rows = await this.dataSource.query(
        `
        DECLARE @sucNorm VARCHAR(25) = UPPER(LTRIM(RTRIM(ISNULL(@0, ''))));
        DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@1, ''))));
        DECLARE @fcnDate DATE = CONVERT(DATE, @2);
        DECLARE @tipoNorm VARCHAR(10) = UPPER(LTRIM(RTRIM(ISNULL(@3, 'GLOBAL'))));
        DECLARE @formNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@4, ''))));
        DECLARE @dtIni DATETIME = CAST(@fcnDate AS DATETIME);
        DECLARE @dtFin DATETIME = DATEADD(DAY, 1, @dtIni);

        IF @tipoNorm NOT IN ('CA', 'VF', 'GLOBAL')
          SET @tipoNorm = 'GLOBAL';

        ;WITH Folios AS (
          SELECT
            a.IDFOL,
            UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) AS AUT,
            UPPER(LTRIM(RTRIM(ISNULL(a.ESTA, '')))) AS ESTA,
            UPPER(LTRIM(RTRIM(ISNULL(
              CASE
                WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
                ELSE a.OPV
              END,
            '')))) AS OPV_ACT
          FROM dbo.PV_CTR_FOL_ASVR a
          WHERE UPPER(LTRIM(RTRIM(ISNULL(a.SUC, '')))) = @sucNorm
            AND a.FCNM >= @dtIni
            AND a.FCNM < @dtFin
            AND UPPER(LTRIM(RTRIM(ISNULL(
              CASE
                WHEN NULLIF(LTRIM(RTRIM(ISNULL(a.OPVM, ''))), '') IS NOT NULL THEN a.OPVM
                ELSE a.OPV
              END,
            '')))) = @opvNorm
            AND (
              (@tipoNorm = 'GLOBAL' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) NOT IN ('CP', 'CPF', 'VA'))
              OR (@tipoNorm = 'CA' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'CA')
              OR (@tipoNorm = 'VF' AND UPPER(LTRIM(RTRIM(ISNULL(a.AUT, '')))) = 'VF')
            )
        )
        SELECT
          fo.OPV_ACT AS OPV,
          dbo.fn_cg_normalize_forma(f.FORM) AS FORM,
          f.IDFOL AS IDFOL,
          SUM(ISNULL(f.IMPD, 0)) AS IMPT,
          MAX(fo.AUT) AS AUT,
          MAX(fo.ESTA) AS ESTA
        FROM dbo.PV_CTR_FOL_FORM f
        INNER JOIN Folios fo ON fo.IDFOL = f.IDFOL
        WHERE dbo.fn_cg_normalize_forma(f.FORM) = @formNorm
        GROUP BY fo.OPV_ACT, dbo.fn_cg_normalize_forma(f.FORM), f.IDFOL
        ORDER BY f.IDFOL
        `,
        [suc, opv, fcn, tipo, form],
      );

      return {
        ok: true,
        suc,
        opv,
        fcn,
        tipo,
        form,
        total: (rows ?? []).reduce((sum: number, item: any) => {
          const value = this.toNumber(item?.IMPT) ?? 0;
          return sum + value;
        }, 0),
        items: rows ?? [],
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar detalle por forma');
    }
  }

  async cerrarEntregaOpv(
    dto: CerrarEntregaOpvDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const suc = this.normalizeUpper(dto.suc);
      const opv = this.normalizeUpper(dto.opv);
      const fcn = this.normalizeDate(dto.fcn);
      const tipo = this.operationTipo();
      const ter = this.normalize(dto.ter ?? '') || null;
      const actor = this.resolveActor(dto.user, user);

      this.assertSucursalAccess(suc, user);

      const entregas =
        dto.entregas?.map((item) => ({
          form: this.normalizeUpper(item.form),
          impe: this.toNumber(item.impe) ?? 0,
        })) ?? [];
      const entregasJson = entregas.length ? JSON.stringify(entregas) : null;

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_cg_cerrar_entrega_opv @SUC=@0, @FCN=@1, @OPV=@2, @TER=@3, @USER=@4, @TIPO_CORTE=@5, @ENTREGAS_JSON=@6',
        [suc, fcn, opv, ter, actor, tipo, entregasJson],
      );
      const result = this.firstRow(rows);

      await this.auditMutation({
        action: 'CG_CERRAR_ENTREGA_OPV',
        entity: 'DAT_FORM_FIN',
        entityId: this.normalize(result?.IDE ?? ''),
        suc,
        metadata: {
          suc,
          fcn,
          opv,
          tipo,
          ter,
          entregas,
          result,
        },
        user,
        ip,
      });

      return {
        ok: true,
        result,
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo cerrar la entrega OPV');
    }
  }

  async reactivarEntregaOpv(
    dto: ReactivarEntregaOpvDto,
    user: JwtPayload,
    ip: string | null,
  ) {
    try {
      const suc = this.normalizeUpper(dto.suc);
      const opv = this.normalizeUpper(dto.opv);
      const fcn = this.normalizeDate(dto.fcn);
      const ter = this.normalize(dto.ter ?? '') || null;
      const actor = this.resolveActor(dto.user, user);
      const authPassword = this.normalize(dto.authPassword ?? '');
      const isHistoricalDate = !this.isOperableDate(fcn);

      this.assertSucursalAccess(suc, user);

      let supervisor: SupervisorAuthorizer | null = null;
      if (isHistoricalDate) {
        if (!authPassword) {
          throw new ForbiddenException(
            'Se requiere autorizacion de supervisor para reactivar entregas de otra fecha',
          );
        }
        supervisor = await this.findSupervisorAuthorizerByPassword(
          authPassword,
          suc,
        );
        if (!supervisor) {
          throw new ForbiddenException(
            'Autorización de supervisor inválida para reactivar entrega histórica',
          );
        }
      }

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_cg_reactivar_entrega_opv @SUC=@0, @FCN=@1, @OPV=@2, @TER=@3, @USER=@4, @ALLOW_HISTORIC_REACTIVATION=@5',
        [suc, fcn, opv, ter, actor, isHistoricalDate ? 1 : 0],
      );
      const result = this.firstRow(rows);
      const syncRows = await this.dataSource.query(
        'EXEC dbo.sp_cg_sync_entrega_opv_abierta @SUC=@0, @FCN=@1, @OPV=@2, @TIPO_CORTE=@3',
        [suc, fcn, opv, this.operationTipo()],
      );
      const syncResult = this.firstRow(syncRows);
      const effectiveResult = syncResult ?? result;
      const movimientoId =
        this.normalize(result?.MOV_NDOC ?? '') ||
        this.normalize(effectiveResult?.IDE ?? '');

      if (supervisor) {
        await this.auditMutation({
          action: 'CG_REACTIVAR_ENTREGA_OPV_AUTH',
          entity: 'DAT_CTRL_CTAS',
          entityId: movimientoId,
          suc,
          metadata: {
            suc,
            fcn,
            opv,
            ide: this.normalize(effectiveResult?.IDE ?? ''),
            movNdoc: this.normalize(result?.MOV_NDOC ?? ''),
            requestedBy: {
              idUsuario: Number(user?.sub ?? 0) || null,
              username: this.normalize(user?.username ?? ''),
            },
            supervisor: {
              idUsuario: supervisor.idUsuario,
              username: supervisor.username,
              roleCode: supervisor.roleCode,
            },
            authorizationMode: 'SUPERVISOR_PASSWORD',
            operation: 'reactivar_entrega_opv',
          },
          user,
          ip,
          auditUserId: supervisor.idUsuario,
        });
      }

      await this.auditMutation({
        action: 'CG_REACTIVAR_ENTREGA_OPV',
        entity: 'DAT_FORM_FIN',
        entityId: this.normalize(effectiveResult?.IDE ?? ''),
        suc,
        metadata: {
          suc,
          fcn,
          opv,
          ter,
          movNdoc: this.normalize(result?.MOV_NDOC ?? ''),
          historicalDateAuthorization: isHistoricalDate,
          authorizedBySupervisorId: supervisor?.idUsuario ?? null,
          result: effectiveResult,
        },
        user,
        ip,
      });

      return {
        ok: true,
        result: effectiveResult,
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo reactivar la entrega OPV');
    }
  }

  async getResumenGlobal(query: CajaGeneralGlobalQueryDto, user: JwtPayload) {
    try {
      const suc = this.normalizeUpper(query.suc);
      const fcn = this.normalizeDate(query.fcn);
      const tipo = this.operationTipo();

      this.assertSucursalAccess(suc, user);

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_cg_resumen_global_dia @SUC=@0, @FCN=@1, @TIPO_CORTE=@2',
        [suc, fcn, tipo],
      );
      const row = this.firstRow(rows);

      return {
        ok: true,
        suc,
        fcn,
        tipo,
        forms: this.parseJsonArray(row?.FORMAS_JSON),
        transacciones: this.parseJsonArray(row?.TRANSACCIONES_JSON),
        ventas: this.parseJsonArray(row?.VENTAS_JSON),
        efectivo: this.parseJsonArray(row?.EFECTIVO_JSON),
        pendientes: this.parseJsonArray(row?.OPV_PENDIENTES_JSON),
        hasPendingOpv: this.toBool(row?.HAS_PENDING_OPV),
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar resumen global de caja');
    }
  }

  async getReporteOpv(query: CajaGeneralOpvQueryDto, user: JwtPayload) {
    try {
      const suc = this.normalizeUpper(query.suc);
      const opv = this.normalizeUpper(query.opv);
      const fcn = this.normalizeDate(query.fcn);
      const tipo = this.normalizeTipo(query.tipo);

      this.assertSucursalAccess(suc, user);

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_cg_reporte_entrega_opv @SUC=@0, @FCN=@1, @OPV=@2, @TIPO_CORTE=@3',
        [suc, fcn, opv, tipo],
      );
      const row = this.firstRow(rows);

      return {
        ok: true,
        suc,
        fcn,
        opv,
        tipo,
        header: this.parseJsonObject(row?.HEADER_JSON),
        forms: this.parseJsonArray(row?.FORMAS_JSON),
        transacciones: this.parseJsonArray(row?.TRANSACCIONES_JSON),
        ventas: this.parseJsonArray(row?.VENTAS_JSON),
        efectivo: this.parseJsonArray(row?.EFECTIVO_JSON),
        generatedAt: row?.GENERATED_AT ?? null,
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo generar reporte OPV');
    }
  }

  async getReporteGlobal(query: CajaGeneralGlobalQueryDto, user: JwtPayload) {
    try {
      const suc = this.normalizeUpper(query.suc);
      const fcn = this.normalizeDate(query.fcn);
      const tipo = this.normalizeTipo(query.tipo);

      this.assertSucursalAccess(suc, user);

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_cg_reporte_entrega_global @SUC=@0, @FCN=@1, @TIPO_CORTE=@2',
        [suc, fcn, tipo],
      );
      const row = this.firstRow(rows);

      return {
        ok: true,
        suc,
        fcn,
        tipo,
        forms: this.parseJsonArray(row?.FORMAS_JSON),
        transacciones: this.parseJsonArray(row?.TRANSACCIONES_JSON),
        ventas: this.parseJsonArray(row?.VENTAS_JSON),
        efectivo: this.parseJsonArray(row?.EFECTIVO_JSON),
        pendientes: this.parseJsonArray(row?.OPV_PENDIENTES_JSON),
        hasPendingOpv: this.toBool(row?.HAS_PENDING_OPV),
        generatedAt: row?.GENERATED_AT ?? null,
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo generar reporte global');
    }
  }

  async getOpvPendientes(query: CajaGeneralGlobalQueryDto, user: JwtPayload) {
    try {
      const suc = this.normalizeUpper(query.suc);
      const fcn = this.normalizeDate(query.fcn);
      const tipo = this.operationTipo();

      this.assertSucursalAccess(suc, user);

      const rows = await this.dataSource.query(
        'EXEC dbo.sp_cg_opv_pendientes @SUC=@0, @FCN=@1, @TIPO_CORTE=@2',
        [suc, fcn, tipo],
      );

      return {
        ok: true,
        suc,
        fcn,
        tipo,
        items: rows ?? [],
      };
    } catch (error) {
      throw this.mapError(error, 'No se pudo consultar OPV pendientes');
    }
  }

  private assertSucursalAccess(suc: string, user: JwtPayload) {
    if (this.isAdmin(user)) return;
    const actorSuc = this.normalizeUpper(user?.suc ?? '');
    if (!actorSuc) {
      throw new BadRequestException(
        'Usuario sin sucursal para operar caja general',
      );
    }
    if (actorSuc !== suc) {
      throw new ForbiddenException(
        'No autorizado para operar otra sucursal en caja general',
      );
    }
  }

  private normalizeDate(raw: string) {
    const text = this.normalize(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new BadRequestException('fcn debe tener formato YYYY-MM-DD');
    }
    const [yy, mm, dd] = text.split('-').map((part) => Number(part));
    const parsed = new Date(yy, mm - 1, dd);
    if (
      parsed.getFullYear() !== yy ||
      parsed.getMonth() !== mm - 1 ||
      parsed.getDate() !== dd
    ) {
      throw new BadRequestException('fcn inválida');
    }
    return text;
  }

  private normalizeTipo(raw?: string) {
    const value = this.normalizeUpper(raw ?? 'GLOBAL');
    if (!['CA', 'VF', 'GLOBAL'].includes(value)) {
      throw new BadRequestException('tipo inválido. Use CA, VF o GLOBAL');
    }
    return value;
  }

  private operationTipo() {
    return 'GLOBAL';
  }

  private resolveActor(rawUser: string | undefined, user: JwtPayload) {
    return (
      this.normalize(rawUser ?? '') ||
      this.normalize(user?.username ?? '') ||
      this.normalize(String(user?.sub ?? '')) ||
      'system'
    );
  }

  private isOperableDate(fcn: string) {
    const now = new Date();
    const y = now.getFullYear().toString().padStart(4, '0');
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    return fcn === `${y}-${m}-${d}`;
  }

  private async findSupervisorAuthorizerByPassword(
    password: string,
    suc: string,
  ): Promise<SupervisorAuthorizer | null> {
    const rows = await this.dataSource.query(
      `
      SELECT
        U.IDUSUARIO,
        U.USERNAME,
        U.PASSWORD_HASH,
        R.CODIGO AS ROLE_CODE,
        R.NOMBRE AS ROLE_NAME
      FROM dbo.USUARIO U
      INNER JOIN dbo.ROL R ON R.IDROL = U.IDROL
      WHERE U.ESTATUS = 'ACTIVO'
        AND R.ACTIVO = 1
        AND UPPER(LTRIM(RTRIM(ISNULL(U.SUC, '')))) = @0
        AND (
          UPPER(LTRIM(RTRIM(ISNULL(R.CODIGO, '')))) IN ('SUPERVISOR', 'SUPERPV', 'SUPERVP')
          OR UPPER(LTRIM(RTRIM(ISNULL(R.NOMBRE, '')))) LIKE '%SUPERVISOR%'
        )
      `,
      [suc],
    );

    for (const raw of rows ?? []) {
      const row = raw as Record<string, unknown>;
      const hash = this.normalize(row.PASSWORD_HASH);
      if (!hash) continue;
      const valid = await bcrypt.compare(password, hash);
      if (!valid) continue;

      const idUsuario = Number(row.IDUSUARIO ?? 0) || 0;
      if (idUsuario <= 0) continue;

      return {
        idUsuario,
        username: this.normalize(row.USERNAME),
        roleCode: this.normalizeUpper(row.ROLE_CODE),
      };
    }

    return null;
  }

  private isAdmin(user: JwtPayload) {
    if (Number(user?.roleId ?? 0) === 1) return true;
    return this.normalizeUpper(user?.username ?? '') === 'ADMIN';
  }

  private normalize(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown) {
    return this.normalize(value).toUpperCase();
  }

  private firstRow(rows: unknown[]): Record<string, unknown> | null {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    if (!row || typeof row !== 'object') return null;
    return row as Record<string, unknown>;
  }

  private parseJsonObject(raw: unknown): Record<string, unknown> | null {
    if (raw == null) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    const text = this.normalize(raw);
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private parseJsonArray(raw: unknown): Record<string, unknown>[] {
    if (Array.isArray(raw)) {
      return raw.filter((item) => item && typeof item === 'object') as Record<
        string,
        unknown
      >[];
    }
    const text = this.normalize(raw);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item) => item && typeof item === 'object',
      ) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  private toNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toBool(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    const text = this.normalizeUpper(value);
    return text === '1' || text === 'TRUE' || text === 'YES';
  }

  private async auditMutation(input: {
    action: string;
    entity: string;
    entityId: string;
    suc: string | null;
    metadata: unknown;
    user: JwtPayload;
    ip: string | null;
    auditUserId?: number | null;
  }) {
    await this.audit.log({
      IDUSUARIO: input.auditUserId ?? (Number(input.user?.sub ?? 0) || null),
      ACTION: input.action,
      MODULO: 'caja-general',
      ENTIDAD: input.entity,
      ENTIDAD_ID: input.entityId || null,
      SUC: input.suc,
      METADATA_JSON: JSON.stringify(input.metadata ?? {}),
      IP: input.ip,
    });
  }

  private mapError(error: unknown, fallback: string) {
    if (
      error instanceof BadRequestException ||
      error instanceof ForbiddenException
    ) {
      return error;
    }

    if (error instanceof QueryFailedError) {
      const msg = this.normalize((error as Error).message);
      if (msg) return new BadRequestException(msg);
    }

    return new BadRequestException(fallback);
  }
}
