import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FacturifyClient } from './facturify.client';

@Injectable()
export class FacturacionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly facturify: FacturifyClient,
  ) {}

  async listarPendientes(suc?: string | null) {
    const where = suc ? 'WHERE f.ESTATUS = @0 AND f.SUC = @1' : 'WHERE f.ESTATUS = @0';
    const params = suc ? ['PENDIENTE', suc] : ['PENDIENTE'];
    return this.dataSource.query(
      `SELECT TOP 200 f.IDFOL, f.SUC, f.ESTATUS, f.TIPOFACT, f.IMPT, f.AUT, f.REQF, f.FCNR
       FROM FAC_SVR_SHAP f
       ${where}
       ORDER BY f.FCNR DESC`,
      params,
    );
  }

  async validarFolio(idFol: number) {
    const cab = await this.dataSource.query(
      `SELECT TOP 1 IDFOL, SUC, ESTATUS, TIPOFACT, IMPT, AUT, REQF, IDC
       FROM FAC_SVR_SHAP WHERE IDFOL=@0`,
      [idFol],
    );
    if (!cab.length) throw new NotFoundException(`Folio ${idFol} no existe en FAC_SVR_SHAP`);

    const header = cab[0];
    if ((header.ESTATUS || '').toUpperCase() !== 'PENDIENTE') {
      throw new BadRequestException(`Folio ${idFol} no está en estatus PENDIENTE`);
    }

    const det = await this.dataSource.query(
      `SELECT COUNT(1) AS total_rows, ISNULL(SUM(ISNULL(IMPORTE,0)),0) AS total_importe
       FROM FACT_TICKET_SHP WHERE IDFOL=@0`,
      [idFol],
    );

    const totalDetalle = Number(det?.[0]?.total_importe ?? 0);
    const totalCabecera = Number(header.IMPT ?? 0);
    const diff = Number((totalCabecera - totalDetalle).toFixed(2));

    const cliente = await this.dataSource.query(
      `SELECT TOP 1 RFCRECEPTOR, RAZONSOCIALRECEPTOR, EMAILRECEPTOR, USOCFDI, CODIGOPOSTALRECEPTOR, REGIMENFISCALRECEPTOR
       FROM FACT_CLIENT_SHP WHERE IDC=@0`,
      [header.IDC],
    );

    const satOk = Boolean(cliente.length && cliente[0].RFCRECEPTOR && cliente[0].USOCFDI && cliente[0].CODIGOPOSTALRECEPTOR);

    return {
      idFol,
      estatus: header.ESTATUS,
      totales: { cabecera: totalCabecera, detalle: totalDetalle, diferencia: diff },
      validaciones: {
        importeCuadra: Math.abs(diff) < 0.01,
        clienteFiscalCompleto: satOk,
      },
      cliente: cliente[0] || null,
    };
  }

  async emitir(idFol: number) {
    this.facturify.assertCredentials();
    const validacion = await this.validarFolio(idFol);
    if (!validacion.validaciones.importeCuadra) {
      throw new BadRequestException(`No cuadra importe cabecera vs detalle para folio ${idFol}`);
    }
    if (!validacion.validaciones.clienteFiscalCompleto) {
      throw new BadRequestException(`Datos fiscales incompletos para folio ${idFol}`);
    }

    return {
      ok: true,
      stage: 'sandbox-ready',
      message: 'Validación local completa. Integración HTTP Facturify se conecta en siguiente commit.',
      idFol,
      baseUrl: this.facturify.getBaseUrl(),
    };
  }

  async cancelar(idFol: number, motivo?: string) {
    this.facturify.assertCredentials();
    return {
      ok: true,
      stage: 'sandbox-ready',
      message: 'Cancelación placeholder lista para conectar endpoint de Facturify.',
      idFol,
      motivo: motivo || null,
      baseUrl: this.facturify.getBaseUrl(),
    };
  }
}
