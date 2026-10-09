import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'bigint') {
    return valor.toString();
  }
  return '';
}

export interface FolioNota {
  idFol: string;
  serie: string;
  folio: string;
  nomenclatura: string;
  reemision: number;
}

export interface NotaRegistrada {
  nomenclatura: string;
  serie: string;
  folio: string;
  uuid: string | null;
  estado: string;
}

/**
 * Control de folios de las notas de credito.
 *
 * Viven en la misma tabla que los de las facturas, pero con su propia serie
 * ('NC' + dos letras del RFC) y bajo el IDFOL `<folio>-NC`, para que cada
 * factura sepa cuantas notas tiene sin necesidad de columnas nuevas.
 */
@Injectable()
export class NotaCreditoRepositorio {
  constructor(private readonly dataSource: DataSource) {}

  async reservarFolio(input: {
    idFolOrigen: string;
    rfcEmisor: string;
    fecha: Date;
    usuario?: string;
    /** NC nota de credito (por omision), PG complemento de pago. */
    tipo?: 'NC' | 'PG';
  }): Promise<FolioNota> {
    const filas: Array<Record<string, unknown>> = await this.dataSource.query(
      `EXEC dbo.sp_fact_cfdi_rel_reserve
         @IDFOL_ORIGEN = @0,
         @RFCEMISOR = @1,
         @FECHA = @2,
         @USUARIO = @3,
         @TIPO = @4`,
      [
        input.idFolOrigen,
        input.rfcEmisor,
        input.fecha.toISOString().slice(0, 10),
        input.usuario ?? null,
        input.tipo ?? 'NC',
      ],
    );

    const fila = filas?.[0];
    if (!fila) {
      throw new Error(
        `No se pudo reservar folio de nota de credito para ${input.idFolOrigen}.`,
      );
    }

    return {
      idFol: texto(fila.IDFOL),
      serie: texto(fila.SERIE),
      folio: texto(fila.FOLIO),
      nomenclatura: texto(fila.NOMENCLATURA),
      reemision: Number(fila.REEMISION ?? 0),
    };
  }

  /** Notas ya emitidas contra una factura, de la mas vieja a la mas nueva. */
  async notasDeFolio(
    idFolOrigen: string,
    tipo: 'NC' | 'PG' = 'NC',
  ): Promise<NotaRegistrada[]> {
    const filas: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT NOMENCLATURA, SERIE, FOLIO, CFDI_UUID, ESTADO
         FROM dbo.FACT_CFDI_FOLIOS_DIARIOS
        WHERE IDFOL = @0
        ORDER BY REEMISION ASC`,
      [`${idFolOrigen}-${tipo}`],
    );

    return (filas ?? []).map((f) => ({
      nomenclatura: texto(f.NOMENCLATURA),
      serie: texto(f.SERIE),
      folio: texto(f.FOLIO),
      uuid: texto(f.CFDI_UUID) || null,
      estado: texto(f.ESTADO),
    }));
  }

  async marcarTimbrada(input: {
    idFol: string;
    uuid: string;
    usuario?: string;
  }): Promise<void> {
    await this.dataSource.query(
      `EXEC dbo.sp_fact_cfdi_serie_update_status
         @IDFOL = @0, @ESTADO = @1, @CFDI_UUID = @2, @USUARIO = @3`,
      [input.idFol, 'TIMBRADO', input.uuid, input.usuario ?? null],
    );
  }

  async marcarError(
    idFol: string,
    mensaje: string,
    usuario?: string,
  ): Promise<void> {
    await this.dataSource.query(
      `EXEC dbo.sp_fact_cfdi_serie_update_status
         @IDFOL = @0, @ESTADO = @1, @USUARIO = @2, @OBSERVACIONES = @3`,
      [idFol, 'ERROR_EMISION', usuario ?? null, mensaje.slice(0, 500)],
    );
  }
}
