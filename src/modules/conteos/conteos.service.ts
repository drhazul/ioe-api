import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import type { JwtPayload } from '../auth/jwt.strategy';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';
import { DatDetSvrEntity } from '../datdetsvr/datdetsvr.entity';
import { UsrModSucEntity } from '../usr-mod-suc/usr-mod-suc.entity';

@Injectable()
export class ConteosService {
  private static readonly INVENTARIOS_MODULO = 'DAT_JAA_ALM';
  private readonly logger = new Logger(ConteosService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DatDetSvrEntity)
    private readonly detRepo: Repository<DatDetSvrEntity>,
    @InjectRepository(DatContCtrlEntity)
    private readonly ctrlRepo: Repository<DatContCtrlEntity>,
    @InjectRepository(UsrModSucEntity)
    private readonly usrModSucRepo: Repository<UsrModSucEntity>,
  ) {}

  async listConteos(user: JwtPayload, suc?: string) {
    const explicitSuc = this.normalizeSuc(suc);
    const isAdminRole = this.isAdmin(user);
    const allowedSucs = isAdminRole ? [] : await this.getAllowedSucs(user);
    const allowedSet = new Set(allowedSucs);
    let where = '';
    const params: string[] = [];

    if (explicitSuc) {
      if (!isAdminRole && !allowedSet.has(explicitSuc)) {
        throw new ForbiddenException(
          `No autorizado para la sucursal ${explicitSuc}`,
        );
      }
      where = 'WHERE SUC = @0';
      params.push(explicitSuc);
    } else if (!isAdminRole) {
      if (!allowedSucs.length) return [];
      const placeholders = allowedSucs.map((_, idx) => `@${idx}`).join(', ');
      where = `WHERE SUC IN (${placeholders})`;
      params.push(...allowedSucs);
    }

    // Raw query to avoid any mapping/scope surprises and return exactly what is in the table
    const rows = await this.dataSource.query(
      `
      SELECT
        TOKENREG,
        CONT,
        FCNC,
        ESTA,
        SUC,
        FCNAJ,
        ARTAJ,
        ARTCONT,
        TIPOCONT,
        TOTAL_ITEMS,
        FILE_NAME,
        LAST_ERROR,
        CREADO,
        CREADO_POR,
        MODIFICADO_POR
      FROM dbo.DAT_CONT_CTRL
      ${where}
      ORDER BY FCNC DESC, TOKENREG ASC
      `,
      params,
    );

    // Debug trace to verify data returned and filters applied
    // eslint-disable-next-line no-console
    console.log(
      '[conteos] listConteos rows:',
      rows?.length ?? 0,
      'suc:',
      explicitSuc ?? (isAdminRole ? 'ALL' : allowedSucs.join(',')),
      'roleId:',
      user?.roleId,
    );

    return rows;
  }

  async uploadItems(cont: string, file: any, user: JwtPayload, suc?: string) {
    if (!file) throw new BadRequestException('Archivo Excel requerido');

    const { contCode, sucToUse, ctrl } = await this.resolveCtrl(
      cont,
      user,
      suc,
    );

    const tipocont = (ctrl.TIPOCONT ?? '').trim().toUpperCase();
    if (tipocont !== 'ARTICULO' && tipocont !== 'JERARQUIA') {
      throw new BadRequestException(
        `TIPOCONT inválido para conteo ${contCode}`,
      );
    }

    const columnName = tipocont === 'ARTICULO' ? 'ART' : 'SCLA2';
    const alternateName = columnName === 'ART' ? 'SCLA2' : 'ART';
    const values = this.extractColumnValues(
      file,
      columnName,
      alternateName,
      contCode,
      tipocont,
    );

    if (!values.length) {
      throw new BadRequestException(
        `No se encontraron datos en la columna ${columnName}`,
      );
    }

    const insertValues = async (runner: any) => {
      const batchSize = 400; // evita exceder el limite de 2100 parametros en SQL Server
      for (let i = 0; i < values.length; i += batchSize) {
        const batch = values.slice(i, i + batchSize);
        const params: unknown[] = [];
        const placeholders = batch
          .map((value, idx) => {
            const base = idx * 5;
            params.push(sucToUse, contCode, tipocont, value, user.sub);
            return `(@${base}, @${base + 1}, @${base + 2}, @${base + 3}, @${base + 4})`;
          })
          .join(', ');

        const sql =
          'INSERT INTO dbo.DAT_CONT_UPLOAD_ITEMS ([SUC], [CONT], [TIPOCONT], [VALUE], [IDUSUARIO]) ' +
          `VALUES ${placeholders}`;
        await runner.query(sql, params);
      }
    };

    if (tipocont === 'ARTICULO') {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.query('SET LOCK_TIMEOUT 5000');
      await queryRunner.startTransaction();

      try {
        await queryRunner.query(
          'EXEC dbo.sp_cont_upload_clear @SUC = @0, @CONT = @1, @IDUSUARIO = @2',
          [sucToUse, contCode, user.sub],
        );
        // Fallback defensivo: asegurar limpieza por clave unica (SUC/CONT/TIPOCONT)
        await queryRunner.query(
          'DELETE FROM dbo.DAT_CONT_UPLOAD_ITEMS WHERE SUC = @0 AND CONT = @1 AND TIPOCONT = @2',
          [sucToUse, contCode, tipocont],
        );
        await insertValues(queryRunner);
        await queryRunner.query(
          'UPDATE dbo.DAT_CONT_CTRL SET TOTAL_ITEMS = @0, FILE_NAME = @1, MODIFICADO_POR = @2, LAST_ERROR = NULL WHERE SUC = @3 AND CONT = @4',
          [
            values.length,
            file.originalname ?? null,
            user.username ?? String(user.sub),
            sucToUse,
            contCode,
          ],
        );
        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        try {
          await this.dataSource.query(
            'UPDATE dbo.DAT_CONT_CTRL SET LAST_ERROR = @0, ESTA = @1 WHERE SUC = @2 AND CONT = @3',
            [message?.slice(0, 4000), 'ERROR', sucToUse, contCode],
          );
        } catch (_) {
          // no bloquear por fallas al loguear el error
        }
        throw err;
      } finally {
        await queryRunner.release();
      }

      try {
        // Fallback defensivo: limpiar detalle previo antes de reconstruir
        await this.dataSource.query(
          'DELETE FROM dbo.DAT_DET_SVR WHERE SUC = @0 AND CONT = @1',
          [sucToUse, contCode],
        );
        await this.dataSource.query(
          'EXEC dbo.sp_cont_build_det_svr @SUC = @0, @CONT = @1',
          [sucToUse, contCode],
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        try {
          await this.dataSource.query(
            'UPDATE dbo.DAT_CONT_CTRL SET LAST_ERROR = @0, ESTA = @1 WHERE SUC = @2 AND CONT = @3',
            [message?.slice(0, 4000), 'ERROR', sucToUse, contCode],
          );
        } catch (_) {
          // no bloquear por fallas al loguear el error
        }
        throw err;
      }

      const detCountRows = await this.dataSource.query(
        'SELECT COUNT(*) AS total FROM dbo.DAT_DET_SVR WHERE SUC = @0 AND CONT = @1',
        [sucToUse, contCode],
      );
      const totalDetRow = detCountRows?.[0] ?? {};
      const totalDetVal =
        (totalDetRow as any).total ??
        (totalDetRow as any).TOTAL ??
        Object.values(totalDetRow as Record<string, unknown>)[0] ??
        0;
      const totalDet = Number(totalDetVal) || 0;

      return {
        cont: contCode,
        suc: sucToUse,
        tipocont,
        totalItems: values.length,
        totalDet,
        fileName: file.originalname ?? null,
        status: 'LISTO',
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query('SET LOCK_TIMEOUT 5000');
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        'EXEC dbo.sp_cont_upload_clear @SUC = @0, @CONT = @1, @IDUSUARIO = @2',
        [sucToUse, contCode, user.sub],
      );
      // Fallback defensivo: asegurar limpieza por clave unica (SUC/CONT/TIPOCONT)
      await queryRunner.query(
        'DELETE FROM dbo.DAT_CONT_UPLOAD_ITEMS WHERE SUC = @0 AND CONT = @1 AND TIPOCONT = @2',
        [sucToUse, contCode, tipocont],
      );
      await insertValues(queryRunner);
      // Fallback defensivo: limpiar detalle previo antes de reconstruir
      await queryRunner.query(
        'DELETE FROM dbo.DAT_DET_SVR WHERE SUC = @0 AND CONT = @1',
        [sucToUse, contCode],
      );
      await queryRunner.query(
        'EXEC dbo.sp_cont_build_det_svr @SUC = @0, @CONT = @1',
        [sucToUse, contCode],
      );

      const detCountRows = await queryRunner.query(
        'SELECT COUNT(*) AS total FROM dbo.DAT_DET_SVR WHERE SUC = @0 AND CONT = @1',
        [sucToUse, contCode],
      );
      const totalDetRow = detCountRows?.[0] ?? {};
      const totalDetVal =
        (totalDetRow as any).total ??
        (totalDetRow as any).TOTAL ??
        Object.values(totalDetRow as Record<string, unknown>)[0] ??
        0;
      const totalDet = Number(totalDetVal) || 0;

      await queryRunner.query(
        'UPDATE dbo.DAT_CONT_CTRL SET ESTA = @0, TOTAL_ITEMS = @1, FILE_NAME = @2, MODIFICADO_POR = @3, LAST_ERROR = NULL WHERE SUC = @4 AND CONT = @5',
        [
          'LISTO',
          values.length,
          file.originalname ?? null,
          user.username ?? String(user.sub),
          sucToUse,
          contCode,
        ],
      );

      await queryRunner.commitTransaction();

      return {
        cont: contCode,
        suc: sucToUse,
        tipocont,
        totalItems: values.length,
        totalDet,
        fileName: file.originalname ?? null,
        status: 'LISTO',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const message = err instanceof Error ? err.message : 'Error desconocido';
      // intenta guardar el error para diagnóstico
      try {
        await this.dataSource.query(
          'UPDATE dbo.DAT_CONT_CTRL SET LAST_ERROR = @0, ESTA = @1 WHERE SUC = @2 AND CONT = @3',
          [message?.slice(0, 4000), 'ERROR', sucToUse, contCode],
        );
      } catch (_) {
        // no bloquear por fallas al loguear el error
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async processConteo(cont: string, user: JwtPayload, suc?: string) {
    const { contCode, sucToUse, ctrl } = await this.resolveCtrl(
      cont,
      user,
      suc,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Fallback defensivo: limpiar detalle previo antes de reconstruir
      await queryRunner.query(
        'DELETE FROM dbo.DAT_DET_SVR WHERE SUC = @0 AND CONT = @1',
        [sucToUse, contCode],
      );
      await queryRunner.query(
        'EXEC dbo.sp_cont_build_det_svr @SUC = @0, @CONT = @1',
        [sucToUse, contCode],
      );

      const ctrlRepo = queryRunner.manager.getRepository(DatContCtrlEntity);
      const refreshed = await ctrlRepo.findOne({
        where: { CONT: contCode, SUC: sucToUse },
      });
      const countRows = await queryRunner.query(
        'SELECT COUNT(*) AS total FROM dbo.DAT_DET_SVR WHERE SUC = @0 AND CONT = @1',
        [sucToUse, contCode],
      );

      const totalDetRow = countRows?.[0] ?? {};
      const totalDetVal =
        (totalDetRow as any).total ??
        (totalDetRow as any).TOTAL ??
        Object.values(totalDetRow as Record<string, unknown>)[0] ??
        0;
      const totalDet = Number(totalDetVal) || 0;

      await queryRunner.commitTransaction();

      return {
        cont: contCode,
        suc: sucToUse,
        ctrl: refreshed ?? null,
        totalDet,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async applyAdjustment(cont: string, user: JwtPayload, suc?: string) {
    const { contCode, sucToUse, ctrl } = await this.resolveCtrl(
      cont,
      user,
      suc,
    );

    const estado = (ctrl.ESTA ?? '').trim().toUpperCase();
    if (estado === 'AJUSTADO' || estado === 'CERRADO_AJUSTADO') {
      throw new ConflictException('Conteo ya ajustado');
    }
    if (estado !== 'LISTO' && estado !== 'CERRADO') {
      throw new BadRequestException(
        `Conteo ${contCode} no está en estado LISTO/CERRADO`,
      );
    }

    const username = (user?.username ?? '').trim() || String(user?.sub ?? '');
    const startedAt = Date.now();
    this.logger.log(
      `[applyAdjustment:start] cont=${contCode} suc=${sucToUse} usr=${username} roleId=${Number(
        user?.roleId ?? 0,
      )}`,
    );

    try {
      const rows = await this.dataSource.query(
        'EXEC dbo.sp_cont_apply_adjustment @SUC = @0, @CONT = @1, @USR = @2',
        [sucToUse, contCode, username],
      );
      const row = (rows?.[0] ?? {}) as Record<string, unknown>;
      const docp701 = this.pickString(row, [
        'DOCP701',
        'DOC_P701',
        'DOC701',
        'DOCP_701',
      ]);
      const docp702 = this.pickString(row, [
        'DOCP702',
        'DOC_P702',
        'DOC702',
        'DOCP_702',
      ]);
      const movimientosInsertados = this.pickNumber(row, [
        'MOVIMIENTOSINSERTADOS',
        'MOVIMIENTOS_INSERTADOS',
        'MOV_INSERTADOS',
        'MOVS',
        'MOVIMIENTOS',
        'MOV_INS',
      ]);

      this.logger.log(
        `[applyAdjustment:ok] cont=${contCode} suc=${sucToUse} movs=${
          movimientosInsertados ?? '-'
        } doc701=${docp701 ?? '-'} doc702=${docp702 ?? '-'} ms=${
          Date.now() - startedAt
        }`,
      );

      return {
        suc: sucToUse,
        cont: contCode,
        docp701,
        docp702,
        movimientosInsertados,
      };
    } catch (err) {
      const meta = this.extractSqlErrorMeta(err);
      const diagnostics = await this.loadAdjustmentDiagnostics(
        sucToUse,
        contCode,
      );
      const normalized = meta.message.toUpperCase();

      this.logger.error(
        `[applyAdjustment:fail] cont=${contCode} suc=${sucToUse} ms=${
          Date.now() - startedAt
        } sqlNumber=${meta.number ?? '-'} sqlState=${meta.state ?? '-'} sqlProcedure=${
          meta.procedure ?? '-'
        } message=${meta.message}`,
      );
      this.logger.error(
        `[applyAdjustment:diag] ${JSON.stringify({
          cont: contCode,
          suc: sucToUse,
          diagnostics,
        })}`,
      );

      if (
        meta.number === 50020 ||
        meta.number === 50021 ||
        meta.number === 50022
      ) {
        throw new ConflictException(meta.message);
      }
      if (
        meta.number === 50010 ||
        meta.number === 50011 ||
        meta.number === 50012 ||
        meta.number === 50001 ||
        meta.number === 50030
      ) {
        throw new BadRequestException(meta.message);
      }
      if (normalized.includes('AJUST')) {
        throw new ConflictException(meta.message);
      }
      if (
        normalized.includes('ESTADO') ||
        normalized.includes('LISTO') ||
        normalized.includes('CERRADO')
      ) {
        throw new BadRequestException(meta.message);
      }
      throw new BadRequestException(
        meta.number == null
          ? `Error al aplicar ajuste: ${meta.message}`
          : `Error SQL ${meta.number}: ${meta.message}`,
      );
    }
  }

  async syncCapturasFromDetalle(cont: string, user: JwtPayload, suc?: string) {
    const { contCode, sucToUse, ctrl } = await this.resolveCtrl(
      cont,
      user,
      suc,
    );

    const estado = (ctrl.ESTA ?? '').trim().toUpperCase();
    if (estado === 'AJUSTADO' || estado === 'CERRADO_AJUSTADO') {
      throw new ConflictException(
        'Conteo ya ajustado; no se puede resincronizar capturas',
      );
    }

    const startedAt = Date.now();
    this.logger.log(
      `[syncCapturas:start] cont=${contCode} suc=${sucToUse} usr=${String(
        user?.username ?? user?.sub ?? '',
      )}`,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const captureSummaryRows = await queryRunner.query(
        `
        SELECT
          COUNT(*) AS capturesTotal,
          COUNT(DISTINCT UPPER(LTRIM(RTRIM(ART)))) AS articulosCapturados,
          SUM(CASE WHEN ALMACEN = '001' THEN CANT ELSE 0 END) AS cap001,
          SUM(CASE WHEN ALMACEN = '002' THEN CANT ELSE 0 END) AS cap002,
          SUM(CASE WHEN ALMACEN = 'M001' THEN CANT ELSE 0 END) AS capM1,
          SUM(CASE WHEN ALMACEN = 'T001' THEN CANT ELSE 0 END) AS capT1
        FROM dbo.DAT_CONT_CAPTURA
        WHERE SUC = @0 AND CONT = @1
        `,
        [sucToUse, contCode],
      );
      const captureSummary = (captureSummaryRows?.[0] ??
        {}) as Record<string, unknown>;
      const capturesTotal =
        this.pickNumber(captureSummary, ['capturesTotal']) ?? 0;
      const articulosCapturados =
        this.pickNumber(captureSummary, ['articulosCapturados']) ?? 0;
      const cap001 = this.pickNumber(captureSummary, ['cap001']) ?? 0;
      const cap002 = this.pickNumber(captureSummary, ['cap002']) ?? 0;
      const capM1 = this.pickNumber(captureSummary, ['capM1']) ?? 0;
      const capT1 = this.pickNumber(captureSummary, ['capT1']) ?? 0;
      const capTotal = cap001 + cap002 + capM1 + capT1;

      const beforeRows = await queryRunner.query(
        'SELECT COUNT(*) AS total FROM dbo.DAT_DET_SVR WHERE SUC = @0 AND CONT = @1',
        [sucToUse, contCode],
      );
      const detRowsBefore =
        this.pickNumber((beforeRows?.[0] ?? {}) as Record<string, unknown>, [
          'total',
        ]) ?? 0;

      const withCaptureRows = await queryRunner.query(
        `
        SELECT COUNT(*) AS total
        FROM dbo.DAT_DET_SVR det
        WHERE det.SUC = @0
          AND det.CONT = @1
          AND EXISTS (
            SELECT 1
            FROM dbo.DAT_CONT_CAPTURA cap
            WHERE cap.SUC = det.SUC
              AND cap.CONT = det.CONT
              AND UPPER(LTRIM(RTRIM(cap.ART))) = UPPER(LTRIM(RTRIM(det.ART)))
          )
        `,
        [sucToUse, contCode],
      );
      const detRowsWithCapture =
        this.pickNumber(
          (withCaptureRows?.[0] ?? {}) as Record<string, unknown>,
          ['total'],
        ) ?? 0;

      await queryRunner.query(
        `
        ;WITH cap AS (
          SELECT
            UPPER(LTRIM(RTRIM(c.ART))) AS ART_KEY,
            SUM(CASE WHEN c.ALMACEN = '001' THEN c.CANT ELSE 0 END) AS CAP001,
            SUM(CASE WHEN c.ALMACEN = '002' THEN c.CANT ELSE 0 END) AS CAP002,
            SUM(CASE WHEN c.ALMACEN = 'M001' THEN c.CANT ELSE 0 END) AS CAPM1,
            SUM(CASE WHEN c.ALMACEN = 'T001' THEN c.CANT ELSE 0 END) AS CAPT1
          FROM dbo.DAT_CONT_CAPTURA c
          WHERE c.SUC = @0 AND c.CONT = @1
          GROUP BY UPPER(LTRIM(RTRIM(c.ART)))
        )
        UPDATE det
           SET
            [001] = ISNULL(cap.CAP001, 0),
            [002] = ISNULL(cap.CAP002, 0),
            M001 = ISNULL(cap.CAPM1, 0),
            T001 = ISNULL(cap.CAPT1, 0),
            TOTAL = ISNULL(cap.CAP001, 0) + ISNULL(cap.CAP002, 0) + ISNULL(cap.CAPM1, 0) + ISNULL(cap.CAPT1, 0),
            DIF_01 = ISNULL(cap.CAP001, 0) - ISNULL(det.MB52_01, 0),
            DIF_02 = ISNULL(cap.CAP002, 0) - ISNULL(det.MB52_02, 0),
            DIF_M1 = ISNULL(cap.CAPM1, 0) - ISNULL(det.MB52_M1, 0),
            DIF_T1 = ISNULL(cap.CAPT1, 0) - ISNULL(det.MB52_T1, 0),
            DIF_T = (ISNULL(cap.CAP001, 0) + ISNULL(cap.CAP002, 0) + ISNULL(cap.CAPM1, 0) + ISNULL(cap.CAPT1, 0)) - ISNULL(det.MB52_T, 0),
            DIF_CTOP = (
              (ISNULL(cap.CAP001, 0) + ISNULL(cap.CAP002, 0) + ISNULL(cap.CAPM1, 0) + ISNULL(cap.CAPT1, 0)) - ISNULL(det.MB52_T, 0)
            ) * ISNULL(det.CTOP, 0)
        FROM dbo.DAT_DET_SVR det
        LEFT JOIN cap
          ON cap.ART_KEY = UPPER(LTRIM(RTRIM(det.ART)))
        WHERE det.SUC = @0
          AND det.CONT = @1
        `,
        [sucToUse, contCode],
      );

      await queryRunner.query(
        `
        ;WITH cap AS (
          SELECT
            UPPER(LTRIM(RTRIM(c.ART))) AS ART_KEY,
            MAX(LTRIM(RTRIM(c.ART))) AS ART_VALUE,
            SUM(CASE WHEN c.ALMACEN = '001' THEN c.CANT ELSE 0 END) AS CAP001,
            SUM(CASE WHEN c.ALMACEN = '002' THEN c.CANT ELSE 0 END) AS CAP002,
            SUM(CASE WHEN c.ALMACEN = 'M001' THEN c.CANT ELSE 0 END) AS CAPM1,
            SUM(CASE WHEN c.ALMACEN = 'T001' THEN c.CANT ELSE 0 END) AS CAPT1
          FROM dbo.DAT_CONT_CAPTURA c
          WHERE c.SUC = @0 AND c.CONT = @1
          GROUP BY UPPER(LTRIM(RTRIM(c.ART)))
        )
        INSERT INTO dbo.DAT_DET_SVR (
          SUC,
          CONT,
          ART,
          UPC,
          DES,
          CTOP,
          TOTAL,
          MB52_T,
          DIF_T,
          DIF_CTOP,
          [001],
          [002],
          M001,
          T001,
          MB52_01,
          MB52_02,
          MB52_M1,
          MB52_T1,
          DIF_01,
          DIF_02,
          DIF_M1,
          DIF_T1
        )
        SELECT
          @0 AS SUC,
          @1 AS CONT,
          cap.ART_VALUE AS ART,
          artRef.UPC,
          artRef.DES,
          ISNULL(artRef.CTOP, 0) AS CTOP,
          (ISNULL(cap.CAP001, 0) + ISNULL(cap.CAP002, 0) + ISNULL(cap.CAPM1, 0) + ISNULL(cap.CAPT1, 0)) AS TOTAL,
          0 AS MB52_T,
          (ISNULL(cap.CAP001, 0) + ISNULL(cap.CAP002, 0) + ISNULL(cap.CAPM1, 0) + ISNULL(cap.CAPT1, 0)) AS DIF_T,
          0 AS DIF_CTOP,
          ISNULL(cap.CAP001, 0) AS [001],
          ISNULL(cap.CAP002, 0) AS [002],
          ISNULL(cap.CAPM1, 0) AS M001,
          ISNULL(cap.CAPT1, 0) AS T001,
          0 AS MB52_01,
          0 AS MB52_02,
          0 AS MB52_M1,
          0 AS MB52_T1,
          ISNULL(cap.CAP001, 0) AS DIF_01,
          ISNULL(cap.CAP002, 0) AS DIF_02,
          ISNULL(cap.CAPM1, 0) AS DIF_M1,
          ISNULL(cap.CAPT1, 0) AS DIF_T1
        FROM cap
        OUTER APPLY (
          SELECT TOP 1
            a.UPC,
            a.DES,
            a.CTOP
          FROM dbo.DAT_ART a
          WHERE a.SUC = @0
            AND UPPER(LTRIM(RTRIM(a.ART))) = cap.ART_KEY
          ORDER BY a.UPC ASC
        ) artRef
        WHERE NOT EXISTS (
          SELECT 1
          FROM dbo.DAT_DET_SVR det
          WHERE det.SUC = @0
            AND det.CONT = @1
            AND UPPER(LTRIM(RTRIM(det.ART))) = cap.ART_KEY
        )
        `,
        [sucToUse, contCode],
      );

      const afterRows = await queryRunner.query(
        'SELECT COUNT(*) AS total FROM dbo.DAT_DET_SVR WHERE SUC = @0 AND CONT = @1',
        [sucToUse, contCode],
      );
      const detRowsAfter =
        this.pickNumber((afterRows?.[0] ?? {}) as Record<string, unknown>, [
          'total',
        ]) ?? 0;

      await queryRunner.commitTransaction();

      const insertedRows = Math.max(detRowsAfter - detRowsBefore, 0);
      const zeroedRows = Math.max(detRowsBefore - detRowsWithCapture, 0);

      this.logger.log(
        `[syncCapturas:ok] cont=${contCode} suc=${sucToUse} captures=${capturesTotal} arts=${articulosCapturados} updated=${detRowsBefore} inserted=${insertedRows} zeroed=${zeroedRows} ms=${
          Date.now() - startedAt
        }`,
      );

      return {
        cont: contCode,
        suc: sucToUse,
        capturesTotal,
        articulosCapturados,
        updatedRows: detRowsBefore,
        insertedRows,
        zeroedRows,
        cap001,
        cap002,
        capM1,
        capT1,
        capTotal,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const meta = this.extractSqlErrorMeta(err);
      this.logger.error(
        `[syncCapturas:fail] cont=${contCode} suc=${sucToUse} sqlNumber=${meta.number ?? '-'} sqlState=${meta.state ?? '-'} sqlProcedure=${
          meta.procedure ?? '-'
        } message=${meta.message}`,
      );
      throw new BadRequestException(
        meta.number == null
          ? `Error al sincronizar capturas: ${meta.message}`
          : `Error SQL ${meta.number}: ${meta.message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async listDetalles(
    cont: string,
    page: number,
    limit: number,
    user: JwtPayload,
    suc?: string,
  ) {
    const { contCode, sucToUse } = await this.resolveCtrl(cont, user, suc);

    const safePage = page < 1 ? 1 : page;
    const safeLimit = limit < 1 ? 1 : Math.min(limit, 500);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await this.detRepo
      .createQueryBuilder('det')
      .where('det.CONT = :cont', { cont: contCode })
      .andWhere('det.SUC = :suc', { suc: sucToUse })
      .orderBy('ABS(ISNULL(det.DIF_CTOP, 0))', 'DESC')
      .addOrderBy('det.ID', 'ASC')
      .skip(skip)
      .take(safeLimit)
      .getManyAndCount();

    return {
      data: rows,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / safeLimit),
    };
  }

  async summaryConteo(cont: string, user: JwtPayload, suc?: string) {
    const { contCode, sucToUse, ctrl } = await this.resolveCtrl(
      cont,
      user,
      suc,
    );

    const rows = await this.dataSource.query(
      `
      SELECT
        COUNT(*) AS totalRecords,
        SUM(ISNULL(DIF_CTOP, 0)) AS sumDifCtop,
        SUM(ISNULL(DIF_T, 0)) AS sumDifT
      FROM dbo.DAT_DET_SVR
      WHERE SUC = @0 AND CONT = @1 AND ISNULL(EXT, 0) = 0
      `,
      [sucToUse, contCode],
    );

    const row = rows?.[0] ?? {};
    const totalRecords =
      Number(
        (row as any).totalRecords ??
          (row as any).TOTALRECORDS ??
          Object.values(row as Record<string, unknown>)[0] ??
          0,
      ) || 0;
    const sumDifCtop = Number((row as any).sumDifCtop ?? 0) || 0;
    const sumDifT = Number((row as any).sumDifT ?? 0) || 0;

    return {
      cont: contCode,
      suc: sucToUse,
      esta: ctrl.ESTA ?? null,
      totalRecords,
      sumDifCtop,
      sumDifT,
    };
  }

  private extractColumnValues(
    file: any,
    columnName: 'ART' | 'SCLA2',
    alternateName: 'ART' | 'SCLA2',
    contCode: string,
    tipocont: string,
  ) {
    let workbook: XLSX.WorkBook;

    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('No se pudo leer el archivo Excel');
    }

    const sheetNames = workbook.SheetNames ?? [];
    if (!sheetNames.length) {
      throw new BadRequestException('El archivo Excel no contiene hojas');
    }

    const expectedHeaders = this.buildHeaderSet(columnName);
    const alternateHeaders = this.buildHeaderSet(alternateName);
    let sawAlternate = false;
    let foundExpected = false;

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const bounds = this.getSheetBounds(sheet);
      if (!bounds) continue;

      const scanEnd = Math.min(bounds.endRow, bounds.startRow + 29);
      let headerRowIndex = -1;
      let colIndex = -1;

      for (let r = bounds.startRow; r <= scanEnd; r += 1) {
        for (let c = bounds.startCol; c <= bounds.endCol; c += 1) {
          const raw = this.getCellRaw(sheet, r, c);
          const normalized = this.normalizeHeader(raw);
          if (!normalized) continue;
          if (expectedHeaders.has(normalized)) {
            headerRowIndex = r;
            colIndex = c;
            break;
          }
          if (alternateHeaders.has(normalized)) {
            sawAlternate = true;
          }
        }
        if (colIndex !== -1) break;
      }

      if (colIndex !== -1) {
        foundExpected = true;
        const values: string[] = [];
        for (let r = headerRowIndex + 1; r <= bounds.endRow; r += 1) {
          const raw = this.getCellRaw(sheet, r, colIndex);
          if (raw === undefined || raw === null) continue;
          const value = String(raw).trim();
          if (value) values.push(value);
        }
        if (values.length) {
          return this.normalizeValues(values, tipocont);
        }
      }
    }

    if (!foundExpected && sawAlternate) {
      throw new BadRequestException(
        `El conteo ${contCode} es tipo ${tipocont}, pero el archivo contiene columna ${alternateName}. ` +
          `Usa un archivo con columna ${columnName}.`,
      );
    }

    if (!foundExpected && tipocont === 'ARTICULO') {
      let bestValues: string[] = [];
      for (const sheetName of sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const bounds = this.getSheetBounds(sheet);
        if (!bounds) continue;

        for (let c = bounds.startCol; c <= bounds.endCol; c += 1) {
          const values: string[] = [];
          for (let r = bounds.startRow; r <= bounds.endRow; r += 1) {
            const raw = this.getCellRaw(sheet, r, c);
            if (raw === undefined || raw === null) continue;
            const value = String(raw).trim();
            if (!value) continue;
            const normalized = this.normalizeHeader(value);
            if (
              expectedHeaders.has(normalized) ||
              alternateHeaders.has(normalized)
            )
              continue;
            values.push(value);
          }
          if (values.length > bestValues.length) {
            bestValues = values;
          }
        }
      }
      if (bestValues.length) {
        return this.normalizeValues(bestValues, tipocont);
      }
    }

    throw new BadRequestException(
      `No se encontró la columna ${columnName} o no tenía datos`,
    );
  }

  private normalizeHeader(value: unknown) {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private getSheetBounds(sheet: XLSX.WorkSheet) {
    let startRow = Number.POSITIVE_INFINITY;
    let endRow = -1;
    let startCol = Number.POSITIVE_INFINITY;
    let endCol = -1;

    const ref = sheet['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      startRow = Math.min(startRow, range.s.r);
      endRow = Math.max(endRow, range.e.r);
      startCol = Math.min(startCol, range.s.c);
      endCol = Math.max(endCol, range.e.c);
    }

    for (const key of Object.keys(sheet)) {
      if (key.startsWith('!')) continue;
      const cell = XLSX.utils.decode_cell(key);
      startRow = Math.min(startRow, cell.r);
      endRow = Math.max(endRow, cell.r);
      startCol = Math.min(startCol, cell.c);
      endCol = Math.max(endCol, cell.c);
    }

    if (!Number.isFinite(startRow) || endRow < startRow || endCol < startCol) {
      return null;
    }

    return { startRow, endRow, startCol, endCol };
  }

  private getCellRaw(sheet: XLSX.WorkSheet, row: number, col: number) {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = sheet[addr] as XLSX.CellObject | undefined;
    if (!cell) return undefined;
    return cell.v ?? cell.w;
  }

  private buildHeaderSet(name: 'ART' | 'SCLA2') {
    if (name === 'ART') {
      return new Set(['ART', 'ARTICULO', 'ARTICULOS']);
    }
    return new Set(['SCLA2']);
  }

  private normalizeValues(values: string[], tipocont: string) {
    // Evita violar el índice único (SUC, CONT, TIPOCONT, VALUE)
    // para cualquier tipo de conteo.
    const normalized = tipocont === 'ARTICULO' ? values : values;
    return Array.from(new Set(normalized));
  }

  private async resolveCtrl(cont: string, user: JwtPayload, suc?: string) {
    const contCode = cont?.trim();
    if (!contCode) throw new BadRequestException('CONT es obligatorio');

    const explicitSuc = this.normalizeSuc(suc);
    const isAdmin = this.isAdmin(user);
    const allowedSucs = isAdmin ? [] : await this.getAllowedSucs(user);
    const allowedSet = new Set(allowedSucs);

    if (!isAdmin && explicitSuc && !allowedSet.has(explicitSuc)) {
      throw new ForbiddenException(
        `No autorizado para la sucursal ${explicitSuc}`,
      );
    }

    let ctrl: DatContCtrlEntity | null = null;

    if (explicitSuc) {
      ctrl = await this.ctrlRepo.findOne({
        where: { CONT: contCode, SUC: explicitSuc },
      });
    } else if (isAdmin) {
      ctrl = await this.ctrlRepo
        .createQueryBuilder('ctrl')
        .where('ctrl.CONT = :cont', { cont: contCode })
        .orderBy('ctrl.FCNC', 'DESC')
        .addOrderBy('ctrl.TOKENREG', 'ASC')
        .getOne();
    } else {
      if (!allowedSucs.length) {
        throw new ForbiddenException(
          `Usuario sin sucursales autorizadas en USR_MOD_SUC para el módulo ${ConteosService.INVENTARIOS_MODULO}`,
        );
      }
      ctrl = await this.ctrlRepo
        .createQueryBuilder('ctrl')
        .where('ctrl.CONT = :cont', { cont: contCode })
        .andWhere('ctrl.SUC IN (:...allowedSucs)', { allowedSucs })
        .orderBy('ctrl.FCNC', 'DESC')
        .addOrderBy('ctrl.TOKENREG', 'ASC')
        .getOne();
    }

    if (!ctrl) {
      if (isAdmin && !explicitSuc) {
        throw new NotFoundException(`Conteo ${contCode} no existe`);
      }
      const label =
        explicitSuc ??
        (allowedSucs.length
          ? allowedSucs.join(',')
          : 'sin sucursales autorizadas');
      throw new NotFoundException(
        `Conteo ${contCode} no existe para la sucursal ${label}`,
      );
    }

    // La sucursal válida debe provenir del registro de conteo (dato obligatorio)
    const sucFromCtrl = ctrl.SUC?.trim();
    const sucToUse = sucFromCtrl || explicitSuc;
    if (!sucToUse) {
      throw new BadRequestException(
        `El conteo ${contCode} no tiene sucursal asignada`,
      );
    }
    if (!isAdmin && !allowedSet.has(sucToUse)) {
      throw new ForbiddenException(
        `No autorizado para la sucursal ${sucToUse}`,
      );
    }

    return { contCode, sucToUse, ctrl };
  }

  private isAdmin(user: JwtPayload) {
    return Number(user?.roleId ?? 0) === 1;
  }

  private normalizeSuc(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private async getAllowedSucs(user: JwtPayload) {
    const username = (user?.username ?? '').trim();
    if (!username) {
      throw new ForbiddenException('Usuario no disponible en token');
    }
    const rows = await this.usrModSucRepo.find({
      where: {
        MODULO: ConteosService.INVENTARIOS_MODULO,
        USUARIO: username,
        ACTIVO: true,
      },
      order: { SUC: 'ASC' },
    });

    const allowed = new Set<string>();
    for (const row of rows) {
      const suc = this.normalizeSuc(row.SUC);
      if (suc) allowed.add(suc);
    }
    return Array.from(allowed);
  }

  private extractSqlErrorMeta(err: unknown) {
    const fallbackMessage =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'Error SQL desconocido';

    const errorObj =
      err != null && typeof err === 'object'
        ? (err as Record<string, unknown>)
        : null;
    const driverObj =
      errorObj?.['driverError'] != null &&
      typeof errorObj['driverError'] === 'object'
        ? (errorObj['driverError'] as Record<string, unknown>)
        : null;

    const toIntValue = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
      }
      if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const toStringValue = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const text = value.trim();
      return text.length === 0 ? null : text;
    };

    return {
      message: fallbackMessage,
      number: toIntValue(driverObj?.['number'] ?? driverObj?.['errno']),
      state: toIntValue(driverObj?.['state']),
      severity: toIntValue(driverObj?.['class']),
      lineNumber: toIntValue(driverObj?.['lineNumber']),
      procedure: toStringValue(
        driverObj?.['procName'] ?? driverObj?.['procedure'],
      ),
      code: toStringValue(errorObj?.['code']),
    };
  }

  private async loadAdjustmentDiagnostics(suc: string, cont: string) {
    const ctrlRows = await this.dataSource.query(
      `
      SELECT TOP 1 ESTA, FCNC, FCNAJ, MODIFICADO_POR
      FROM dbo.DAT_CONT_CTRL
      WHERE SUC = @0 AND CONT = @1
      `,
      [suc, cont],
    );
    const logRows = await this.dataSource.query(
      `
      SELECT TOP 1 DOCP_701, DOCP_702, MOVS, AJUST_USER
      FROM dbo.DAT_CONT_AJUSTE_LOG
      WHERE SUC = @0 AND CONT = @1
      ORDER BY DOCP_701 DESC
      `,
      [suc, cont],
    );
    const mb51Rows = await this.dataSource.query(
      `
      SELECT COUNT(*) AS MB51_MOVS, MIN(DOCP) AS DOCP_MIN, MAX(DOCP) AS DOCP_MAX
      FROM dbo.DAT_MB51
      WHERE SUC = @0 AND TXT = @1 AND CLSM IN ('701','702')
      `,
      [suc, cont],
    );
    const detRows = await this.dataSource.query(
      `
      SELECT
        COUNT(*) AS DET_ROWS,
        SUM(
          CASE
            WHEN ABS(ISNULL(DIF_01,0)) > 0 OR
                 ABS(ISNULL(DIF_02,0)) > 0 OR
                 ABS(ISNULL(DIF_M1,0)) > 0 OR
                 ABS(ISNULL(DIF_T1,0)) > 0
            THEN 1 ELSE 0
          END
        ) AS DET_WITH_DIFF
      FROM dbo.DAT_DET_SVR
      WHERE SUC = @0 AND CONT = @1 AND ISNULL(EXT,0) = 0
      `,
      [suc, cont],
    );

    return {
      ctrl: (ctrlRows?.[0] ?? null) as Record<string, unknown> | null,
      ajusteLog: (logRows?.[0] ?? null) as Record<string, unknown> | null,
      mb51: (mb51Rows?.[0] ?? null) as Record<string, unknown> | null,
      detalle: (detRows?.[0] ?? null) as Record<string, unknown> | null,
    };
  }

  private pickValue(row: Record<string, unknown>, keys: string[]) {
    const entries = Object.entries(row ?? {});
    const normalized = new Map<string, unknown>();
    for (const [key, value] of entries) {
      normalized.set(String(key).toUpperCase(), value);
    }
    for (const key of keys) {
      const value = normalized.get(String(key).toUpperCase());
      if (value !== undefined) return value;
    }
    return undefined;
  }

  private pickString(row: Record<string, unknown>, keys: string[]) {
    const value = this.pickValue(row, keys);
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text.length === 0 ? null : text;
  }

  private pickNumber(row: Record<string, unknown>, keys: string[]) {
    const value = this.pickValue(row, keys);
    if (value === undefined || value === null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
}
