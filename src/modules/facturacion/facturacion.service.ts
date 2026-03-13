import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FacturifyClient } from './facturify.client';
import { mkdir, writeFile } from 'node:fs/promises';
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

@Injectable()
export class FacturacionService {
  private facSvrShapColumnsCache: Set<string> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly facturify: FacturifyClient,
    private readonly config: ConfigService,
  ) {}

  private getStorageBasePath() {
    return (
      this.config.get<string>('CFDI_STORAGE_BASE_PATH') || '/mnt/respaldoCFDI'
    );
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

    return `SELECT TOP 1 f.IDFOL, f.SUC, f.ESTATUS, ${tipoFactExpr}, f.IMPT, ${autExpr}, ${reqfExpr}, ${rfcEmisorExpr}, ${rfcReceptorExpr}, ${razonSocialExpr}, ${usoCfdiExpr}, ${metodoPagoExpr}, ${formaPagoExpr}, ${formaPagoSatExpr}, ${exportacionExpr}
            FROM FAC_SVR_SHAP f
            WHERE f.IDFOL=@0`;
  }
  private async saveCfdiArtifacts(input: {
    idFol: string;
    xmlBase64?: string | null;
    pdfBase64?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const folder = join(this.getStorageBasePath(), this.dayFolder(), input.idFol);
    await mkdir(folder, { recursive: true });

    const paths: Record<string, string | null> = {
      folder,
      xml: null,
      pdf: null,
      metadata: null,
    };

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
  }

  async listarPendientes(input: ListarPendientesInput = {}) {
    const columns = await this.getFacSvrShapColumns();
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

    const where: string[] = [
      `${statusExpr} IN (${addParam('PENDIENTE')}, ${addParam('CANCELACION PENDIENTE')})`,
    ];

    const filterEstatus = this.normalizeTextFilter(input.estatus);
    if (filterEstatus && filterEstatus !== 'TODOS') {
      where.push(`${statusExpr} = ${addParam(filterEstatus)}`);
    }

    const addContainsFilter = (sqlExpr: string, rawValue?: string | null) => {
      const value = this.normalizeTextFilter(rawValue);
      if (!value) return;
      where.push(`${sqlExpr} LIKE ${addParam(`%${value}%`)}`);
    };

    addContainsFilter(sucExpr, input.suc);
    addContainsFilter(razonSocialExpr, input.razonSocialReceptor);
    addContainsFilter(rfcReceptorExpr, input.rfcReceptor);
    addContainsFilter(clienExpr, input.clien);
    addContainsFilter(idFolExpr, input.idFol);
    addContainsFilter(tipoFactExpr, input.tipoFact);

    const whereSql = where.length ? `WHERE ${where.join('\n  AND ')}` : '';
    const offsetParam = `@${params.length}`;
    const fetchParam = `@${params.length + 1}`;

    const data = await this.dataSource.query(
      `${selectSql}
       ${whereSql}
       ORDER BY FCN DESC, f.IDFOL DESC
       OFFSET ${offsetParam} ROWS
       FETCH NEXT ${fetchParam} ROWS ONLY`,
      [...params, offset, pageSize],
    );

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
  private async getFolioData(idFol: string) {
    const headerSql = await this.buildHeaderSelectSql();
    const cab = await this.dataSource.query(
      headerSql,
      [idFol],
    );
    if (!cab.length) {
      throw new NotFoundException(`Folio ${idFol} no existe en FAC_SVR_SHAP`);
    }

    const det = await this.dataSource.query(
      `SELECT IDD, ClaveProdServ, NoIdentificacion, Descripcion, Cantidad, ValorUnitario, PVTAT, Unidad, ObjetoImp, IvaTasa, Descuento
       FROM FACT_TICKET_SHP WHERE IDFOL=@0`,
      [idFol],
    );

    const suc = await this.dataSource.query(
      `SELECT TOP 1 SUC, [DESC] AS NOMBRE_SUC, RFC FROM DAT_SUC WHERE SUC=@0`,
      [cab[0].SUC ?? ''],
    );

    const cliente = await this.dataSource.query(
      `SELECT TOP 1 RFCRECEPTOR, RAZONSOCIALRECEPTOR, EMAILRECEPTOR, USOCFDI, CODIGOPOSTALRECEPTOR, REGIMENFISCALRECEPTOR, RegimenFiscalReceptorSAT
       FROM FACT_CLIENT_SHP WHERE RFCRECEPTOR=@0 ORDER BY FCNR DESC`,
      [cab[0].RfcReceptor ?? ''],
    );

    return {
      header: cab[0],
      detail: det,
      sucursal: suc[0] ?? null,
      cliente: cliente[0] ?? null,
    };
  }

  async validarFolio(idFol: string) {
    const full = await this.getFolioData(idFol);
    const header = full.header;

    if ((header.ESTATUS || '').toUpperCase() !== 'PENDIENTE') {
      throw new BadRequestException(
        `Folio ${idFol} no está en estatus PENDIENTE`,
      );
    }

    const totalDetalle = Number(
      (full.detail || []).reduce(
        (acc: number, row: any) => acc + Number(row.PVTAT ?? 0),
        0,
      ),
    );
    const totalCabecera = Number(header.IMPT ?? 0);
    const diff = Number((totalCabecera - totalDetalle).toFixed(2));

    const satOk = Boolean(
      (header.RfcReceptor || full.cliente?.RFCRECEPTOR) &&
        (header.UsoCfdi || full.cliente?.USOCFDI) &&
        full.cliente?.CODIGOPOSTALRECEPTOR &&
        (header.RfcEmisor || full.sucursal?.RFC),
    );

    return {
      idFol,
      estatus: header.ESTATUS,
      totales: {
        cabecera: totalCabecera,
        detalle: totalDetalle,
        diferencia: diff,
      },
      validaciones: {
        importeCuadra: Math.abs(diff) < 0.01,
        clienteFiscalCompleto: satOk,
      },
      cliente: full.cliente,
      sucursal: full.sucursal,
      conceptos: full.detail.length,
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

  private async toFacturifyPayload(full: {
    header: any;
    detail: any[];
    sucursal: any;
    cliente: any;
  }) {
    const h = full.header;
    const c = full.cliente || {};
    const s = full.sucursal || {};

    const rfcEmisor = String(h.RfcEmisor ?? s.RFC ?? '').trim();
    const emisor = await this.resolveEmisor(rfcEmisor);

    const conceptos = (full.detail || []).map((d) => ({
      clave_producto_servicio: String(d.ClaveProdServ ?? '01010101').split('.')[0],
      clave_unidad_de_medida: String(d.Unidad ?? 'H87'),
      cantidad: Number(d.Cantidad ?? 1),
      descripcion: String(d.Descripcion ?? 'CONCEPTO'),
      valor_unitario: Number(d.ValorUnitario ?? d.PVTAT ?? 0),
      total: Number(d.PVTAT ?? 0),
      exento_de_impuestos: false,
      objeto_imp: String(d.ObjetoImp ?? '02')
        .split('.')[0]
        .padStart(2, '0'),
    }));

    const subtotal = conceptos.reduce(
      (a: number, x: any) => a + Number(x.total ?? 0),
      0,
    );
    const impuestoFederal = Number((subtotal * 0.16).toFixed(2));
    const total = Number((subtotal + impuestoFederal).toFixed(2));

    const email = String(c.EMAILRECEPTOR ?? '').trim();

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
        tarjeta_ultimos_4digitos: 'NA',
        cp: String(c.CODIGOPOSTALRECEPTOR ?? '00000'),
        regimen: String(c.RegimenFiscalReceptorSAT ?? c.REGIMENFISCALRECEPTOR ?? '601').split('.')[0],
      },
      factura: {
        version: '4.0',
        fecha: this.toDateYmdHis(new Date()),
        tipo: 'ingreso',
        Exportacion: String(h.Exportacion ?? '01'),
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

  async emitir(idFol: string) {
    this.facturify.assertCredentials();
    const validacion = await this.validarFolio(idFol);
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

    const newStatus = timbrado.ok ? 'FACTURADO' : 'PENDIENTE';
    await this.dataSource.query(
      `UPDATE FAC_SVR_SHAP
         SET ESTATUS=@1,
             CFDI_UUID=@2,
             CFDI_STATUS=@3,
             CFDI_XML_PATH=@4,
             CFDI_PDF_PATH=@5,
             CFDI_FACTURIFY_JOB_ID=@6,
             CFDI_F_TIMBRADO=CASE WHEN @3='TIMBRADO' THEN GETDATE() ELSE CFDI_F_TIMBRADO END,
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

    return {
      ok: timbrado.ok,
      status: timbrado.status,
      idFol,
      uuid,
      storage,
      email: emailRes
        ? { ok: emailRes.ok, status: emailRes.status, target: emailTarget }
        : null,
      facturify: timbrado.data,
    };
  }

  async refrescarEstado(idFol: string) {
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

  async reenviarCorreo(idFol: string, email?: string) {
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

  async cancelar(idFol: string, motivo?: string) {
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
      facturify: cancelRes.data,
    };
  }
}

