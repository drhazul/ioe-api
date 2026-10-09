import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { columna, Fila, FilasVenta } from './venta.mapper';

export interface SerieReservada {
  serie: string;
  folio: string;
  nomenclatura: string;
  consecutivoGlobal?: number;
}

/**
 * Lectura y escritura de los folios a facturar con Quadrum.
 *
 * Deliberadamente aparte de `facturacion.service.ts`: ese modulo sigue
 * timbrando con Facturify y no se toca. Aqui solo se leen las mismas tablas y
 * se reusan sus dos procedimientos de folios, que son agnosticos al PAC.
 *
 * Las consultas son `SELECT *` a proposito: las columnas de FAC_SVR_SHAP y
 * FACT_CLIENT_SHP cambian de nombre entre instalaciones, y `venta.mapper.ts`
 * ya sabe buscarlas por varios nombres.
 */
@Injectable()
export class VentaRepositorio {
  constructor(private readonly dataSource: DataSource) {}

  /** Cabecera, detalle, cliente fiscal y sucursal de un folio. */
  async folio(idFol: string): Promise<FilasVenta> {
    const cabeceras: Fila[] = await this.dataSource.query(
      `SELECT TOP 1 * FROM dbo.FAC_SVR_SHAP WHERE IDFOL = @0`,
      [idFol],
    );
    const header = cabeceras?.[0];
    if (!header) {
      throw new NotFoundException(`No existe el folio ${idFol}.`);
    }

    const detalle: Fila[] = await this.dataSource.query(
      `SELECT * FROM dbo.FACT_TICKET_SHP WHERE IDFOL = @0 ORDER BY IDD`,
      [idFol],
    );

    const suc = columna(header, 'SUC');
    const sucursales: Fila[] = suc
      ? await this.dataSource.query(
          `SELECT TOP 1 * FROM dbo.DAT_SUC WHERE SUC = @0`,
          [suc],
        )
      : [];

    // El CLIEN del folio se resuelve igual que del lado de Facturify:
    // primero contra IDC y, si no hay renglon, contra CLIEN_UNI acotado a la
    // sucursal y tomando el mas reciente. La tabla NO tiene columna CLIEN.
    const clien = Number(columna(header, 'CLIEN'));
    let clientes: Fila[] = [];
    if (Number.isFinite(clien) && clien > 0) {
      clientes = await this.dataSource.query(
        `SELECT TOP 1 * FROM dbo.FACT_CLIENT_SHP WHERE IDC = @0`,
        [clien],
      );
      if (!clientes.length) {
        clientes = await this.dataSource.query(
          `SELECT TOP 1 * FROM dbo.FACT_CLIENT_SHP
           WHERE CLIEN_UNI = @0 AND (@1 = '' OR SUC = @1)
           ORDER BY FCNR DESC`,
          [clien, suc],
        );
      }
    }
    const rfcReceptor = columna(header, 'RfcReceptor');
    if (!clientes.length && rfcReceptor) {
      clientes = await this.dataSource.query(
        `SELECT TOP 1 * FROM dbo.FACT_CLIENT_SHP WHERE RFCRECEPTOR = @0`,
        [rfcReceptor],
      );
    }

    return {
      header,
      detalle: detalle ?? [],
      sucursal: sucursales?.[0] ?? null,
      cliente: clientes?.[0] ?? null,
    };
  }

  /** Reserva serie y folio con el procedimiento que ya usa facturacion. */
  async reservarSerie(input: {
    idFol: string;
    rfcEmisor: string;
    fecha: Date;
    usuario?: string;
  }): Promise<SerieReservada> {
    const rows: Fila[] = await this.dataSource.query(
      `SET ANSI_NULLS ON;
       SET ANSI_PADDING ON;
       SET ANSI_WARNINGS ON;
       SET ARITHABORT ON;
       SET CONCAT_NULL_YIELDS_NULL ON;
       SET QUOTED_IDENTIFIER ON;
       SET NUMERIC_ROUNDABORT OFF;
       EXEC dbo.sp_fact_cfdi_serie_reserve
         @IDFOL = @0,
         @RFCEMISOR = @1,
         @FECHA = @2,
         @USUARIO = @3`,
      [input.idFol, input.rfcEmisor, input.fecha, input.usuario ?? null],
    );

    const fila = rows?.[0];
    const serie = columna(fila, 'SERIE');
    const folio = columna(fila, 'FOLIO');
    const nomenclatura = columna(fila, 'NOMENCLATURA');
    if (!serie || !folio || !nomenclatura) {
      throw new ServiceUnavailableException(
        `sp_fact_cfdi_serie_reserve no devolvio serie controlada para ${input.idFol}.`,
      );
    }
    const consecutivo = Number(columna(fila, 'CONSECUTIVO_GLOBAL'));
    return {
      serie,
      folio,
      nomenclatura,
      consecutivoGlobal: Number.isFinite(consecutivo) ? consecutivo : undefined,
    };
  }

  /** Marca el control de folios (RESERVADO -> TIMBRADO / ERROR_EMISION). */
  async actualizarEstadoSerie(input: {
    idFol: string;
    estado: string;
    uuid?: string | null;
    usuario?: string | null;
    observaciones?: string | null;
  }): Promise<void> {
    await this.dataSource.query(
      `EXEC dbo.sp_fact_cfdi_serie_update_status
         @IDFOL = @0,
         @ESTADO = @1,
         @CFDI_UUID = @2,
         @USUARIO = @3,
         @OBSERVACIONES = @4`,
      [
        input.idFol,
        input.estado,
        input.uuid ?? null,
        input.usuario ?? null,
        input.observaciones ?? null,
      ],
    );
  }

  /** Mensaje util en vez de un error de SQL si falta el script de CFDI_PAC. */
  async assertColumnaPac(): Promise<void> {
    const rows: { existe: number }[] = await this.dataSource.query(
      `SELECT CASE WHEN COL_LENGTH('dbo.FAC_SVR_SHAP', 'CFDI_PAC') IS NULL THEN 0 ELSE 1 END AS existe`,
    );
    if (!rows?.[0]?.existe) {
      throw new ServiceUnavailableException(
        'Falta la columna CFDI_PAC. Ejecuta sql/2026-09-23_fact_cfdi_pac.sql',
      );
    }
  }

  /** Deja el folio timbrado y marcado como de Quadrum. */
  /**
   * Deja registrado donde quedo el PDF. Es solo la representacion impresa:
   * si se pierde se vuelve a pedir al PAC, a diferencia del XML.
   */
  /** Folio al que pertenece un UUID. Null si ese CFDI no es de aqui. */
  async folioPorUuid(uuid: string): Promise<Fila | null> {
    const filas: Fila[] = await this.dataSource.query(
      `SELECT TOP 1 * FROM dbo.FAC_SVR_SHAP WHERE CFDI_UUID = @0`,
      [uuid],
    );
    return filas?.[0] ?? null;
  }

  /**
   * Cancelacion pedida al SAT y aceptada por el, pero aun sin confirmar.
   *
   * El folio queda disponible desde que el SAT acepta la solicitud: una
   * factura se cancela por error y hay que poder rehacerla en el momento,
   * sin esperar a que el SAT la de por concluida (puede tardar).
   *
   * El CFDI sigue TIMBRADO y la cancelacion sigue PENDIENTE a proposito:
   * es CFDI_CANCEL_STATUS, no ESTATUS, quien dice si ya esta cerrada.
   */
  async marcarCancelacionSolicitada(idFol: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE dbo.FAC_SVR_SHAP
          SET CFDI_CANCEL_STATUS = 'CANCELACION_PENDIENTE',
              ESTATUS = 'PENDIENTE',
              -- Vuelve a la bandeja de pendientes CON LA FECHA DE HOY: si
              -- conservara la de la venta, quedaria enterrado entre los
              -- folios viejos y seria imposible de encontrar.
              FCNF = GETDATE(),
              CFDI_F_CANCELACION = GETDATE()
        WHERE IDFOL = @0`,
      [idFol],
    );
  }

  /**
   * El SAT ya confirmo la cancelacion.
   *
   * El folio vuelve a PENDIENTE a proposito: una factura se puede cancelar
   * por error, y asi queda lista para volver a facturarse. Es la misma
   * regla que usa el camino de Facturify.
   *
   * No se pierde nada: CFDI_STATUS y CFDI_CANCEL_STATUS guardan que hubo
   * una cancelacion, y el CFDI cancelado conserva su renglon en el control
   * de folios con su propia reemision.
   */
  async marcarCancelado(idFol: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE dbo.FAC_SVR_SHAP
          SET CFDI_STATUS = 'CANCELADO',
              CFDI_CANCEL_STATUS = 'CANCELADO_CONFIRMADO',
              ESTATUS = 'PENDIENTE',
              FCNF = GETDATE(),
              CFDI_F_CANCELACION = COALESCE(CFDI_F_CANCELACION, GETDATE())
        WHERE IDFOL = @0`,
      [idFol],
    );
  }

  async marcarPdf(input: { idFol: string; pdfPath: string }): Promise<void> {
    await this.dataSource.query(
      `UPDATE dbo.FAC_SVR_SHAP SET CFDI_PDF_PATH = @1 WHERE IDFOL = @0`,
      [input.idFol, input.pdfPath],
    );
  }

  async marcarTimbrado(input: {
    idFol: string;
    uuid: string;
    xmlPath?: string | null;
  }): Promise<void> {
    await this.dataSource.query(
      `UPDATE dbo.FAC_SVR_SHAP
          SET CFDI_UUID = @1,
              CFDI_STATUS = 'TIMBRADO',
              CFDI_PAC = 'QUADRUM',
              CFDI_F_TIMBRADO = GETDATE(),
              -- El listado de FACTURADO ordena por FCNF, no por FCN: sin
              -- esta fecha el folio se va hasta la ultima pagina.
              FCNF = COALESCE(FCNF, GETDATE()),
              CFDI_XML_PATH = COALESCE(@2, CFDI_XML_PATH),
              CFDI_ERROR_MSG = NULL,
              -- Si el folio venia de una cancelacion, el CFDI nuevo NO esta
              -- cancelado: hay que limpiar esas marcas o todo el sistema
              -- seguiria tratandolo como tal.
              CFDI_CANCEL_STATUS = NULL,
              CFDI_F_CANCELACION = NULL,
              ESTATUS = 'FACTURADO'
        WHERE IDFOL = @0`,
      [input.idFol, input.uuid, input.xmlPath ?? null],
    );
  }

  /** Guarda el motivo del rechazo sin marcar el folio como timbrado. */
  async marcarError(input: { idFol: string; mensaje: string }): Promise<void> {
    await this.dataSource.query(
      `UPDATE dbo.FAC_SVR_SHAP
          SET CFDI_STATUS = 'ERROR',
              CFDI_PAC = 'QUADRUM',
              CFDI_ERROR_MSG = @1
        WHERE IDFOL = @0`,
      [input.idFol, input.mensaje.slice(0, 900)],
    );
  }
}
