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

  private toFacturifyPayload(full: {
    header: any;
    detail: any[];
    sucursal: any;
    cliente: any;
  }) {
    const h = full.header;
    const c = full.cliente || {};
    const s = full.sucursal || {};

    const conceptos = (full.detail || []).map((d) => {
      const base = Number(d.PVTAT ?? 0);
      const tasa = Number(d.IvaTasa ?? 0.16);
      const impIva = Number((base * tasa).toFixed(2));
      return {
        clave_prod_serv: String(d.ClaveProdServ ?? '01010101'),
        no_identificacion: String(d.NoIdentificacion ?? d.IDD ?? ''),
        cantidad: Number(d.Cantidad ?? 1),
        clave_unidad: String(d.Unidad ?? 'H87'),
        descripcion: String(d.Descripcion ?? 'CONCEPTO'),
        valor_unitario: Number(d.ValorUnitario ?? base),
        importe: base,
        descuento: Number(d.Descuento ?? 0),
        objeto_imp: String(d.ObjetoImp ?? '02'),
        impuestos: {
          traslados: [
            {
              base,
              impuesto: '002',
              tipo_factor: 'Tasa',
              tasa_o_cuota: Number(tasa.toFixed(6)),
              importe: impIva,
            },
          ],
        },
      };
    });

    const subtotal = conceptos.reduce(
      (a: number, x: any) => a + Number(x.importe ?? 0),
      0,
    );
    const totalIva = conceptos.reduce(
      (a: number, x: any) =>
        a + Number(x?.impuestos?.traslados?.[0]?.importe ?? 0),
      0,
    );
    const total = Number((subtotal + totalIva).toFixed(2));

    return {
      factura: {
        serie: 'IOE',
        folio: String(h.IDFOL),
        fecha: new Date().toISOString(),
        forma_pago: String(h.FormaPago ?? '99'),
        subtotal: Number(subtotal.toFixed(2)),
        descuento: 0,
        moneda: 'MXN',
        tipo_de_comprobante: 'I',
        metodo_pago: String(h.MetodoDePago ?? 'PUE'),
        lugar_expedicion: String(c.CODIGOPOSTALRECEPTOR ?? '00000'),
        exportacion: '01',
        total,
      },
      emisor: {
        rfc: String(h.RfcEmisor ?? s.RFC ?? ''),
        nombre: String(s.NOMBRE_SUC ?? 'EMISOR IOE'),
        regimen_fiscal: '601',
      },
      receptor: {
        rfc: String(h.RfcReceptor ?? c.RFCRECEPTOR ?? ''),
        nombre: String(
          h.RazonSocialReceptor ?? c.RAZONSOCIALRECEPTOR ?? 'PUBLICO EN GENERAL',
        ),
        domicilio_fiscal_receptor: String(c.CODIGOPOSTALRECEPTOR ?? '00000'),
        regimen_fiscal_receptor: String(c.REGIMENFISCALRECEPTOR ?? '601'),
        uso_cfdi: String(h.UsoCfdi ?? c.USOCFDI ?? 'G01'),
      },
      conceptos,
    };
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
    const payload = this.toFacturifyPayload(full);
    const timbrado = await this.facturify.stampInvoice(payload);

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

    return {
      ok: timbrado.ok,
      status: timbrado.status,
      idFol,
      uuid,
      storage,
      facturify: timbrado.data,
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
