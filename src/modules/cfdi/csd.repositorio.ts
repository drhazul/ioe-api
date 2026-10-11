import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Un renglon de FACT_CSD, con los archivos y la contrasena cifrada. */
export interface FilaCsd {
  RFC: string;
  NOMBRE: string | null;
  NO_CERTIFICADO: string;
  REGIMEN_FISCAL: string;
  CODIGO_POSTAL: string;
  CER: Buffer;
  LLAVE: Buffer;
  PASSWORD_CIFRADA: string;
  VIGENCIA_DESDE: Date;
  VIGENCIA_HASTA: Date;
  /** Cuenta de Quadrum de esta razon social. Nulo = se usa la del .env. */
  QUADRUM_USUARIO: string | null;
  QUADRUM_PASSWORD_CIFRADA: string | null;
}

/** Lo que se puede mostrar: sin archivos ni contrasena. */
export interface ResumenFilaCsd {
  rfc: string;
  nombre: string | null;
  noCertificado: string;
  regimenFiscal: string;
  codigoPostal: string;
  validoDesde: Date;
  validoHasta: Date;
  activo: boolean;
  fechaAlta: Date;
  usuarioAlta: string | null;
  /** Cuenta del PAC. Se muestra para saber con cual timbra cada RFC. */
  quadrumUsuario: string | null;
}

export interface GuardarFilaCsd {
  rfc: string;
  nombre?: string;
  noCertificado: string;
  regimenFiscal: string;
  codigoPostal: string;
  cer: Buffer;
  llave: Buffer;
  passwordCifrada: string;
  vigenciaDesde: Date;
  vigenciaHasta: Date;
  usuario?: string;
  /** Cuenta de Quadrum. Si no viene, se conserva la que ya estuviera. */
  quadrumUsuario?: string | null;
  quadrumPasswordCifrada?: string | null;
}

/**
 * Acceso a FACT_CSD.
 *
 * Aparte para que el servicio no mezcle SQL con criptografia, y para poder
 * probarlo con un doble sin tocar la base.
 */
@Injectable()
export class CsdRepositorio {
  constructor(private readonly dataSource: DataSource) {}

  /** Mensaje util en vez de un error de SQL si nadie corrio el script. */
  private async assertTabla(): Promise<void> {
    const rows: { existe: number }[] = await this.dataSource.query(
      `SELECT CASE WHEN OBJECT_ID('dbo.FACT_CSD', 'U') IS NULL THEN 0 ELSE 1 END AS existe`,
    );
    if (!rows?.[0]?.existe) {
      throw new ServiceUnavailableException(
        'No existe dbo.FACT_CSD. Ejecuta sql/2026-09-22_fact_csd.sql',
      );
    }
  }

  /** El certificado vigente de un RFC, o `null` si no tiene. */
  async activoPorRfc(rfc: string): Promise<FilaCsd | null> {
    await this.assertTabla();
    const rows: FilaCsd[] = await this.dataSource.query(
      `SELECT TOP 1 RFC, NOMBRE, NO_CERTIFICADO, REGIMEN_FISCAL, CODIGO_POSTAL,
              CER, LLAVE, PASSWORD_CIFRADA, VIGENCIA_DESDE, VIGENCIA_HASTA,
              QUADRUM_USUARIO, QUADRUM_PASSWORD_CIFRADA
         FROM dbo.FACT_CSD
        WHERE RFC = @0 AND ACTIVO = 1`,
      [rfc.trim().toUpperCase()],
    );
    return rows?.[0] ?? null;
  }

  async listar(): Promise<ResumenFilaCsd[]> {
    await this.assertTabla();
    const rows: {
      RFC: string;
      NOMBRE: string | null;
      NO_CERTIFICADO: string;
      REGIMEN_FISCAL: string;
      CODIGO_POSTAL: string;
      VIGENCIA_DESDE: Date;
      VIGENCIA_HASTA: Date;
      ACTIVO: boolean;
      FCN_ALTA: Date;
      USUARIO_ALTA: string | null;
      QUADRUM_USUARIO: string | null;
    }[] = await this.dataSource.query(
      `SELECT RFC, NOMBRE, NO_CERTIFICADO, REGIMEN_FISCAL, CODIGO_POSTAL,
              VIGENCIA_DESDE, VIGENCIA_HASTA, ACTIVO, FCN_ALTA, USUARIO_ALTA,
              QUADRUM_USUARIO
         FROM dbo.FACT_CSD
        ORDER BY RFC, ACTIVO DESC, VIGENCIA_HASTA DESC`,
    );
    return (rows ?? []).map((r) => ({
      rfc: r.RFC,
      nombre: r.NOMBRE,
      noCertificado: r.NO_CERTIFICADO,
      regimenFiscal: r.REGIMEN_FISCAL,
      codigoPostal: r.CODIGO_POSTAL,
      validoDesde: r.VIGENCIA_DESDE,
      validoHasta: r.VIGENCIA_HASTA,
      activo: Boolean(r.ACTIVO),
      fechaAlta: r.FCN_ALTA,
      quadrumUsuario: r.QUADRUM_USUARIO,
      usuarioAlta: r.USUARIO_ALTA,
    }));
  }

  /**
   * Da de alta un certificado y desactiva el anterior del mismo RFC, todo en
   * una transaccion: si algo falla, el RFC no se queda sin certificado activo.
   */
  async guardar(fila: GuardarFilaCsd): Promise<void> {
    await this.assertTabla();
    const rfc = fila.rfc.trim().toUpperCase();

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE dbo.FACT_CSD SET ACTIVO = 0 WHERE RFC = @0 AND ACTIVO = 1`,
        [rfc],
      );

      const parametros = [
        rfc,
        fila.noCertificado,
        fila.nombre ?? null,
        fila.regimenFiscal,
        fila.codigoPostal,
        fila.cer,
        fila.llave,
        fila.passwordCifrada,
        fila.vigenciaDesde,
        fila.vigenciaHasta,
        fila.usuario ?? null,
        fila.quadrumUsuario ?? null,
        fila.quadrumPasswordCifrada ?? null,
      ];

      // Recargar el mismo certificado (por ejemplo tras corregir el CP) no
      // debe duplicar el renglon: el indice unico (RFC, NO_CERTIFICADO) lo
      // impide, asi que se actualiza.
      await manager.query(
        `IF EXISTS (SELECT 1 FROM dbo.FACT_CSD WHERE RFC = @0 AND NO_CERTIFICADO = @1)
           UPDATE dbo.FACT_CSD
              SET NOMBRE = @2, REGIMEN_FISCAL = @3, CODIGO_POSTAL = @4,
                  CER = @5, LLAVE = @6, PASSWORD_CIFRADA = @7,
                  VIGENCIA_DESDE = @8, VIGENCIA_HASTA = @9,
                  ACTIVO = 1, FCN_ALTA = SYSDATETIME(), USUARIO_ALTA = @10,
                  -- Recargar el certificado sin recapturar la cuenta no
                  -- debe borrarla: solo se pisa si viene una nueva.
                  QUADRUM_USUARIO = COALESCE(@11, QUADRUM_USUARIO),
                  QUADRUM_PASSWORD_CIFRADA =
                    COALESCE(@12, QUADRUM_PASSWORD_CIFRADA)
            WHERE RFC = @0 AND NO_CERTIFICADO = @1;
         ELSE
           INSERT INTO dbo.FACT_CSD
             (RFC, NO_CERTIFICADO, NOMBRE, REGIMEN_FISCAL, CODIGO_POSTAL,
              CER, LLAVE, PASSWORD_CIFRADA, VIGENCIA_DESDE, VIGENCIA_HASTA,
              ACTIVO, USUARIO_ALTA, QUADRUM_USUARIO, QUADRUM_PASSWORD_CIFRADA)
           VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, 1, @10, @11, @12);`,
        parametros,
      );
    });
  }
}
