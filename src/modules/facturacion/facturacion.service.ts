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

@Injectable()
export class FacturacionService {
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

  async listarPendientes(suc?: string | null) {
    const where = suc
      ? 'WHERE f.ESTATUS = @0 AND f.SUC = @1'
      : 'WHERE f.ESTATUS = @0';
    const params = suc ? ['PENDIENTE', suc] : ['PENDIENTE'];
    return this.dataSource.query(
      `SELECT TOP 200 f.IDFOL, f.SUC, f.ESTATUS, f.TIPOFACT, f.IMPT, f.AUT, f.REQF, f.FCN
       FROM FAC_SVR_SHAP f
       ${where}
       ORDER BY f.FCN DESC`,
      params,
    );
  }

  private async getFolioData(idFol: string) {
    const cab = await this.dataSource.query(
      `SELECT TOP 1 IDFOL, SUC, ESTATUS, TIPOFACT, IMPT, AUT, REQF, RfcEmisor, RfcReceptor, RazonSocialReceptor, UsoCfdi, MetodoDePago, FormaPago
       FROM FAC_SVR_SHAP WHERE IDFOL=@0`,
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
      `SELECT TOP 1 RFCRECEPTOR, RAZONSOCIALRECEPTOR, EMAILRECEPTOR, USOCFDI, CODIGOPOSTALRECEPTOR, REGIMENFISCALRECEPTOR
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

  private async resolveVendor(rfcEmisor: string) {
    const empresas = await this.facturify.listEmpresas();
    if (!empresas.ok) return null;
    const list = empresas?.data?.data || [];
    const match = (Array.isArray(list) ? list : []).find(
      (e: any) => String(e?.rfc || '').toUpperCase() === String(rfcEmisor || '').toUpperCase(),
    );
    if (!match) return null;
    return {
      uuid: match.uuid,
      name: match.razon_social,
      tax_id: match.rfc,
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
    const vendor = await this.resolveVendor(rfcEmisor);

    const items = (full.detail || []).map((d) => ({
      sku: String(d.NoIdentificacion ?? d.IDD ?? ''),
      description: String(d.Descripcion ?? 'CONCEPTO'),
      quantity: Number(d.Cantidad ?? 1),
      price: Number(d.ValorUnitario ?? d.PVTAT ?? 0),
      amount: Number(d.PVTAT ?? 0),
      tax_federal: Number(d.IvaTasa ?? 0.16),
      tax_type: '002',
      sat_key: String(d.ClaveProdServ ?? '01010101').split('.')[0],
      unit_key: String(d.Unidad ?? 'H87'),
    }));

    return {
      vendor: {
        uuid: String(vendor?.uuid ?? ''),
        name: String(vendor?.name ?? s.NOMBRE_SUC ?? 'EMISOR IOE'),
        tax_id: String(vendor?.tax_id ?? rfcEmisor),
      },
      customer: {
        name: String(
          h.RazonSocialReceptor ?? c.RAZONSOCIALRECEPTOR ?? 'PUBLICO EN GENERAL',
        ),
        tax_id: String(h.RfcReceptor ?? c.RFCRECEPTOR ?? ''),
        email: String(c.EMAILRECEPTOR ?? '').trim() || undefined,
        cfdi_usage: String(h.UsoCfdi ?? c.USOCFDI ?? 'G01'),
        regime: String(c.REGIMENFISCALRECEPTOR ?? '601').split('.')[0],
        postal_code: String(c.CODIGOPOSTALRECEPTOR ?? '00000'),
      },
      service: {
        date: this.toDateYmdHis(new Date()),
        payment_type: String(h.FormaPago ?? '99').split('.')[0],
        payment_method: String(h.MetodoDePago ?? 'PUE'),
        currency: 'MXN',
        tipo_de_cambio: 1,
        tax_federal: 0.16,
        type: 'I',
        version: '4.0',
        folio: this.toNumericFolio(String(h.IDFOL ?? '1')),
        items,
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
    if (!payload?.vendor?.uuid) {
      throw new BadRequestException(
        `No se encontró vendor.uuid en Facturify para RFC emisor del folio ${idFol}`,
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
             CFDI_F_CANCELACION=CASE WHEN @1='CANCELADO' THEN GETDATE() ELSE CFDI_F_CANCELACION END,
             CFDI_ERROR_MSG=@2
       WHERE IDFOL=@0`,
      [
        idFol,
        cancelRes.ok ? 'CANCELADO' : 'ERROR',
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
