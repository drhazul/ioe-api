import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import type { JwtPayload } from '../auth/jwt.strategy';
import { DatContCtrlEntity } from '../datcontctrl/datcontctrl.entity';
import { DatDetSvrEntity } from '../datdetsvr/datdetsvr.entity';

@Injectable()
export class ConteosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DatDetSvrEntity)
    private readonly detRepo: Repository<DatDetSvrEntity>,
    @InjectRepository(DatContCtrlEntity)
    private readonly ctrlRepo: Repository<DatContCtrlEntity>,
  ) {}

  async listConteos(user: JwtPayload, suc?: string) {
    const explicitSuc = suc?.trim();
    const userSuc = user?.suc?.trim();
    const isAdminRole = Number(user?.roleId ?? 0) === 1;
    const isUniversalSuc = userSuc?.toUpperCase() === '000';
    const allowAll = !explicitSuc && (isAdminRole || isUniversalSuc);

    const normalizedSuc = allowAll ? undefined : (explicitSuc || userSuc);

    // Raw query to avoid any mapping/scope surprises and return exactly what is in the table
    const params: any[] = [];
    const where = normalizedSuc ? 'WHERE SUC = @0' : '';
    if (normalizedSuc) params.push(normalizedSuc);

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
    console.log('[conteos] listConteos rows:', rows?.length ?? 0, 'suc:', normalizedSuc ?? 'ALL', 'roleId:', user?.roleId);

    return rows;
  }

  async uploadItems(cont: string, file: any, user: JwtPayload, suc?: string) {
    if (!file) throw new BadRequestException('Archivo Excel requerido');

    const { contCode, sucToUse, ctrl } = await this.resolveCtrl(cont, user, suc);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query('SET LOCK_TIMEOUT 5000');
    await queryRunner.startTransaction();

    try {
      const tipocont = (ctrl.TIPOCONT ?? '').trim().toUpperCase();
      if (tipocont !== 'ARTICULO' && tipocont !== 'JERARQUIA') {
        throw new BadRequestException(`TIPOCONT inválido para conteo ${contCode}`);
      }

      await queryRunner.query('EXEC dbo.sp_cont_upload_clear @SUC = @0, @CONT = @1, @IDUSUARIO = @2', [
        sucToUse,
        contCode,
        user.sub,
      ]);

      const columnName = tipocont === 'ARTICULO' ? 'ART' : 'SCLA2';
      const alternateName = columnName === 'ART' ? 'SCLA2' : 'ART';
      const values = this.extractColumnValues(file, columnName, alternateName, contCode, tipocont);

      if (!values.length) {
        throw new BadRequestException(`No se encontraron datos en la columna ${columnName}`);
      }

      const batchSize = 500;
      for (let i = 0; i < values.length; i += batchSize) {
        const batch = values.slice(i, i + batchSize);
        const rows = batch.map((value) => ({
          SUC: sucToUse,
          CONT: contCode,
          TIPOCONT: tipocont,
          VALUE: value,
          IDUSUARIO: user.sub,
        }));

        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into('DAT_CONT_UPLOAD_ITEMS')
          .values(rows)
          .execute();
      }

      await queryRunner.query('EXEC dbo.sp_cont_build_det_svr @SUC = @0, @CONT = @1', [sucToUse, contCode]);

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
        ['LISTO', values.length, file.originalname ?? null, user.username ?? String(user.sub), sucToUse, contCode],
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
    const { contCode, sucToUse, ctrl } = await this.resolveCtrl(cont, user, suc);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query('EXEC dbo.sp_cont_build_det_svr @SUC = @0, @CONT = @1', [sucToUse, contCode]);

      const ctrlRepo = queryRunner.manager.getRepository(DatContCtrlEntity);
      const refreshed = await ctrlRepo.findOne({ where: { CONT: contCode, SUC: sucToUse } });
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
    const contCode = cont?.trim();
    if (!contCode) throw new BadRequestException('CONT es obligatorio');

    const isAdmin = Number(user?.roleId ?? 0) === 1;
    const explicitSuc = (suc ?? '').trim();
    const userSuc = (user?.suc ?? '').trim();

    if (!isAdmin && explicitSuc && explicitSuc !== userSuc) {
      throw new BadRequestException('No puedes aplicar ajuste para otra sucursal');
    }

    const sucToUse = isAdmin && explicitSuc ? explicitSuc : userSuc;
    if (!sucToUse) throw new BadRequestException('SUC no disponible para el usuario');

    const ctrl = await this.ctrlRepo.findOne({ where: { CONT: contCode, SUC: sucToUse } });
    if (!ctrl) {
      throw new NotFoundException(`Conteo ${contCode} no existe para la sucursal ${sucToUse}`);
    }

    const estado = (ctrl.ESTA ?? '').trim().toUpperCase();
    if (estado === 'AJUSTADO' || estado === 'CERRADO_AJUSTADO') {
      throw new ConflictException('Conteo ya ajustado');
    }
    if (estado !== 'LISTO' && estado !== 'CERRADO') {
      throw new BadRequestException(`Conteo ${contCode} no está en estado LISTO/CERRADO`);
    }

    const username = (user?.username ?? '').trim() || String(user?.sub ?? '');

    try {
      const rows = await this.dataSource.query('EXEC dbo.sp_cont_apply_adjustment @SUC = @0, @CONT = @1, @USR = @2', [
        sucToUse,
        contCode,
        username,
      ]);
      const row = (rows?.[0] ?? {}) as Record<string, unknown>;

      return {
        suc: sucToUse,
        cont: contCode,
        docp701: this.pickString(row, ['DOCP701', 'DOC_P701', 'DOC701', 'DOCP_701']),
        docp702: this.pickString(row, ['DOCP702', 'DOC_P702', 'DOC702', 'DOCP_702']),
        movimientosInsertados: this.pickNumber(row, [
          'MOVIMIENTOSINSERTADOS',
          'MOVIMIENTOS_INSERTADOS',
          'MOV_INSERTADOS',
          'MOVS',
          'MOVIMIENTOS',
          'MOV_INS',
        ]),
      };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err ?? '');
      // eslint-disable-next-line no-console
      console.error('[conteos] applyAdjustment error:', errMessage);
      const normalized = errMessage.toUpperCase();
      if (normalized.includes('AJUST')) {
        throw new ConflictException('Conteo ya ajustado');
      }
      if (normalized.includes('ESTADO') || normalized.includes('LISTO') || normalized.includes('CERRADO')) {
        throw new BadRequestException('Conteo no está en estado LISTO/CERRADO');
      }
      throw new BadRequestException('No se pudo aplicar el ajuste');
    }
  }

  async listDetalles(cont: string, page: number, limit: number, user: JwtPayload, suc?: string) {
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
    const { contCode, sucToUse, ctrl } = await this.resolveCtrl(cont, user, suc);

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
      Number((row as any).totalRecords ?? (row as any).TOTALRECORDS ?? Object.values(row as Record<string, unknown>)[0] ?? 0) ||
      0;
    const sumDifCtop = Number((row as any).sumDifCtop ?? 0) || 0;
    const sumDifT = Number((row as any).sumDifT ?? 0) || 0;

    return { cont: contCode, suc: sucToUse, esta: ctrl.ESTA ?? null, totalRecords, sumDifCtop, sumDifT };
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

    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) {
      throw new BadRequestException('El archivo Excel no contiene hojas');
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

    const values: string[] = [];
    const headers = new Set<string>();

    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const normalized = key.trim().toUpperCase();
        if (normalized) headers.add(normalized);
      }
    }

    const hasExpected = headers.has(columnName);
    const hasAlternate = headers.has(alternateName);

    if (!hasExpected && hasAlternate) {
      throw new BadRequestException(
        `El conteo ${contCode} es tipo ${tipocont}, pero el archivo contiene columna ${alternateName}. ` +
          `Usa un archivo con columna ${columnName}.`,
      );
    }

    for (const row of rows) {
      const key = Object.keys(row).find((k) => k.trim().toUpperCase() === columnName);
      if (!key) continue;

      const raw = row[key];
      if (raw === undefined || raw === null) continue;

      const value = String(raw).trim();
      if (value) values.push(value);
    }

    if (!values.length) {
      throw new BadRequestException(`No se encontró la columna ${columnName} o no tenía datos`);
    }

    return Array.from(new Set(values));
  }

  private async resolveCtrl(cont: string, user: JwtPayload, suc?: string) {
    const contCode = cont?.trim();
    if (!contCode) throw new BadRequestException('CONT es obligatorio');

    const explicitSuc = suc?.trim();
    const userSuc = user?.suc?.trim();
    const isAdmin = Number(user?.roleId ?? 0) === 1;
    const isUniversal = userSuc?.toUpperCase() === '000';
    const allowAll = !explicitSuc && (isAdmin || isUniversal);
    const lookupSuc = allowAll ? undefined : (explicitSuc || userSuc);

    const where: any = { CONT: contCode };
    if (lookupSuc) where.SUC = lookupSuc;

    const ctrl = await this.ctrlRepo.findOne({ where });
    if (!ctrl) {
      if (allowAll) {
        throw new NotFoundException(`Conteo ${contCode} no existe`);
      }
      const label = lookupSuc ?? userSuc ?? 'desconocida';
      throw new NotFoundException(`Conteo ${contCode} no existe para la sucursal ${label}`);
    }

    // La sucursal válida debe provenir del registro de conteo (dato obligatorio)
    const sucFromCtrl = ctrl.SUC?.trim();
    const sucToUse = sucFromCtrl || lookupSuc || userSuc;
    if (!sucToUse) {
      throw new BadRequestException(`El conteo ${contCode} no tiene sucursal asignada`);
    }

    return { contCode, sucToUse, ctrl };
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
