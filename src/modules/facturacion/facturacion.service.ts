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

  async validarFolio(idFol: string) {
    const cab = await this.dataSource.query(
      `SELECT TOP 1 IDFOL, SUC, ESTATUS, TIPOFACT, IMPT, AUT, REQF, RfcEmisor, RfcReceptor, UsoCfdi, MetodoDePago
       FROM FAC_SVR_SHAP WHERE IDFOL=@0`,
      [idFol],
    );
    if (!cab.length)
      throw new NotFoundException(
        `Folio ${idFol} no existe en FAC_SVR_SHAP`,
      );

    const header = cab[0];
    if ((header.ESTATUS || '').toUpperCase() !== 'PENDIENTE') {
      throw new BadRequestException(
        `Folio ${idFol} no está en estatus PENDIENTE`,
      );
    }

    const det = await this.dataSource.query(
      `SELECT COUNT(1) AS total_rows, ISNULL(SUM(ISNULL(PVTAT,0)),0) AS total_importe
       FROM FACT_TICKET_SHP WHERE IDFOL=@0`,
      [idFol],
    );

    const totalDetalle = Number(det?.[0]?.total_importe ?? 0);
    const totalCabecera = Number(header.IMPT ?? 0);
    const diff = Number((totalCabecera - totalDetalle).toFixed(2));

    const cliente = await this.dataSource.query(
      `SELECT TOP 1 RFCRECEPTOR, RAZONSOCIALRECEPTOR, EMAILRECEPTOR, USOCFDI, CODIGOPOSTALRECEPTOR, REGIMENFISCALRECEPTOR
       FROM FACT_CLIENT_SHP WHERE RFCRECEPTOR=@0 ORDER BY FCNR DESC`,
      [header.RfcReceptor ?? ''],
    );

    const satOk = Boolean(
      (header.RfcReceptor || cliente?.[0]?.RFCRECEPTOR) &&
        (header.UsoCfdi || cliente?.[0]?.USOCFDI) &&
        cliente?.[0]?.CODIGOPOSTALRECEPTOR,
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
      cliente: cliente[0] || null,
      header,
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

    const auth = await this.facturify.requestToken();

    const storage = await this.saveCfdiArtifacts({
      idFol,
      metadata: {
        mode: 'pre-production-design',
        message:
          'Token Facturify productivo obtenido. Pendiente endpoint final de timbrado para guardar XML/PDF reales.',
        token_expires_in: auth.expiresIn,
      },
    });

    return {
      ok: true,
      stage: 'prod-auth-ok',
      message:
        'Autenticación Facturify productivo validada. Endpoint de timbrado pendiente de acoplar en siguiente iteración.',
      idFol,
      baseUrl: this.facturify.getBaseUrl(),
      tokenInfo: {
        hasToken: Boolean(auth.token),
        tokenLength: auth.token.length,
        expiresIn: auth.expiresIn,
      },
      storage,
    };
  }

  async cancelar(idFol: string, motivo?: string) {
    this.facturify.assertCredentials();
    return {
      ok: true,
      stage: 'prod-auth-ok',
      message:
        'Cancelación lista a nivel auth productivo; falta acoplar endpoint final de cancelación Facturify.',
      idFol,
      motivo: motivo || null,
      baseUrl: this.facturify.getBaseUrl(),
    };
  }
}
