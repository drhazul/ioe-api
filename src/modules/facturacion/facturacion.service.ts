import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryFailedError } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { FacturifyClient } from './facturify.client';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type ListarPendientesInput = {
  page?: number;
  pageSize?: number;
  suc?: string | null;
  estatus?: string | null;
  razonSocialReceptor?: string | null;
  rfcReceptor?: string | null;
  clien?: string | null;
  idFol?: string | null;
  tipoFact?: string | null;
};

type ListarReqfFoliosInput = {
  suc?: string | null;
  fcnm?: string | null;
  search?: string | null;
  page?: number | null;
};

const FACTURIFY_REGIMEN_DESC_FALLBACK: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '607': 'Régimen de Enajenación o Adquisición de Bienes',
  '608': 'Demás ingresos',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente en México',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza',
};

@Injectable()
export class FacturacionService {
  private static readonly FACTURACION_WRITE_MODULE_CODES = [
    'FACTURA',
    'FACTURACION',
    'PV_FACTURACION',
    'FACT_IOE',
  ] as const;

  private static readonly FACTURACION_READ_MODULE_CODES = [
    'FACTURA_VIEW',
    ...FacturacionService.FACTURACION_WRITE_MODULE_CODES,
  ] as const;

  private static readonly FACTURACION_REQF_MODULE_CODES = [
    'REG_SINREQF',
    ...FacturacionService.FACTURACION_WRITE_MODULE_CODES,
  ] as const;

  private facSvrShapColumnsCache: Set<string> | null = null;
  private factTicketShpColumnsCache: Set<string> | null = null;
  private factClientShpColumnsCache: Set<string> | null = null;
  private regimenByCodeCache: Map<string, string> | null = null;
  private facturacionReadAccessCache = new Map<number, boolean>();
  private facturacionWriteAccessCache = new Map<number, boolean>();
  private facturacionReqfAccessCache = new Map<number, boolean>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly facturify: FacturifyClient,
    private readonly config: ConfigService,
  ) {}

  private getStorageBasePathCandidates() {
    const env = String(
      this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '',
    )
      .trim()
      .toLowerCase();
    const primary = String(
      this.config.get<string>('CFDI_STORAGE_BASE_PATH') ?? '',
    ).trim();
    const dev = String(
      this.config.get<string>('CFDI_STORAGE_BASE_PATH_DEV') ?? '',
    ).trim();
    const prod = String(
      this.config.get<string>('CFDI_STORAGE_BASE_PATH_PROD') ?? '',
    ).trim();
    const alt = String(
      this.config.get<string>('CFDI_STORAGE_BASE_PATH_ALT') ?? '',
    ).trim();
    const listRaw = String(
      this.config.get<string>('CFDI_STORAGE_BASE_PATHS') ?? '',
    ).trim();

    const out: string[] = [];
    const push = (raw?: string) => {
      const value = String(raw ?? '').trim();
      if (!value) return;
      if (!out.includes(value)) out.push(value);
    };

    push(primary);
    if (env === 'development' || env === 'dev' || env === 'local') {
      push(dev);
      push(alt);
    } else {
      push(prod);
      push(alt);
    }

    for (const value of listRaw.split(/[;,]/g)) {
      push(value);
    }

    if (process.platform === 'win32') {
      push('\\\\192.168.10.234\\ArchivosUsuarios\\respaldoCFDI');
      push('C:\\ArchivosUsuarios\\respaldoCFDI');
    } else {
      push('/mnt/respaldoCFDI');
    }

    return out;
  }

  private getAutoEmailOnSuccess() {
    return (
      (this.config.get<string>('FACTURIFY_AUTO_EMAIL_ON_SUCCESS') || 'true')
        .toLowerCase()
        .trim() === 'true'
    );
  }

  private dayFolder() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private async getFacSvrShapColumns(): Promise<Set<string>> {
    if (this.facSvrShapColumnsCache) return this.facSvrShapColumnsCache;

    const tableRows = await this.dataSource.query(
      "SELECT CASE WHEN OBJECT_ID('dbo.FAC_SVR_SHAP','U') IS NULL THEN 0 ELSE 1 END AS HAS_TABLE",
    );
    const hasTable = Number((tableRows?.[0] ?? {}).HAS_TABLE ?? 0) === 1;
    if (!hasTable) {
      throw new NotFoundException('No existe tabla dbo.FAC_SVR_SHAP');
    }

    const colsRows = await this.dataSource.query(
      `SELECT UPPER(name) AS COL
       FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.FAC_SVR_SHAP')`,
    );
    const cols = new Set<string>(
      (colsRows ?? [])
        .map((row) =>
          String((row as Record<string, unknown>).COL ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter((col) => col.length > 0),
    );
    this.facSvrShapColumnsCache = cols;
    return cols;
  }

  private async getFactTicketShpColumns(): Promise<Set<string>> {
    if (this.factTicketShpColumnsCache) return this.factTicketShpColumnsCache;

    const tableRows = await this.dataSource.query(
      "SELECT CASE WHEN OBJECT_ID('dbo.FACT_TICKET_SHP','U') IS NULL THEN 0 ELSE 1 END AS HAS_TABLE",
    );
    const hasTable = Number((tableRows?.[0] ?? {}).HAS_TABLE ?? 0) === 1;
    if (!hasTable) {
      throw new NotFoundException('No existe tabla dbo.FACT_TICKET_SHP');
    }

    const colsRows = await this.dataSource.query(
      `SELECT UPPER(name) AS COL
       FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.FACT_TICKET_SHP')`,
    );

    const cols = new Set<string>(
      (colsRows ?? [])
        .map((row) =>
          String((row as Record<string, unknown>).COL ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter((col) => col.length > 0),
    );
    this.factTicketShpColumnsCache = cols;
    return cols;
  }

  private async getFactClientShpColumns(): Promise<Set<string>> {
    if (this.factClientShpColumnsCache) return this.factClientShpColumnsCache;

    const tableRows = await this.dataSource.query(
      "SELECT CASE WHEN OBJECT_ID('dbo.FACT_CLIENT_SHP','U') IS NULL THEN 0 ELSE 1 END AS HAS_TABLE",
    );
    const hasTable = Number((tableRows?.[0] ?? {}).HAS_TABLE ?? 0) === 1;
    if (!hasTable) {
      throw new NotFoundException('No existe tabla dbo.FACT_CLIENT_SHP');
    }

    const colsRows = await this.dataSource.query(
      `SELECT UPPER(name) AS COL
       FROM sys.columns
       WHERE object_id = OBJECT_ID('dbo.FACT_CLIENT_SHP')`,
    );

    const cols = new Set<string>(
      (colsRows ?? [])
        .map((row) =>
          String((row as Record<string, unknown>).COL ?? '')
            .trim()
            .toUpperCase(),
        )
        .filter((col) => col.length > 0),
    );
    this.factClientShpColumnsCache = cols;
    return cols;
  }

  private facColumnExpr(options: {
    alias: string;
    columns: Set<string>;
    primary: string;
    as?: string;
    fallbackColumns?: string[];
    defaultSql?: string;
  }) {
    const { alias, columns, primary, as } = options;
    const outAlias = as || primary;
    return `${this.facColumnRef({
      alias,
      columns,
      primary,
      fallbackColumns: options.fallbackColumns,
      defaultSql: options.defaultSql,
    })} AS ${outAlias}`;
  }

  private facColumnRef(options: {
    alias: string;
    columns: Set<string>;
    primary: string;
    fallbackColumns?: string[];
    defaultSql?: string;
  }) {
    const {
      alias,
      columns,
      primary,
      fallbackColumns = [],
      defaultSql = 'NULL',
    } = options;
    const candidates = [primary, ...fallbackColumns];
    for (const candidate of candidates) {
      if (columns.has(candidate.toUpperCase())) {
        return `${alias}.${candidate}`;
      }
    }
    return defaultSql;
  }

  private normalizeTextFilter(value?: string | null) {
    const text = String(value ?? '')
      .trim()
      .toUpperCase();
    return text.length ? text : null;
  }

  private normalizedSqlTextExpr(sqlExpr: string) {
    return `UPPER(LTRIM(RTRIM(ISNULL(CAST(${sqlExpr} AS NVARCHAR(4000)), ''))))`;
  }

  private async buildPendientesSelectSql() {
    return `SELECT f.*
            FROM FAC_SVR_SHAP f`;
  }

  private async buildHeaderSelectSql() {
    const columns = await this.getFacSvrShapColumns();
    const tipoFactExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'TIPOFACT',
      defaultSql: "CAST('INDIVIDUAL' AS NVARCHAR(40))",
    });
    const autExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'AUT',
      fallbackColumns: ['TIPOVTA'],
      defaultSql: 'CAST(NULL AS NVARCHAR(255))',
    });
    const reqfExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'REQF',
      fallbackColumns: ['RQFAC'],
      defaultSql: 'CAST(0 AS INT)',
    });
    const rfcEmisorExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'RfcEmisor',
      defaultSql: 'CAST(NULL AS NVARCHAR(40))',
    });
    const rfcReceptorExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'RfcReceptor',
      defaultSql: 'CAST(NULL AS NVARCHAR(40))',
    });
    const razonSocialExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'RazonSocialReceptor',
      defaultSql: 'CAST(NULL AS NVARCHAR(255))',
    });
    const usoCfdiExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'UsoCfdi',
      defaultSql: 'CAST(NULL AS NVARCHAR(20))',
    });
    const clienExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'CLIEN',
      fallbackColumns: ['CLIENTE'],
      defaultSql: 'CAST(NULL AS FLOAT)',
    });
    const metodoPagoExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'MetodoDePago',
      defaultSql: "CAST('PUE' AS NVARCHAR(20))",
    });
    const formaPagoExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'FormaPago',
      defaultSql: "CAST('99' AS NVARCHAR(20))",
    });
    const formaPagoSatExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'FormaPagoSAT',
      fallbackColumns: ['FormaPago'],
      defaultSql: "CAST('99' AS NVARCHAR(20))",
    });
    const exportacionExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'Exportacion',
      defaultSql: "CAST('01' AS NVARCHAR(5))",
    });

    return `SELECT TOP 1 f.IDFOL, f.SUC, f.ESTATUS, ${tipoFactExpr}, f.IMPT, ${autExpr}, ${reqfExpr}, ${clienExpr}, ${rfcEmisorExpr}, ${rfcReceptorExpr}, ${razonSocialExpr}, ${usoCfdiExpr}, ${metodoPagoExpr}, ${formaPagoExpr}, ${formaPagoSatExpr}, ${exportacionExpr}
            FROM FAC_SVR_SHAP f
            WHERE f.IDFOL=@0`;
  }
  private async saveCfdiArtifacts(input: {
    idFol: string;
    xmlBase64?: string | null;
    pdfBase64?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const attempts: string[] = [];
    const candidates = this.getStorageBasePathCandidates();

    for (const basePath of candidates) {
      const folder = join(basePath, this.dayFolder(), input.idFol);
      const paths: Record<string, string | null> = {
        folder,
        xml: null,
        pdf: null,
        metadata: null,
      };

      try {
        await mkdir(folder, { recursive: true });

        if (input.xmlBase64) {
          const xmlPath = join(folder, 'cfdi.xml');
          await writeFile(xmlPath, Buffer.from(input.xmlBase64, 'base64'));
          paths.xml = xmlPath;
        }

        if (input.pdfBase64) {
          const pdfPath = join(folder, 'cfdi.pdf');
          await writeFile(pdfPath, Buffer.from(input.pdfBase64, 'base64'));
          paths.pdf = pdfPath;
        }

        const metadataPath = join(folder, 'facturify-response.json');
        await writeFile(
          metadataPath,
          JSON.stringify(input.metadata ?? {}, null, 2),
          'utf8',
        );
        paths.metadata = metadataPath;

        return paths;
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : JSON.stringify(error ?? {}).slice(0, 180);
        attempts.push(`${basePath} -> ${detail}`);
      }
    }

    throw new InternalServerErrorException(
      `No se pudo guardar XML/PDF/metadata en ninguna ruta configurada. Intentos: ${attempts.join(' | ')}`,
    );
  }

  private async readFileBase64IfExists(pathValue: unknown) {
    const filePath = String(pathValue ?? '').trim();
    if (!filePath) return null;
    try {
      await access(filePath, fsConstants.F_OK);
      const bytes = await readFile(filePath);
      if (!bytes.length) return null;
      return bytes.toString('base64');
    } catch {
      return null;
    }
  }

  async obtenerArtefactos(idFolRaw: string, user?: JwtPayload | null) {
    const idFol = this.normalizeText(idFolRaw);
    if (!idFol) {
      throw new BadRequestException('IDFOL es requerido');
    }
    await this.assertFacturacionReadAccess(user, 'consultar artefactos CFDI');

    const columns = await this.getFacSvrShapColumns();
    const sucExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'SUC',
      defaultSql: "CAST('' AS NVARCHAR(40))",
    });
    const uuidExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'CFDI_UUID',
      defaultSql: 'CAST(NULL AS NVARCHAR(255))',
    });
    const xmlPathExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'CFDI_XML_PATH',
      defaultSql: 'CAST(NULL AS NVARCHAR(500))',
    });
    const pdfPathExpr = this.facColumnExpr({
      alias: 'f',
      columns,
      primary: 'CFDI_PDF_PATH',
      defaultSql: 'CAST(NULL AS NVARCHAR(500))',
    });

    const rows = await this.dataSource.query(
      `SELECT TOP 1
          f.IDFOL,
          ${sucExpr},
          ${uuidExpr},
          ${xmlPathExpr},
          ${pdfPathExpr}
       FROM FAC_SVR_SHAP f
       WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(f.IDFOL AS NVARCHAR(255)), ''))))=@0`,
      [this.normalizeUpper(idFol)],
    );
    if (!rows?.length) {
      throw new NotFoundException(`Folio ${idFol} no existe`);
    }

    const row = (rows[0] ?? {}) as Record<string, unknown>;
    const rowIdFol = this.normalizeText(row.IDFOL) || idFol;
    const rowSuc = this.normalizeUpper(row.SUC);
    const canWrite = await this.hasFacturacionWriteAccess(user);
    if (!canWrite) {
      const userSuc = this.normalizeUpper(user?.suc ?? '');
      if (!userSuc || userSuc === '000' || (rowSuc && rowSuc !== userSuc)) {
        throw new ForbiddenException(
          `No autorizado para consultar artefactos del folio ${rowIdFol}`,
        );
      }
    }

    const uuid = this.normalizeText(row.CFDI_UUID);
    let xmlPath = this.normalizeText(row.CFDI_XML_PATH) || null;
    let pdfPath = this.normalizeText(row.CFDI_PDF_PATH) || null;
    let xmlBase64 = await this.readFileBase64IfExists(xmlPath);
    let pdfBase64 = await this.readFileBase64IfExists(pdfPath);

    let downloadedPdf = false;
    let downloadedXml = false;
    const downloadErrors: string[] = [];

    if ((!pdfBase64 || !xmlBase64) && uuid) {
      this.facturify.assertCredentials();

      let fetchedPdfBase64 = pdfBase64;
      let fetchedXmlBase64 = xmlBase64;

      if (!fetchedPdfBase64) {
        const pdfRemote = await this.facturify.getInvoicePdf(uuid);
        const candidate = this.normalizeText(
          (pdfRemote as Record<string, unknown>).pdfBase64,
        );
        if (pdfRemote.ok && candidate) {
          fetchedPdfBase64 = candidate;
          downloadedPdf = true;
        } else if (!pdfRemote.ok) {
          const detail = this.normalizeText(
            (pdfRemote as Record<string, unknown>).data,
          );
          downloadErrors.push(
            detail || `No se pudo descargar PDF (status ${pdfRemote.status})`,
          );
        }
      }

      if (!fetchedXmlBase64) {
        const xmlRemote = await this.facturify.getInvoiceXml(uuid);
        const candidate = this.normalizeText(
          (xmlRemote as Record<string, unknown>).xmlBase64,
        );
        if (xmlRemote.ok && candidate) {
          fetchedXmlBase64 = candidate;
          downloadedXml = true;
        } else if (!xmlRemote.ok) {
          const detail = this.normalizeText(
            (xmlRemote as Record<string, unknown>).data,
          );
          downloadErrors.push(
            detail || `No se pudo descargar XML (status ${xmlRemote.status})`,
          );
        }
      }

      if (fetchedPdfBase64 || fetchedXmlBase64) {
        const storage = await this.saveCfdiArtifacts({
          idFol: rowIdFol,
          xmlBase64: fetchedXmlBase64 ?? null,
          pdfBase64: fetchedPdfBase64 ?? null,
          metadata: {
            source: 'facturify_artifact_fetch',
            idFol: rowIdFol,
            uuid,
            downloadedPdf,
            downloadedXml,
          },
        });

        if (storage.xml) xmlPath = storage.xml;
        if (storage.pdf) pdfPath = storage.pdf;
        xmlBase64 = fetchedXmlBase64;
        pdfBase64 = fetchedPdfBase64;

        const setSql: string[] = [];
        const params: unknown[] = [rowIdFol];
        const addParam = (value: unknown) => {
          params.push(value);
          return `@${params.length - 1}`;
        };

        if (columns.has('CFDI_XML_PATH') && xmlPath) {
          setSql.push(`CFDI_XML_PATH=${addParam(xmlPath)}`);
        }
        if (columns.has('CFDI_PDF_PATH') && pdfPath) {
          setSql.push(`CFDI_PDF_PATH=${addParam(pdfPath)}`);
        }

        if (setSql.length) {
          await this.dataSource.query(
            `UPDATE FAC_SVR_SHAP
               SET ${setSql.join(', ')}
             WHERE IDFOL=@0`,
            params,
          );
        }
      }
    }

    if (!pdfBase64 && !xmlBase64) {
      throw new NotFoundException(
        `No hay PDF/XML local para ${rowIdFol} y no fue posible descargarlo`,
      );
    }

    return {
      ok: true,
      idFol: rowIdFol,
      uuid: uuid || null,
      storage: {
        xml: xmlPath,
        pdf: pdfPath,
      },
      downloaded: {
        pdf: downloadedPdf,
        xml: downloadedXml,
      },
      downloadErrors,
      pdfBase64: pdfBase64 ?? null,
      xmlBase64: xmlBase64 ?? null,
    };
  }

  async listarPendientes(
    input: ListarPendientesInput = {},
    user?: JwtPayload | null,
  ) {
    await this.assertFacturacionReadAccess(user, 'consultar facturación');
    const columns = await this.getFacSvrShapColumns();
    const canWrite = await this.hasFacturacionWriteAccess(user);
    const forcedUserSuc = canWrite ? null : this.normalizeUpper(user?.suc ?? '');
    if (!canWrite && (!forcedUserSuc || forcedUserSuc === '000')) {
      return {
        data: [],
        total: 0,
        page: 1,
        pageSize: Math.min(Math.max(Number(input.pageSize ?? 20) || 20, 1), 200),
        totalPages: 0,
        hasPrevPage: false,
        hasNextPage: false,
      };
    }
    const selectSql = await this.buildPendientesSelectSql();
    const rawPage = Number(input.page ?? 1);
    const page =
      Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const rawPageSize = Number(input.pageSize ?? 20);
    const pageSize = Math.min(
      Math.max(Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : 20, 1),
      200,
    );
    const offset = (page - 1) * pageSize;

    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `@${params.length - 1}`;
    };

    const statusExpr = this.normalizedSqlTextExpr('f.ESTATUS');
    const sucExpr = this.normalizedSqlTextExpr('f.SUC');
    const razonSocialExpr = this.normalizedSqlTextExpr(
      this.facColumnRef({
        alias: 'f',
        columns,
        primary: 'RazonSocialReceptor',
        defaultSql: 'NULL',
      }),
    );
    const rfcReceptorExpr = this.normalizedSqlTextExpr(
      this.facColumnRef({
        alias: 'f',
        columns,
        primary: 'RfcReceptor',
        defaultSql: 'NULL',
      }),
    );
    const clienExpr = this.normalizedSqlTextExpr(
      this.facColumnRef({
        alias: 'f',
        columns,
        primary: 'CLIEN',
        defaultSql: 'NULL',
      }),
    );
    const idFolExpr = this.normalizedSqlTextExpr('f.IDFOL');
    const tipoFactExpr = this.normalizedSqlTextExpr(
      this.facColumnRef({
        alias: 'f',
        columns,
        primary: 'TIPOFACT',
        defaultSql: "CAST('INDIVIDUAL' AS NVARCHAR(40))",
      }),
    );

    const filterEstatus = this.normalizeTextFilter(input.estatus);
    const where: string[] = [];
    if (filterEstatus === 'FACTURADO') {
      where.push(`${statusExpr} = ${addParam('FACTURADO')}`);
    } else if (filterEstatus === 'FACTURADO Y CANCELACION PENDIENTE') {
      where.push(
        `${statusExpr} IN (${addParam('FACTURADO')}, ${addParam('CANCELACION PENDIENTE')})`,
      );
    } else if (filterEstatus && filterEstatus !== 'TODOS') {
      where.push(`${statusExpr} = ${addParam(filterEstatus)}`);
    } else {
      where.push(
        `${statusExpr} IN (${addParam('PENDIENTE')}, ${addParam('CANCELACION PENDIENTE')})`,
      );
    }

    const addContainsFilter = (sqlExpr: string, rawValue?: string | null) => {
      const value = this.normalizeTextFilter(rawValue);
      if (!value) return;
      where.push(`${sqlExpr} LIKE ${addParam(`%${value}%`)}`);
    };

    if (!canWrite && forcedUserSuc) {
      where.push(`${sucExpr} = ${addParam(forcedUserSuc)}`);
    } else {
      addContainsFilter(sucExpr, input.suc);
    }
    addContainsFilter(razonSocialExpr, input.razonSocialReceptor);
    addContainsFilter(rfcReceptorExpr, input.rfcReceptor);
    addContainsFilter(clienExpr, input.clien);
    addContainsFilter(idFolExpr, input.idFol);
    addContainsFilter(tipoFactExpr, input.tipoFact);

    const whereSql = where.length ? `WHERE ${where.join('\n  AND ')}` : '';
    const offsetParam = `@${params.length}`;
    const fetchParam = `@${params.length + 1}`;
    const orderDateExpr =
      filterEstatus === 'PENDIENTE'
        ? this.facColumnRef({
            alias: 'f',
            columns,
            primary: 'FCN',
            fallbackColumns: ['FCNF'],
            defaultSql: 'f.FCN',
          })
        : this.facColumnRef({
            alias: 'f',
            columns,
            primary: 'FCNF',
            fallbackColumns: ['FCN'],
            defaultSql: 'f.FCN',
          });

    const data = await this.dataSource.query(
      `${selectSql}
       ${whereSql}
       ORDER BY ${orderDateExpr} DESC, f.IDFOL DESC
       OFFSET ${offsetParam} ROWS
       FETCH NEXT ${fetchParam} ROWS ONLY`,
      [...params, offset, pageSize],
    );

    for (const row of data ?? []) {
      const imptValue = Number(
        (row as Record<string, unknown>).IMPT ??
          (row as Record<string, unknown>).impt ??
          0,
      );
      if (Number.isFinite(imptValue)) {
        const rounded = Number(imptValue.toFixed(2));
        (row as Record<string, unknown>).IMPT = rounded;
        (row as Record<string, unknown>).impt = rounded;
      }
    }

    const countRows = await this.dataSource.query(
      `SELECT COUNT(1) AS TOTAL
       FROM FAC_SVR_SHAP f
       ${whereSql}`,
      params,
    );
    const total = Number(countRows?.[0]?.TOTAL ?? countRows?.[0]?.total ?? 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    };
  }

  async listarFoliosReqf(
    input: ListarReqfFoliosInput = {},
    user?: JwtPayload | null,
  ) {
    await this.assertFacturacionReqfAccess(
      user,
      'consultar procesamiento de folios REQF',
    );
    const pageSize = 20;
    const requestedPage = Number(input.page ?? 1);
    const page =
      Number.isFinite(requestedPage) && requestedPage >= 1
        ? Math.trunc(requestedPage)
        : 1;
    const suc = this.normalizeTextFilter(input.suc);
    const fcnm = this.normalizeTextFilter(input.fcnm);
    const search = this.normalizeTextFilter(input.search);
    const isAdmin = this.isAdminUser(user);
    const allowedSucs = isAdmin
      ? []
      : await this.resolveFacturacionReqfAuthorizedSucs(user);
    const allowedSucsSet = new Set(allowedSucs);

    if (!fcnm && !search) {
      return {
        data: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 0,
        hasPrevPage: false,
        hasNextPage: false,
      };
    }

    if (!isAdmin && suc && !allowedSucsSet.has(suc)) {
      throw new ForbiddenException(
        `Sucursal ${suc} no autorizada para el módulo REG_SINREQF`,
      );
    }

    await this.ensureStoredProcedure(
      'dbo.sp_fact_reg_sinreqf_list',
      'sql/2026-03-16_sp_fact_reg_sinreqf_list.sql',
    );

    const rows = await this.dataSource.query(
      `${this.sqlServerStrictSetOptionsPrefix()}
      EXEC dbo.sp_fact_reg_sinreqf_list
        @SUC = @0,
        @FCNM = @1,
        @SEARCH = @2`,
      [suc || null, fcnm, search],
    );

    const allRows = (rows ?? []) as Record<string, unknown>[];
    let scopedRows = allRows;
    if (!isAdmin) {
      scopedRows = scopedRows.filter((row) => {
        const rowSuc = this.normalizeUpper(this.readRowValue(row, 'SUC'));
        return rowSuc.length > 0 && allowedSucsSet.has(rowSuc);
      });
    }
    if (suc) {
      scopedRows = scopedRows.filter((row) => {
        const rowSuc = this.normalizeUpper(this.readRowValue(row, 'SUC'));
        return rowSuc === suc;
      });
    }

    const total = scopedRows.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const normalizedPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
    const offset = (normalizedPage - 1) * pageSize;
    const data = scopedRows.slice(offset, offset + pageSize);

    for (const row of data) {
      const imptValue = Number(
        (row as Record<string, unknown>).IMPT ??
          (row as Record<string, unknown>).impt ??
          0,
      );
      if (Number.isFinite(imptValue)) {
        const rounded = Number(imptValue.toFixed(2));
        (row as Record<string, unknown>).IMPT = rounded;
        (row as Record<string, unknown>).impt = rounded;
      }
    }

    return {
      data,
      total,
      page: normalizedPage,
      pageSize,
      totalPages,
      hasPrevPage: normalizedPage > 1,
      hasNextPage: normalizedPage < totalPages,
    };
  }

  async marcarFolioReqf(idFolRaw: string, user?: JwtPayload | null) {
    await this.assertFacturacionReqfAccess(
      user,
      'marcar REQF en procesamiento de folios',
    );

    const idFol = this.normalizeUpper(idFolRaw);
    if (!idFol) {
      throw new BadRequestException('IDFOL es requerido');
    }

    const isAdmin = this.isAdminUser(user);
    const allowedSucs = isAdmin
      ? []
      : await this.resolveFacturacionReqfAuthorizedSucs(user);
    const allowedSucsSet = new Set(allowedSucs);

    await this.ensureStoredProcedure(
      'dbo.sp_fact_sync_folio_vf',
      'sql/sp_fact_sync_folio_vf_create.sql',
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const reqfColRows = await manager.query(
          `SELECT CASE
              WHEN COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'REQF') IS NOT NULL THEN 'REQF'
              WHEN COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'RQFAC') IS NOT NULL THEN 'RQFAC'
              ELSE ''
            END AS REQF_COL`,
        );
        const reqfCol = this.normalizeUpper(
          (reqfColRows?.[0] as Record<string, unknown> | undefined)?.REQF_COL,
        );
        if (!reqfCol) {
          throw new ConflictException(
            'No existe columna REQF/RQFAC en dbo.PV_CTR_FOL_ASVR',
          );
        }

        const hasIdFolInicialRows = await manager.query(
          "SELECT CASE WHEN COL_LENGTH('dbo.PV_CTR_FOL_ASVR', 'IDFOLINICIAL') IS NOT NULL THEN 1 ELSE 0 END AS HAS_COL",
        );
        const hasIdFolInicial =
          (this.toIntValue(
            (hasIdFolInicialRows?.[0] as Record<string, unknown> | undefined)
              ?.HAS_COL,
          ) ?? 0) === 1;
        const idFolInicialFilter = hasIdFolInicial
          ? `OR UPPER(LTRIM(RTRIM(ISNULL(CAST(IDFOLINICIAL AS NVARCHAR(255)), '')))) = @0`
          : '';

        const folioRows = await manager.query(
          `
          SELECT TOP 1
            LTRIM(RTRIM(ISNULL(CAST(IDFOL AS NVARCHAR(255)), ''))) AS IDFOL,
            UPPER(LTRIM(RTRIM(ISNULL(CAST(SUC AS NVARCHAR(20)), '')))) AS SUC,
            UPPER(LTRIM(RTRIM(ISNULL(CAST(AUT AS NVARCHAR(20)), '')))) AS AUT,
            UPPER(LTRIM(RTRIM(ISNULL(CAST(ESTA AS NVARCHAR(30)), '')))) AS ESTA,
            TRY_CONVERT(INT, [${reqfCol}]) AS REQF
          FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
          WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(IDFOL AS NVARCHAR(255)), '')))) = @0
            ${idFolInicialFilter}
          ORDER BY
            CASE
              WHEN UPPER(LTRIM(RTRIM(ISNULL(CAST(IDFOL AS NVARCHAR(255)), '')))) = @0
                THEN 0
              ELSE 1
            END,
            TRY_CONVERT(DATETIME, FCNM) DESC,
            TRY_CONVERT(DATETIME, FCN) DESC`,
          [idFol],
        );

        const folio = (folioRows?.[0] ?? null) as Record<string, unknown> | null;
        if (!folio) {
          throw new NotFoundException(`No existe folio ${idFol}`);
        }

        const resolvedIdFol = this.normalizeUpper(this.readRowValue(folio, 'IDFOL'));
        const folioSuc = this.normalizeUpper(this.readRowValue(folio, 'SUC'));
        const aut = this.normalizeUpper(this.readRowValue(folio, 'AUT'));
        const esta = this.normalizeUpper(this.readRowValue(folio, 'ESTA'));

        if (!resolvedIdFol) {
          throw new NotFoundException(`No se pudo resolver IDFOL para ${idFol}`);
        }

        if (!isAdmin) {
          if (!folioSuc || !allowedSucsSet.has(folioSuc)) {
            throw new ForbiddenException(
              `Sucursal ${folioSuc || '(sin sucursal)'} no autorizada para REG_SINREQF`,
            );
          }
        }

        if (aut !== 'VF' || esta !== 'MB51PROCES') {
          throw new BadRequestException(
            'Solo se permite marcar REQF para folios con AUT=VF y ESTA=MB51PROCES',
          );
        }

        await manager.query(
          `UPDATE dbo.PV_CTR_FOL_ASVR
           SET [${reqfCol}] = 1
           WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(IDFOL AS NVARCHAR(255)), '')))) = @0`,
          [resolvedIdFol],
        );

        const syncRows = await manager.query(
          `${this.sqlServerStrictSetOptionsPrefix()}
          EXEC dbo.sp_fact_sync_folio_vf
            @IDFOL = @0,
            @EVENTO = @1,
            @FORCE = @2`,
          [resolvedIdFol, 'REG_SINREQF_MARK', 0],
        );

        const syncRow = (syncRows?.[0] ?? {}) as Record<string, unknown>;
        const syncApplied =
          this.toBoolValue(this.readRowValue(syncRow, 'SYNC_APPLIED')) ?? false;

        return {
          ok: true,
          idFol: resolvedIdFol,
          reqf: 1,
          syncApplied,
          message: syncApplied
            ? 'REQF marcado y sincronizado en facturación'
            : 'REQF marcado',
        };
      });
    } catch (error) {
      throw this.mapUnificacionError(
        error,
        `No se pudo marcar REQF para ${idFol}`,
      );
    }
  }

  async previewUnificacion(idFols: string[], user?: JwtPayload | null) {
    await this.assertFacturacionWriteAccess(user, 'previsualizar unificación');
    const uniqueIdFols = this.uniqueIdFols(idFols);
    if (uniqueIdFols.length < 2) {
      throw new BadRequestException(
        'Se requieren al menos 2 tickets para unificación',
      );
    }

    // Regla FACTURA: para usuarios con permiso de gestión no se fuerza
    // sucursal por JWT en unificación (admin y no-admin con rol FACTURA).
    const userSuc: string | null = null;

    try {
      await this.ensureStoredProcedure(
        'dbo.sp_fact_unificacion_preview',
        'sql/sp_fact_unificacion_preview.sql',
      );
      const rows = await this.dataSource.query(
        `${this.sqlServerStrictSetOptionsPrefix()}
        EXEC dbo.sp_fact_unificacion_preview
          @IDFOLS_JSON = @0,
          @SUC = @1`,
        [JSON.stringify(uniqueIdFols), userSuc],
      );

      const row = (rows?.[0] ?? {}) as Record<string, unknown>;
      const bloqueos = this.parseStringArray(
        this.readRowValue(row, 'BLOQUEOS_JSON'),
      );
      const idFolsOut = this.parseStringArray(
        this.readRowValue(row, 'IDFOLS_JSON'),
      );

      return {
        ok: true,
        valid: this.toBoolValue(this.readRowValue(row, 'VALIDO')),
        message:
          this.normalizeText(this.readRowValue(row, 'MENSAJE')) ||
          'Validación de unificación procesada',
        cantidad: this.toIntValue(this.readRowValue(row, 'CANTIDAD')) ?? 0,
        total: this.round2(this.toNumberValue(this.readRowValue(row, 'TOTAL')) ?? 0),
        clien: this.normalizeText(this.readRowValue(row, 'CLIEN')),
        formaPago: this.normalizeText(this.readRowValue(row, 'FORMAPAGO')),
        tipoVta: this.normalizeText(this.readRowValue(row, 'TIPOVTA')),
        usoCfdi: this.normalizeText(this.readRowValue(row, 'USOCFDI')),
        rfcEmisor: this.normalizeText(this.readRowValue(row, 'RFCEMISOR')),
        metodoDePago: this.normalizeText(
          this.readRowValue(row, 'METODODEPAGO'),
        ),
        rfcReceptor: this.normalizeText(this.readRowValue(row, 'RFCRECEPTOR')),
        razonSocialReceptor: this.normalizeText(
          this.readRowValue(row, 'RAZONSOCIALRECEPTOR'),
        ),
        tipoFact: this.normalizeText(this.readRowValue(row, 'TIPOFACT')),
        suc: this.normalizeText(this.readRowValue(row, 'SUC')),
        reqf: this.toIntValue(this.readRowValue(row, 'REQF')) ?? 0,
        bloqueos,
        idFols: idFolsOut.length ? idFolsOut : uniqueIdFols,
      };
    } catch (error) {
      throw this.mapUnificacionError(
        error,
        'No se pudo ejecutar preview de unificación',
      );
    }
  }

  async crearUnificacion(input: {
    idFols: string[];
    comentario?: string;
    user?: JwtPayload | null;
  }) {
    await this.assertFacturacionWriteAccess(input.user, 'crear unificación');
    const uniqueIdFols = this.uniqueIdFols(input.idFols);
    if (uniqueIdFols.length < 2) {
      throw new BadRequestException(
        'Se requieren al menos 2 tickets para unificación',
      );
    }

    // Regla FACTURA: para usuarios con permiso de gestión no se fuerza
    // sucursal por JWT en unificación (admin y no-admin con rol FACTURA).
    const userSuc: string | null = null;
    const comentario = this.normalizeText(input.comentario);
    const usuario = this.normalizeText(input.user?.username ?? '');

    try {
      await this.ensureStoredProcedure(
        'dbo.sp_fact_unificacion_create',
        'sql/sp_fact_unificacion_create.sql',
      );
      const rows = await this.dataSource.query(
        `${this.sqlServerStrictSetOptionsPrefix()}
        EXEC dbo.sp_fact_unificacion_create
          @IDFOLS_JSON = @0,
          @USUARIO = @1,
          @COMENTARIO = @2,
          @SUC = @3`,
        [
          JSON.stringify(uniqueIdFols),
          usuario || null,
          comentario || null,
          userSuc,
        ],
      );

      const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
      if (!row) {
        throw new ConflictException(
          'La unificación no devolvió resultado del SP',
        );
      }

      const ticketsOrigen = this.parseStringArray(
        this.readRowValue(row, 'TICKETS_ORIGEN_JSON'),
      );

      return {
        ok: true,
        grupoId: this.normalizeText(this.readRowValue(row, 'GRUPO_ID')),
        idFolUnificado: this.normalizeText(
          this.readRowValue(row, 'IDFOL_UNIFICADO'),
        ),
        total: this.round2(this.toNumberValue(this.readRowValue(row, 'TOTAL')) ?? 0),
        ticketsOrigen:
          ticketsOrigen.length > 0 ? ticketsOrigen : uniqueIdFols,
        ticketsOrigenCount:
          this.toIntValue(this.readRowValue(row, 'TICKETS_ORIGEN')) ??
          uniqueIdFols.length,
        estatusFinal:
          this.normalizeText(this.readRowValue(row, 'ESTATUS_FINAL')) ||
          'UNIFICADO',
      };
    } catch (error) {
      throw this.mapUnificacionError(
        error,
        'No se pudo ejecutar la unificación',
      );
    }
  }

  async reversarUnificacion(input: {
    grupoId: string;
    motivo: string;
    user?: JwtPayload | null;
  }) {
    await this.assertFacturacionWriteAccess(input.user, 'reversar unificación');
    const grupoId = this.normalizeUpper(input.grupoId);
    const motivo = this.normalizeText(input.motivo);
    if (!grupoId) {
      throw new BadRequestException('GRUPMAS es requerido');
    }
    if (!motivo) {
      throw new BadRequestException('El motivo de reversa es obligatorio');
    }

    const usuario = this.normalizeText(input.user?.username ?? '');

    try {
      await this.ensureStoredProcedure(
        'dbo.sp_fact_unificacion_reverse',
        'sql/sp_fact_unificacion_reverse.sql',
      );
      const rows = await this.dataSource.query(
        `${this.sqlServerStrictSetOptionsPrefix()}
        EXEC dbo.sp_fact_unificacion_reverse
          @GRUPMAS = @0,
          @MOTIVO = @1,
          @USUARIO = @2`,
        [grupoId, motivo, usuario || null],
      );

      const row = (rows?.[0] ?? null) as Record<string, unknown> | null;
      if (!row) {
        throw new ConflictException('La reversa no devolvió resultado del SP');
      }

      const ticketsRestaurados = this.parseStringArray(
        this.readRowValue(row, 'TICKETS_RESTAURADOS_JSON'),
      );

      return {
        ok: true,
        grupoId: this.normalizeText(this.readRowValue(row, 'GRUPO_ID')),
        folioUnificado: this.normalizeText(
          this.readRowValue(row, 'FOLIO_UNIFICADO'),
        ),
        ticketsRestaurados,
        ticketsRestauradosCount:
          this.toIntValue(this.readRowValue(row, 'TICKETS_RESTAURADOS')) ??
          ticketsRestaurados.length,
        estatusFinal:
          this.normalizeText(this.readRowValue(row, 'ESTATUS_FINAL')) ||
          'ANULADO',
      };
    } catch (error) {
      throw this.mapUnificacionError(
        error,
        'No se pudo ejecutar la reversa de unificación',
      );
    }
  }

  async detalleUnificacion(grupoIdRaw: string, user?: JwtPayload | null) {
    const grupoId = this.normalizeUpper(grupoIdRaw);
    if (!grupoId) {
      throw new BadRequestException('GRUPMAS es requerido');
    }
    await this.assertFacturacionReadAccess(
      user,
      'consultar detalle de unificación',
    );

    try {
      const controlRows = await this.dataSource.query(
        `SELECT TOP 1 GRUPMAS, FCNCREA, NFAC, ESTATUS
         FROM dbo.FAC_CTRL_GRUP_MASV
         WHERE UPPER(LTRIM(RTRIM(ISNULL(GRUPMAS, '')))) = @0`,
        [grupoId],
      );
      if (!controlRows?.length) {
        throw new NotFoundException(`No existe el grupo ${grupoId}`);
      }

      const columns = await this.getFacSvrShapColumns();
      const grupExpr = this.facColumnRef({
        alias: 'f',
        columns,
        primary: 'GRUPMASI',
        defaultSql: "CAST('' AS NVARCHAR(255))",
      });
      const sucExpr = this.facColumnRef({
        alias: 'f',
        columns,
        primary: 'SUC',
        defaultSql: "CAST('' AS NVARCHAR(40))",
      });

      const whereByGroup = columns.has('GRUPMASI')
        ? ` OR UPPER(LTRIM(RTRIM(ISNULL(CAST(${grupExpr} AS NVARCHAR(255)), '')))) = @0`
        : '';

      const folioRows = await this.dataSource.query(
        `SELECT
            f.*,
            UPPER(LTRIM(RTRIM(ISNULL(CAST(f.IDFOL AS NVARCHAR(255)), '')))) AS __IDFOL_NORM,
            UPPER(LTRIM(RTRIM(ISNULL(CAST(${grupExpr} AS NVARCHAR(255)), '')))) AS __GRUPMASI_NORM,
            UPPER(LTRIM(RTRIM(ISNULL(CAST(${sucExpr} AS NVARCHAR(40)), '')))) AS __SUC_NORM
         FROM dbo.FAC_SVR_SHAP f
         WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(f.IDFOL AS NVARCHAR(255)), '')))) = @0${whereByGroup}
         ORDER BY CASE
             WHEN UPPER(LTRIM(RTRIM(ISNULL(CAST(f.IDFOL AS NVARCHAR(255)), '')))) = @0 THEN 0
             ELSE 1
           END, f.IDFOL`,
        [grupoId],
      );

      const canWrite = await this.hasFacturacionWriteAccess(user);
      const userSuc = canWrite ? null : this.currentUserSuc(user);
      if (userSuc) {
        const outsideUserSuc = (folioRows ?? []).some((row: any) => {
          const suc = this.normalizeUpper(row?.__SUC_NORM);
          return suc.length > 0 && suc !== userSuc;
        });
        if (outsideUserSuc) {
          throw new ForbiddenException(
            `No autorizado para consultar el grupo ${grupoId}`,
          );
        }
      }

      const unificado = (folioRows ?? []).find(
        (row: any) => this.normalizeUpper(row?.__IDFOL_NORM) === grupoId,
      );
      const origenes = (folioRows ?? []).filter(
        (row: any) =>
          this.normalizeUpper(row?.__IDFOL_NORM) !== grupoId &&
          this.normalizeUpper(row?.__GRUPMASI_NORM) === grupoId,
      );

      return {
        ok: true,
        grupoId,
        control: controlRows[0],
        folioUnificado: unificado ?? null,
        ticketsOrigen: origenes,
        ticketsOrigenCount: origenes.length,
      };
    } catch (error) {
      throw this.mapUnificacionError(
        error,
        'No se pudo consultar el detalle de unificación',
      );
    }
  }

  private currentUserSuc(user?: JwtPayload | null) {
    if (this.isAdminUser(user)) return null;
    const suc = this.normalizeUpper(user?.suc ?? '');
    if (!suc || suc === '000') return null;
    return suc;
  }

  private normalizeDistinctText(values: unknown[]) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values ?? []) {
      const normalized = this.normalizeUpper(value);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  private async resolveFacturacionReqfAuthorizedSucs(user?: JwtPayload | null) {
    if (this.isAdminUser(user)) return [] as string[];

    const username = this.normalizeUpper(user?.username ?? '');
    if (!username) {
      throw new ForbiddenException('Usuario sin username');
    }

    const safeCodes = FacturacionService.FACTURACION_REQF_MODULE_CODES
      .map((code) => code.replace(/'/g, "''"))
      .map((code) => `'${code}'`)
      .join(', ');

    const rows = await this.dataSource.query(
      `SELECT DISTINCT UPPER(LTRIM(RTRIM(ISNULL(CAST(ums.SUC AS NVARCHAR(20)), '')))) AS SUC
       FROM dbo.USR_MOD_SUC ums
       WHERE UPPER(LTRIM(RTRIM(ISNULL(ums.USUARIO, '')))) = @0
         AND ISNULL(ums.ACTIVO, 1) = 1
         AND UPPER(LTRIM(RTRIM(ISNULL(ums.MODULO, '')))) IN (${safeCodes})`,
      [username],
    );

    const sucs = this.normalizeDistinctText(
      (rows ?? []).map((row: Record<string, unknown>) =>
        this.readRowValue(row, 'SUC'),
      ),
    );
    if (sucs.length) return sucs;

    // Compatibilidad legacy: si no hay filas en USR_MOD_SUC, usar SUC del JWT.
    const fallbackSuc = this.currentUserSuc(user);
    if (fallbackSuc) return [fallbackSuc];

    throw new ForbiddenException(
      'Usuario sin sucursales autorizadas para el módulo REG_SINREQF',
    );
  }

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

  private isAdminUser(user?: JwtPayload | null) {
    const username = this.normalizeUpper(user?.username ?? '');
    if (username === 'ADMIN') return true;

    const roleId = Number(user?.roleId ?? 0);
    const nivel = Number(user?.nivel ?? 0);

    const adminRoleIds = this.parseIds(
      this.config.get<string>('ADMIN_ROLE_IDS'),
      this.config.get<string>('ADMIN_ROLE_ID'),
      process.env.ADMIN_ROLE_IDS,
      process.env.ADMIN_ROLE_ID,
    );
    const adminNiveles = this.parseIds(
      this.config.get<string>('ADMIN_NIVELES'),
      this.config.get<string>('ADMIN_NIVEL'),
      process.env.ADMIN_NIVELES,
      process.env.ADMIN_NIVEL,
    );

    const roleAllowed = (adminRoleIds.length ? adminRoleIds : [1]).includes(
      roleId,
    );
    const nivelAllowed =
      adminNiveles.length > 0 && adminNiveles.includes(nivel);

    return roleAllowed || nivelAllowed;
  }

  private async hasFrontModuleAccessByRole(
    user: JwtPayload | null | undefined,
    moduleCodes: readonly string[],
    cache: Map<number, boolean>,
  ) {
    if (this.isAdminUser(user)) return true;
    const roleId = Number(user?.roleId ?? 0);
    if (!Number.isFinite(roleId) || roleId <= 0) return false;

    const cached = cache.get(roleId);
    if (cached !== undefined) return cached;

    const safeCodes = moduleCodes
      .map((code) => code.replace(/'/g, "''"))
      .map((code) => `'${code}'`)
      .join(', ');

    try {
      const rows = await this.dataSource.query(
        `SELECT TOP 1 1 AS ALLOW_ACCESS
         FROM dbo.ROL_GRUPMOD_FRONT rgf
         WHERE rgf.IDROL=@0
           AND ISNULL(rgf.ACTIVO, 1)=1
           AND rgf.IDGRUPMOD_FRONT=0
         UNION ALL
         SELECT TOP 1 1 AS ALLOW_ACCESS
         FROM dbo.ROL_GRUPMOD_FRONT rgf
         INNER JOIN dbo.GRUPMOD_FRONT_MOD gfm
           ON gfm.IDGRUPMOD_FRONT = rgf.IDGRUPMOD_FRONT
         INNER JOIN dbo.MOD_FRONT mf
           ON mf.IDMOD_FRONT = gfm.IDMOD_FRONT
         WHERE rgf.IDROL=@0
           AND ISNULL(rgf.ACTIVO, 1)=1
           AND ISNULL(mf.ACTIVO, 1)=1
           AND UPPER(LTRIM(RTRIM(ISNULL(mf.CODIGO, '')))) IN (${safeCodes})`,
        [roleId],
      );
      const allow = (rows?.length ?? 0) > 0;
      cache.set(roleId, allow);
      return allow;
    } catch {
      cache.set(roleId, false);
      return false;
    }
  }

  private async hasFacturacionReadAccess(user?: JwtPayload | null) {
    return this.hasFrontModuleAccessByRole(
      user,
      FacturacionService.FACTURACION_READ_MODULE_CODES,
      this.facturacionReadAccessCache,
    );
  }

  private async hasFacturacionWriteAccess(user?: JwtPayload | null) {
    return this.hasFrontModuleAccessByRole(
      user,
      FacturacionService.FACTURACION_WRITE_MODULE_CODES,
      this.facturacionWriteAccessCache,
    );
  }

  private async hasFacturacionReqfAccess(user?: JwtPayload | null) {
    return this.hasFrontModuleAccessByRole(
      user,
      FacturacionService.FACTURACION_REQF_MODULE_CODES,
      this.facturacionReqfAccessCache,
    );
  }

  private async assertFacturacionReadAccess(
    user?: JwtPayload | null,
    action = 'consultar facturación',
  ) {
    if (!user) return;
    const allowed = await this.hasFacturacionReadAccess(user);
    if (allowed) return;
    throw new ForbiddenException(`Sin permisos para ${action}.`);
  }

  private async assertFacturacionWriteAccess(
    user?: JwtPayload | null,
    action = 'operación de facturación',
  ) {
    if (!user) return;
    const allowed = await this.hasFacturacionWriteAccess(user);
    if (allowed) return;
    throw new ForbiddenException(
      `Sin permisos para ${action}. Usuario en modo consulta.`,
    );
  }

  private async assertFacturacionReqfAccess(
    user?: JwtPayload | null,
    action = 'consultar folios REQF',
  ) {
    if (!user) return;
    const allowed = await this.hasFacturacionReqfAccess(user);
    if (allowed) return;
    throw new ForbiddenException(`Sin permisos para ${action}.`);
  }

  private uniqueIdFols(idFols: string[]) {
    const out: string[] = [];
    for (const id of idFols ?? []) {
      const value = this.normalizeUpper(id);
      if (!value) continue;
      if (!out.includes(value)) out.push(value);
    }
    return out;
  }

  private parseStringArray(raw: unknown): string[] {
    const fromArray = (items: unknown[]) =>
      items
        .map((item) => {
          if (typeof item === 'string') return this.normalizeText(item);
          if (item && typeof item === 'object') {
            const row = item as Record<string, unknown>;
            return (
              this.normalizeText(row.message) ||
              this.normalizeText(row.msg) ||
              this.normalizeText(row.value) ||
              this.normalizeText(row.text)
            );
          }
          return this.normalizeText(item);
        })
        .filter((item) => item.length > 0);

    if (Array.isArray(raw)) {
      return fromArray(raw);
    }

    const text = this.normalizeText(raw);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return fromArray(parsed);
      }
    } catch {
      // ignore parse errors and fallback to a single-item list
    }
    return [text];
  }

  private readRowValue(row: Record<string, unknown>, key: string) {
    const target = key.toUpperCase();
    for (const [rawKey, value] of Object.entries(row)) {
      if (rawKey.toUpperCase() === target) {
        return value;
      }
    }
    return undefined;
  }

  private toNumberValue(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toIntValue(value: unknown) {
    const parsed = this.toNumberValue(value);
    if (parsed == null) return null;
    return Math.trunc(parsed);
  }

  private toBoolValue(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = this.normalizeUpper(value);
    return text === '1' || text === 'TRUE' || text === 'SI' || text === 'YES';
  }

  private normalizeText(value: unknown) {
    return String(value ?? '').trim();
  }

  private normalizeUpper(value: unknown) {
    return this.normalizeText(value).toUpperCase();
  }

  private round2(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private sqlServerStrictSetOptionsPrefix() {
    return `SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;`;
  }

  private async ensureStoredProcedure(name: string, scriptPath: string) {
    const rows = await this.dataSource.query(
      `SELECT CASE WHEN OBJECT_ID(@0, 'P') IS NULL THEN 0 ELSE 1 END AS HAS_SP`,
      [name],
    );
    const exists = (this.toIntValue(rows?.[0]?.HAS_SP) ?? 0) === 1;
    if (!exists) {
      throw new ConflictException(
        `No existe ${name}. Ejecute ${scriptPath}`,
      );
    }
  }

  private mapUnificacionError(error: unknown, fallbackMessage: string) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      return error;
    }

    if (error instanceof QueryFailedError) {
      const message = this.extractSqlMessage(error);
      if (message) {
        if (message.toUpperCase().includes('NO EXISTE DBO.SP_FACT_UNIFICACION')) {
          return new ConflictException(message);
        }
        return new BadRequestException(message);
      }
      return new BadRequestException(fallbackMessage);
    }

    if (error instanceof Error) {
      return new InternalServerErrorException(
        `${fallbackMessage}: ${error.message}`,
      );
    }

    return new InternalServerErrorException(fallbackMessage);
  }

  private extractSqlMessage(error: QueryFailedError) {
    const errAny = error as any;
    const driver = errAny?.driverError ?? errAny?.originalError ?? null;
    const driverMessage = this.normalizeText(driver?.message ?? '');
    const baseMessage = this.normalizeText(errAny?.message ?? '');
    const raw = driverMessage || baseMessage;
    if (!raw) return '';

    return raw
      .replace(/^QueryFailedError:\s*/i, '')
      .replace(/^RequestError:\s*/i, '')
      .replace(/\s+\bat line \d+\b/i, '')
      .trim();
  }

  private async getFolioData(idFol: string) {
    const headerSql = await this.buildHeaderSelectSql();
    const cab = await this.dataSource.query(
      headerSql,
      [idFol],
    );
    if (!cab.length) {
      throw new NotFoundException(`Folio ${idFol} no existe en FAC_SVR_SHAP`);
    }

    const detailColumns = await this.getFactTicketShpColumns();
    const upcExpr = detailColumns.has('UPC')
      ? 't.UPC'
      : detailColumns.has('NOIDENTIFICACION')
        ? 't.NoIdentificacion'
        : 'CAST(NULL AS NVARCHAR(255))';

    const detailSelectSql = `SELECT
        t.IDD,
        t.IDFOL,
        ${upcExpr} AS UPC,
        t.ClaveProdServ,
        t.NoIdentificacion,
        t.Descripcion,
        t.Cantidad,
        t.ValorUnitario,
        t.PVTAT,
        CAST(ISNULL(t.PVTAT, 0) * 0.16 AS DECIMAL(18, 2)) AS Impuesto,
        CAST(ISNULL(t.PVTAT, 0) + (ISNULL(t.PVTAT, 0) * 0.16) AS DECIMAL(18, 2)) AS Total,
        t.Unidad,
        t.ObjetoImp,
        t.IvaTasa,
        t.Descuento
     FROM FACT_TICKET_SHP t`;

    let det = await this.dataSource.query(
      `${detailSelectSql}
       WHERE t.IDFOL=@0`,
      [idFol],
    );

    // Compatibilidad legado: unificaciones antiguas dejaron detalle con
    // IDFOL original y FACUNI = folio/grupo unificado.
    if (!det.length && detailColumns.has('FACUNI')) {
      det = await this.dataSource.query(
        `${detailSelectSql}
         WHERE UPPER(LTRIM(RTRIM(ISNULL(CAST(t.FACUNI AS NVARCHAR(255)), '')))) = UPPER(@0)`,
        [idFol],
      );
    }

    const suc = await this.dataSource.query(
      `SELECT TOP 1 SUC, [DESC] AS NOMBRE_SUC, RFC FROM DAT_SUC WHERE SUC=@0`,
      [cab[0].SUC ?? ''],
    );

    const clientColumns = await this.getFactClientShpColumns();
    const clienteIdRef = this.facColumnRef({
      alias: 'c',
      columns: clientColumns,
      primary: 'IDC',
      defaultSql: 'NULL',
    });
    const clienteRfcReceptorRef = this.facColumnRef({
      alias: 'c',
      columns: clientColumns,
      primary: 'RFCRECEPTOR',
      fallbackColumns: ['RfcReceptor'],
      defaultSql: 'NULL',
    });
    const clienteFcnRef = this.facColumnRef({
      alias: 'c',
      columns: clientColumns,
      primary: 'FCNR',
      defaultSql: 'NULL',
    });
    const clienteClienUniRef = this.facColumnRef({
      alias: 'c',
      columns: clientColumns,
      primary: 'CLIEN_UNI',
      defaultSql: 'NULL',
    });
    const clienteSucRef = this.facColumnRef({
      alias: 'c',
      columns: clientColumns,
      primary: 'SUC',
      defaultSql: 'NULL',
    });
    const clienteSelectSql = `SELECT TOP 1
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'IDC',
            defaultSql: 'CAST(NULL AS FLOAT)',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'SUC',
            defaultSql: 'CAST(NULL AS NVARCHAR(10))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'CLIEN_UNI',
            defaultSql: 'CAST(NULL AS FLOAT)',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'RFCRECEPTOR',
            fallbackColumns: ['RfcReceptor'],
            defaultSql: 'CAST(NULL AS NVARCHAR(255))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'RAZONSOCIALRECEPTOR',
            fallbackColumns: ['RazonSocialReceptor'],
            defaultSql: 'CAST(NULL AS NVARCHAR(255))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'EMAILRECEPTOR',
            fallbackColumns: ['EmailReceptor'],
            defaultSql: 'CAST(NULL AS NVARCHAR(255))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'USOCFDI',
            fallbackColumns: ['UsoCfdi'],
            defaultSql: 'CAST(NULL AS NVARCHAR(50))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'CODIGOPOSTALRECEPTOR',
            fallbackColumns: ['CodigoPostalReceptor'],
            defaultSql: 'CAST(NULL AS NVARCHAR(20))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'REGIMENFISCALRECEPTOR',
            fallbackColumns: ['RegimenFiscalReceptor'],
            defaultSql: 'CAST(NULL AS FLOAT)',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'RegimenFiscalReceptorSAT',
            defaultSql: 'CAST(NULL AS NVARCHAR(255))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'RFCEMISOR',
            fallbackColumns: ['RfcEmisor'],
            defaultSql: 'CAST(NULL AS NVARCHAR(255))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'DOMI',
            defaultSql: 'CAST(NULL AS NVARCHAR(255))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'NCEL',
            defaultSql: 'CAST(NULL AS NVARCHAR(255))',
          })},
          ${this.facColumnExpr({
            alias: 'c',
            columns: clientColumns,
            primary: 'OPTICA',
            defaultSql: 'CAST(NULL AS NVARCHAR(255))',
          })}
       FROM FACT_CLIENT_SHP c`;

    const clienHeader = Number(cab[0]?.CLIEN ?? 0);
    let cliente: any[] = [];
    if (Number.isFinite(clienHeader) && clienHeader > 0) {
      cliente = await this.dataSource.query(
        `${clienteSelectSql} WHERE ${clienteIdRef}=@0`,
        [clienHeader],
      );
      if (!cliente.length) {
        cliente = await this.dataSource.query(
          `${clienteSelectSql} WHERE ${clienteClienUniRef}=@0 AND (@1='' OR ${clienteSucRef}=@1) ORDER BY ${clienteFcnRef} DESC`,
          [clienHeader, String(cab[0].SUC ?? '').trim()],
        );
      }
    }

    if (!cliente.length) {
      cliente = await this.dataSource.query(
        `${clienteSelectSql} WHERE ${clienteRfcReceptorRef}=@0 ORDER BY ${clienteFcnRef} DESC`,
        [cab[0].RfcReceptor ?? ''],
      );
    }

    return {
      header: cab[0],
      detail: det,
      sucursal: suc[0] ?? null,
      cliente: cliente[0] ?? null,
    };
  }

  async validarFolio(idFol: string, user?: JwtPayload | null) {
    await this.assertFacturacionReadAccess(user, 'validar factura');
    const full = await this.getFolioData(idFol);
    const header = full.header;
    const round2 = (value: number) => Number(value.toFixed(2));

    if ((header.ESTATUS || '').toUpperCase() !== 'PENDIENTE') {
      throw new BadRequestException(
        `Folio ${idFol} no está en estatus PENDIENTE`,
      );
    }

    const detalleArticulos = (full.detail || []).map((row: any) => {
      const pvtat = Number(row.PVTAT ?? 0);
      const impuestoCalculado = Number((pvtat * 0.16).toFixed(2));
      const totalCalculado = Number((pvtat + impuestoCalculado).toFixed(2));
      return {
        IDD: row.IDD ?? null,
        IDFOL: row.IDFOL ?? idFol,
        UPC: row.UPC ?? row.NoIdentificacion ?? null,
        Descripcion: row.Descripcion ?? null,
        ClaveProdServ: row.ClaveProdServ ?? null,
        Unidad: row.Unidad ?? null,
        Cantidad: Number(row.Cantidad ?? 0),
        ValorUnitario: Number(row.ValorUnitario ?? 0),
        PVTAT: pvtat,
        Impuesto: Number(row.Impuesto ?? impuestoCalculado),
        Total: Number(row.Total ?? totalCalculado),
      };
    });

    const subtotalDetalleRaw = Number(
      detalleArticulos.reduce(
        (acc: number, row: any) => acc + Number(row.PVTAT ?? 0),
        0,
      ),
    );
    const subtotalDetalle = round2(subtotalDetalleRaw);
    const impuestoDetalle = Number(
      detalleArticulos
        .reduce((acc: number, row: any) => acc + Number(row.Impuesto ?? 0), 0)
        .toFixed(2),
    );
    const totalConImpuesto = Number(
      detalleArticulos
        .reduce((acc: number, row: any) => acc + Number(row.Total ?? 0), 0)
        .toFixed(2),
    );
    const totalCabeceraRaw = Number(header.IMPT ?? 0);
    const totalCabecera = round2(totalCabeceraRaw);
    const totalDetalle = round2(totalConImpuesto);
    const diff = round2(totalCabecera - totalDetalle);
    const subtotalSatDiferencia = Number(
      (subtotalDetalleRaw - subtotalDetalle).toFixed(6),
    );
    const requiereAjusteSubtotalSat =
      Math.abs(subtotalSatDiferencia) >= 0.000001;

    const cleanText = (value: unknown) => String(value ?? '').trim();
    const cleanUpper = (value: unknown) => cleanText(value).toUpperCase();
    const isPlaceholder = (value: unknown) => {
      const v = cleanUpper(value);
      return (
        !v ||
        v === '-' ||
        v === 'SELECCIONAR' ||
        v === 'COLOCAR' ||
        v === 'N/A' ||
        v === 'NULL'
      );
    };

    const rfcReceptor = cleanText(
      header.RfcReceptor ??
        header.RFCRECEPTOR ??
        full.cliente?.RFCRECEPTOR ??
        full.cliente?.RfcReceptor,
    );
    const razonSocial = cleanText(
      header.RazonSocialReceptor ??
        header.RAZONSOCIALRECEPTOR ??
        full.cliente?.RAZONSOCIALRECEPTOR ??
        full.cliente?.RazonSocialReceptor,
    );
    const emailReceptor = cleanText(
      full.cliente?.EMAILRECEPTOR ?? full.cliente?.EmailReceptor,
    );
    const usoCfdi = cleanText(
      header.UsoCfdi ??
        header.USOCFDI ??
        full.cliente?.USOCFDI ??
        full.cliente?.UsoCfdi,
    );
    const codigoPostal = cleanText(
      full.cliente?.CODIGOPOSTALRECEPTOR ?? full.cliente?.CodigoPostalReceptor,
    );
    const rfcEmisor = cleanText(
      header.RfcEmisor ??
        header.RFCEMISOR ??
        full.cliente?.RFCEMISOR ??
        full.cliente?.RfcEmisor ??
        full.sucursal?.RFC,
    );
    const regimenRaw = cleanText(
      full.cliente?.REGIMENFISCALRECEPTOR ??
        full.cliente?.RegimenFiscalReceptor,
    );
    const regimenCode = this.normalizeRegimenCode(regimenRaw);
    const regimenOk = !!regimenCode && Number(regimenCode) > 0;
    const rfcGenerico = cleanUpper(rfcReceptor) === 'XAXX010101000';

    const camposFiscalesFaltantes: string[] = [];
    if (isPlaceholder(rfcReceptor)) camposFiscalesFaltantes.push('RfcReceptor');
    if (isPlaceholder(usoCfdi)) camposFiscalesFaltantes.push('UsoCfdi');
    if (isPlaceholder(codigoPostal)) {
      camposFiscalesFaltantes.push('CodigoPostalReceptor');
    }
    if (isPlaceholder(rfcEmisor)) camposFiscalesFaltantes.push('RfcEmisor');
    if (!regimenOk) {
      camposFiscalesFaltantes.push('RegimenFiscalReceptor');
    }
    if (rfcGenerico) {
      if (isPlaceholder(razonSocial)) {
        camposFiscalesFaltantes.push('RazonSocialReceptor');
      }
      if (isPlaceholder(emailReceptor)) {
        camposFiscalesFaltantes.push('EmailReceptor');
      }
    }

    const clienteFiscalCompleto = camposFiscalesFaltantes.length === 0;

    return {
      idFol,
      estatus: header.ESTATUS,
      header,
      totales: {
        cabecera: totalCabecera,
        detalle: totalDetalle,
        diferencia: diff,
        cabeceraOriginal: totalCabeceraRaw,
      },
      validaciones: {
        importeCuadra: Math.abs(diff) < 0.005,
        clienteFiscalCompleto,
        rfcGenerico,
        camposFiscalesFaltantes: Array.from(new Set(camposFiscalesFaltantes)),
        subtotalSatCuadra: !requiereAjusteSubtotalSat,
        requiereAjusteSubtotalSat,
        subtotalSatDiferencia,
      },
      cliente: full.cliente,
      sucursal: full.sucursal,
      conceptos: full.detail.length,
      detalleArticulos,
      totalesDetalle: {
        subtotal: subtotalDetalle,
        subtotalRaw: Number(subtotalDetalleRaw.toFixed(6)),
        impuesto: impuestoDetalle,
        total: totalDetalle,
      },
    };
  }

  private async reenviarCorreoByUuid(
    uuid: string,
    email: string,
    idFol: string,
  ) {
    const emailRes = await this.facturify.sendInvoiceEmail({
      cfdi_uuid: uuid,
      email,
    });

    await this.dataSource.query(
      `UPDATE FAC_SVR_SHAP
          SET CFDI_ERROR_MSG=@2
        WHERE IDFOL=@0`,
      [
        idFol,
        email,
        emailRes.ok
          ? null
          : `EMAIL_FAIL: ${JSON.stringify(emailRes.data).slice(0, 850)}`,
      ],
    );

    return emailRes;
  }

  private toDateYmdHis(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  private toNumericFolio(idFol: string) {
    const digits = (idFol || '').replace(/\D/g, '');
    if (!digits) return 1;
    return Number(digits.slice(-8));
  }

  private async resolveEmisor(rfcEmisor: string) {
    const empresas = await this.facturify.listEmpresas();
    if (!empresas.ok) return null;
    const list = empresas?.data?.data || [];
    const match = (Array.isArray(list) ? list : []).find(
      (e: any) =>
        String(e?.rfc || '').toUpperCase() ===
        String(rfcEmisor || '').toUpperCase(),
    );
    if (!match) return null;
    return {
      uuid: match.uuid,
      razon_social: match.razon_social,
      rfc: match.rfc,
    };
  }

  private normalizeRegimenCode(value: unknown) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;

    const exact3 = raw.match(/\b\d{3}\b/);
    if (exact3?.[0]) return exact3[0];

    if (/^\d+(\.\d+)?$/.test(raw)) {
      const intPart = raw.split('.')[0].trim();
      return intPart.padStart(3, '0').slice(-3);
    }
    return null;
  }

  private async getRegimenCatalogByCode() {
    if (this.regimenByCodeCache) return this.regimenByCodeCache;

    const map = new Map<string, string>();
    Object.entries(FACTURIFY_REGIMEN_DESC_FALLBACK).forEach(([code, desc]) => {
      map.set(code, desc);
    });

    try {
      const rows = await this.dataSource.query(
        `SELECT
            CAST(C_REGIMENFISCAL AS NVARCHAR(10)) AS CODIGO,
            CAST(DESCRIPCION AS NVARCHAR(255)) AS DESCRIPCION
         FROM DAT_CAT_REG`,
      );
      for (const row of rows ?? []) {
        const code = this.normalizeRegimenCode(
          (row as Record<string, unknown>).CODIGO,
        );
        const desc = String(
          (row as Record<string, unknown>).DESCRIPCION ?? '',
        ).trim();
        if (!code || !desc) continue;
        map.set(code, desc);
      }
    } catch {
      // Keep fallback map when DAT_CAT_REG is not available.
    }

    this.regimenByCodeCache = map;
    return map;
  }

  private async resolveReceptorRegimen(cliente: Record<string, unknown>) {
    const rawNum = String(
      cliente.REGIMENFISCALRECEPTOR ?? cliente.RegimenFiscalReceptor ?? '',
    ).trim();
    const rawSat = String(cliente.RegimenFiscalReceptorSAT ?? '').trim();
    const satUpper = rawSat.toUpperCase();

    const codeFromNum = this.normalizeRegimenCode(rawNum);
    if (codeFromNum) {
      const catalog = await this.getRegimenCatalogByCode();
      return (
        catalog.get(codeFromNum) ??
        FACTURIFY_REGIMEN_DESC_FALLBACK[codeFromNum] ??
        FACTURIFY_REGIMEN_DESC_FALLBACK['601']
      );
    }

    const satIsPlaceholder =
      !rawSat ||
      satUpper === 'SELECCIONAR' ||
      satUpper === 'COLOCAR' ||
      satUpper === '-';
    if (!satIsPlaceholder) {
      const satCodeAndDescription = rawSat.match(/^\s*(\d{3})\s*[-: ]\s*(.+)$/);
      if (satCodeAndDescription?.[2]) {
        const desc = satCodeAndDescription[2].trim();
        if (desc) return desc;
      }

      const satLooksDescription =
        rawSat.length > 0 && !/^\d+(\.\d+)?$/.test(rawSat);
      if (satLooksDescription) return rawSat;
    }

    const code = this.normalizeRegimenCode(rawSat) ?? '601';

    const catalog = await this.getRegimenCatalogByCode();
    return (
      catalog.get(code) ??
      FACTURIFY_REGIMEN_DESC_FALLBACK[code] ??
      FACTURIFY_REGIMEN_DESC_FALLBACK['601']
    );
  }

  private async toFacturifyPayload(full: {
    header: any;
    detail: any[];
    sucursal: any;
    cliente: any;
  }) {
    const round2 = (value: number) => this.round2(Number(value || 0));
    const round6 = (value: number) =>
      Math.round((Number(value || 0) + Number.EPSILON) * 1_000_000) /
      1_000_000;

    const h = full.header;
    const c = full.cliente || {};
    const s = full.sucursal || {};

    const rfcEmisor = String(h.RfcEmisor ?? s.RFC ?? '').trim();
    const emisor = await this.resolveEmisor(rfcEmisor);

    const conceptos = (full.detail || []).map((d) => {
      const cantidad = round6(Number(d.Cantidad ?? 1));
      const valorUnitario = round6(Number(d.ValorUnitario ?? d.PVTAT ?? 0));
      const totalConcepto = round6(Number(d.PVTAT ?? 0));
      return {
        clave_producto_servicio: String(d.ClaveProdServ ?? '01010101').split('.')[0],
        clave_unidad_de_medida: String(d.Unidad ?? 'H87'),
        cantidad,
        descripcion: String(d.Descripcion ?? 'CONCEPTO'),
        valor_unitario: valorUnitario,
        total: totalConcepto,
        exento_de_impuestos: false,
        objeto_imp: String(d.ObjetoImp ?? '02')
          .split('.')[0]
          .padStart(2, '0'),
      };
    });

    const subtotalRaw = conceptos.reduce(
      (acc: number, concepto: any) => acc + Number(concepto.total ?? 0),
      0,
    );
    const subtotal = round2(subtotalRaw);
    const total = round2(
      conceptos.reduce((acc: number, concepto: any) => {
        const totalConcepto = Number(concepto.total ?? 0);
        const impuestoConcepto = round2(totalConcepto * 0.16);
        return acc + round2(totalConcepto + impuestoConcepto);
      }, 0),
    );
    const impuestoFederal = round2(total - subtotal);

    const email = String(c.EMAILRECEPTOR ?? '').trim();
    const regimen = await this.resolveReceptorRegimen(c);
    const exportacionRaw = String(
      h.exportacion ?? h.Exportacion ?? '01',
    ).trim();
    const normalizeUsoCfdi = (value: unknown) => {
      const text = String(value ?? '').trim().toUpperCase();
      if (
        !text ||
        text === '-' ||
        text === 'SELECCIONAR' ||
        text === 'COLOCAR' ||
        text === 'NULL'
      ) {
        return '';
      }
      const exact = text.match(/^[A-Z][0-9]{2}$/)?.[0];
      if (exact) return exact;
      return text.match(/\b([A-Z][0-9]{2})\b/)?.[1] ?? text;
    };
    const usoCfdi = normalizeUsoCfdi(h.UsoCfdi ?? h.USOCFDI);
    if (!usoCfdi) {
      throw new BadRequestException(
        `Folio ${String(h.IDFOL ?? '').trim() || 'N/A'} no tiene UsoCfdi válido en FAC_SVR_SHAP`,
      );
    }
    const exportacion =
      exportacionRaw.match(/\d{2}/)?.[0] ??
      exportacionRaw.split('.')[0].trim().padStart(2, '0');

    return {
      emisor: {
        uuid: String(emisor?.uuid ?? ''),
      },
      receptor: {
        razon_social: String(
          h.RazonSocialReceptor ?? c.RAZONSOCIALRECEPTOR ?? 'PUBLICO EN GENERAL',
        ),
        rfc: String(h.RfcReceptor ?? c.RFCRECEPTOR ?? ''),
        email: email || null,
        metodo_de_pago: String(h.MetodoDePago ?? 'PUE'),
        forma_de_pago: String(h.FormaPagoSAT ?? h.FormaPago ?? '99')
          .split('.')[0]
          .padStart(2, '0'),
        uso_cfdi: usoCfdi,
        tarjeta_ultimos_4digitos: 'NA',
        cp: String(c.CODIGOPOSTALRECEPTOR ?? '00000'),
        regimen,
      },
      factura: {
        version: '4.0',
        fecha: this.toDateYmdHis(new Date()),
        tipo: 'ingreso',
        exportacion,
        Exportacion: exportacion,
        forma_de_pago: String(h.FormaPagoSAT ?? h.FormaPago ?? '99')
          .split('.')[0]
          .padStart(2, '0'),
        generacion_automatica: true,
        subtotal,
        impuesto_federal: impuestoFederal,
        total,
        conceptos,
        serie: 'IOE-I',
        folio: this.toNumericFolio(String(h.IDFOL ?? '1')),
        send_pdf_and_xml_by_mail: Boolean(email),
        emails_send: email || undefined,
      },
    };
  }

  private shouldRetryFacturify(timbrado: { status: number; data: any }) {
    if (Number(timbrado?.status) !== 500) return false;
    const code = Number(timbrado?.data?.code ?? 0);
    return code === 121;
  }

  private async stampWithRetry(
    payload: Record<string, unknown>,
    maxAttempts = 3,
    baseDelayMs = 1200,
  ) {
    let last: any = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await this.facturify.stampInvoice(payload);
      last = {
        ...res,
        attempt,
      };
      if (!this.shouldRetryFacturify(res)) {
        return last;
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * attempt),
        );
      }
    }
    return last;
  }

  async emitir(idFol: string, user?: JwtPayload | null) {
    await this.assertFacturacionWriteAccess(user, 'emitir factura');
    this.facturify.assertCredentials();
    const validacion = await this.validarFolio(idFol, user);
    if (!validacion.validaciones.importeCuadra) {
      throw new BadRequestException(
        `No cuadra importe cabecera vs detalle para folio ${idFol}`,
      );
    }
    if (!validacion.validaciones.clienteFiscalCompleto) {
      throw new BadRequestException(
        `Datos fiscales incompletos para folio ${idFol}`,
      );
    }

    const full = await this.getFolioData(idFol);
    const payload = await this.toFacturifyPayload(full);
    if (!payload?.emisor?.uuid) {
      throw new BadRequestException(
        `No se encontró emisor.uuid en Facturify para RFC emisor del folio ${idFol}`,
      );
    }
    const timbrado = await this.stampWithRetry(payload, 3, 1200);

    const data: any = timbrado.data || {};
    const factura = data?.data || data;
    const uuid =
      factura?.cfdi_uuid ||
      factura?.uuid ||
      factura?.cfdiUuid ||
      factura?.invoice_uuid ||
      null;

    const storage = await this.saveCfdiArtifacts({
      idFol,
      xmlBase64: factura?.xml || null,
      pdfBase64: factura?.pdf || null,
      metadata: {
        request: payload,
        response: timbrado,
        retry: {
          attempted: Number(timbrado?.attempt ?? 1),
          reason: this.shouldRetryFacturify(timbrado) ? '500/121' : 'none',
        },
      },
    });

    const facColumns = await this.getFacSvrShapColumns();
    const setFcnfSql = facColumns.has('FCNF')
      ? `,
             FCNF=CASE WHEN @3='TIMBRADO' THEN GETDATE() ELSE FCNF END`
      : '';
    const newStatus = timbrado.ok ? 'FACTURADO' : 'PENDIENTE';
    await this.dataSource.query(
      `UPDATE FAC_SVR_SHAP
         SET ESTATUS=@1,
             CFDI_UUID=@2,
             CFDI_STATUS=@3,
             CFDI_XML_PATH=@4,
             CFDI_PDF_PATH=@5,
             CFDI_FACTURIFY_JOB_ID=@6,
             CFDI_F_TIMBRADO=CASE WHEN @3='TIMBRADO' THEN GETDATE() ELSE CFDI_F_TIMBRADO END${setFcnfSql},
             CFDI_ERROR_MSG=@7
       WHERE IDFOL=@0`,
      [
        idFol,
        newStatus,
        uuid,
        timbrado.ok ? 'TIMBRADO' : 'ERROR',
        storage.xml,
        storage.pdf,
        factura?.job_id || null,
        timbrado.ok ? null : JSON.stringify(timbrado.data).slice(0, 900),
      ],
    );

    let emailRes: any = null;
    const emailTarget = String(full.cliente?.EMAILRECEPTOR ?? '').trim();
    if (timbrado.ok && uuid && this.getAutoEmailOnSuccess() && emailTarget) {
      emailRes = await this.reenviarCorreoByUuid(uuid, emailTarget, idFol);
    }

    const facturifyErrors: string[] = [];
    const rawErrors = Array.isArray(timbrado?.data?.errors)
      ? timbrado.data.errors
      : [];
    for (const item of rawErrors) {
      if (!item || typeof item !== 'object') continue;
      const field = String((item as any).field ?? '').trim();
      const message = String((item as any).message ?? '').trim();
      if (!message) continue;
      facturifyErrors.push(field ? `${field}: ${message}` : message);
    }
    const rawFacturifyMessage = String(timbrado?.data?.message ?? '').trim();
    const emitMessage = timbrado.ok
      ? `Factura emitida correctamente (${idFol})`
      : facturifyErrors.length > 0
      ? `No se pudo emitir: ${facturifyErrors.join(' | ')}`
      : rawFacturifyMessage || `No se pudo emitir factura para ${idFol}`;

    return {
      ok: timbrado.ok,
      status: timbrado.status,
      message: emitMessage,
      idFol,
      uuid,
      storage,
      email: emailRes
        ? { ok: emailRes.ok, status: emailRes.status, target: emailTarget }
        : null,
      errors: facturifyErrors,
      facturify: timbrado.data,
    };
  }

  async refrescarEstado(idFol: string, user?: JwtPayload | null) {
    await this.assertFacturacionWriteAccess(user, 'refrescar estado CFDI');
    const rows = await this.dataSource.query(
      `SELECT TOP 1 CFDI_UUID, ESTATUS, CFDI_STATUS, CFDI_CANCEL_STATUS FROM FAC_SVR_SHAP WHERE IDFOL=@0`,
      [idFol],
    );
    if (!rows?.length) {
      throw new NotFoundException(`Folio ${idFol} no existe`);
    }

    const uuid = rows[0].CFDI_UUID;
    if (!uuid) {
      return {
        ok: false,
        message: `Folio ${idFol} aún no tiene CFDI_UUID`,
        local: rows[0],
      };
    }

    let remote = await this.facturify.getInvoiceByUuid(String(uuid));

    // Fallback: some accounts return 500/121 on direct uuid lookup.
    if (!remote.ok && Number(remote.status) === 500) {
      const list = await this.facturify.listFacturas({
        search: String(uuid),
      });
      if (list.ok) {
        const listRows = list?.data?.data || [];
        const hit = (Array.isArray(listRows) ? listRows : []).find((x: any) => {
          const u = String(x?.cfdi_uuid || x?.uuid || '').toUpperCase();
          return u === String(uuid).toUpperCase();
        });
        if (hit) {
          remote = {
            ok: true,
            status: 200,
            data: { data: hit, source: 'listFacturasFallback' },
          } as any;
        }
      }
    }

    if (remote.ok) {
      const data = remote?.data?.data || {};
      const hasCfdi = Boolean(data?.cfdi_uuid || data?.uuid);
      const anyStatus = String(
        data?.status || data?.estatus || data?.cfdi_status || data?.cancel_status || '',
      ).toUpperCase();
      const canceled =
        anyStatus.includes('CANCEL') ||
        anyStatus.includes('CANCELADO') ||
        anyStatus.includes('VIGENTE CANCELADO');

      const nextEstatus = canceled ? 'PENDIENTE' : hasCfdi ? 'FACTURADO' : 'PENDIENTE';
      const nextCfdiStatus = canceled ? 'CANCELADO' : hasCfdi ? 'TIMBRADO' : 'PENDIENTE';
      const nextCancelStatus = canceled
        ? 'CANCELADO_CONFIRMADO'
        : rows[0].CFDI_CANCEL_STATUS || null;

      await this.dataSource.query(
        `UPDATE FAC_SVR_SHAP
           SET CFDI_STATUS=@1,
               CFDI_CANCEL_STATUS=@2,
               ESTATUS=@3,
               CFDI_ERROR_MSG=NULL
         WHERE IDFOL=@0`,
        [idFol, nextCfdiStatus, nextCancelStatus, nextEstatus],
      );
    }

    const after = await this.dataSource.query(
      `SELECT TOP 1 IDFOL, ESTATUS, CFDI_UUID, CFDI_STATUS, CFDI_CANCEL_STATUS, CFDI_F_TIMBRADO, CFDI_F_CANCELACION
       FROM FAC_SVR_SHAP WHERE IDFOL=@0`,
      [idFol],
    );

    return {
      ok: remote.ok,
      status: remote.status,
      facturify: remote.data,
      local: after?.[0] || null,
    };
  }

  async reenviarCorreo(
    idFol: string,
    email?: string,
    user?: JwtPayload | null,
  ) {
    await this.assertFacturacionWriteAccess(user, 'reenviar XML/PDF por correo');
    const rows = await this.dataSource.query(
      `SELECT TOP 1 CFDI_UUID, RfcReceptor FROM FAC_SVR_SHAP WHERE IDFOL=@0`,
      [idFol],
    );
    const uuid = rows?.[0]?.CFDI_UUID;
    if (!uuid) {
      throw new BadRequestException(
        `Folio ${idFol} no tiene CFDI_UUID para envío de correo`,
      );
    }

    let targetEmail = (email || '').trim();
    if (!targetEmail) {
      const cliente = await this.dataSource.query(
        `SELECT TOP 1 EMAILRECEPTOR FROM FACT_CLIENT_SHP WHERE RFCRECEPTOR=@0 ORDER BY FCNR DESC`,
        [rows?.[0]?.RfcReceptor ?? ''],
      );
      targetEmail = String(cliente?.[0]?.EMAILRECEPTOR ?? '').trim();
    }

    if (!targetEmail) {
      throw new BadRequestException(
        `No se encontró email destino para el folio ${idFol}`,
      );
    }

    const emailRes = await this.reenviarCorreoByUuid(uuid, targetEmail, idFol);

    return {
      ok: emailRes.ok,
      status: emailRes.status,
      idFol,
      uuid,
      targetEmail,
      facturify: emailRes.data,
    };
  }

  async cancelar(idFol: string, motivo?: string, user?: JwtPayload | null) {
    await this.assertFacturacionWriteAccess(user, 'cancelar CFDI');
    this.facturify.assertCredentials();
    const rows = await this.dataSource.query(
      `SELECT TOP 1 CFDI_UUID FROM FAC_SVR_SHAP WHERE IDFOL=@0`,
      [idFol],
    );
    const uuid = rows?.[0]?.CFDI_UUID;
    if (!uuid) {
      throw new BadRequestException(
        `Folio ${idFol} no tiene CFDI_UUID para cancelación`,
      );
    }

    const cancelRes = await this.facturify.cancelInvoice({
      cfdi_uuid: uuid,
      motivo: motivo || '02',
    });
    const facturifyMessage = String(
      (cancelRes?.data as Record<string, unknown>)?.message ??
        (cancelRes?.data as Record<string, unknown>)?.error ??
        '',
    ).trim();
    const message = cancelRes.ok
      ? facturifyMessage || `Cancelación CFDI enviada para ${idFol}`
      : facturifyMessage ||
        `No se pudo cancelar CFDI para ${idFol} (status ${cancelRes.status})`;

    await this.dataSource.query(
      `UPDATE FAC_SVR_SHAP
         SET CFDI_CANCEL_STATUS=@1,
             ESTATUS=@2,
             CFDI_F_CANCELACION=CASE WHEN @1='CANCELACION_PENDIENTE' THEN GETDATE() ELSE CFDI_F_CANCELACION END,
             CFDI_ERROR_MSG=@3
       WHERE IDFOL=@0`,
      [
        idFol,
        cancelRes.ok ? 'CANCELACION_PENDIENTE' : 'ERROR',
        cancelRes.ok ? 'CANCELACION PENDIENTE' : 'FACTURADO',
        cancelRes.ok ? null : JSON.stringify(cancelRes.data).slice(0, 900),
      ],
    );

    return {
      ok: cancelRes.ok,
      status: cancelRes.status,
      idFol,
      uuid,
      message,
      facturify: cancelRes.data,
    };
  }
}

