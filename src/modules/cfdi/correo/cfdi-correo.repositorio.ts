import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ConfigCorreoDb {
  AUTOMATICO: boolean | number;
  NOMBRE_REMITENTE: string;
  CUENTA_GOOGLE: string | null;
  REFRESH_TOKEN_CIFRADO: string | null;
  AUTO_ENABLED_AT: Date | string | null;
}

export interface TrabajoCorreo {
  ID: number;
  IDFOL: string;
  CFDI_UUID: string;
  DESTINATARIO_CIFRADO: string | null;
  ESTADO: string;
  INTENTOS: number;
  ULTIMO_CODIGO: string | null;
  ULTIMO_MENSAJE: string | null;
  CREADO_EN: Date | string;
  ACTUALIZADO_EN: Date | string;
  ENVIADO_EN: Date | string | null;
}

@Injectable()
export class CfdiCorreoRepositorio {
  constructor(private readonly dataSource: DataSource) {}

  async configuracion(): Promise<ConfigCorreoDb | null> {
    const rows: ConfigCorreoDb[] = await this.dataSource.query(
      'SELECT TOP (1) AUTOMATICO, NOMBRE_REMITENTE, CUENTA_GOOGLE, ' +
        'REFRESH_TOKEN_CIFRADO, AUTO_ENABLED_AT ' +
        'FROM dbo.FACT_CFDI_EMAIL_CONFIG WHERE ID = 1',
    );
    return rows?.[0] ?? null;
  }

  async guardarEstadoOAuth(hash: string): Promise<void> {
    await this.dataSource.query(
      'DELETE FROM dbo.FACT_CFDI_EMAIL_OAUTH_STATE ' +
        'WHERE EXPIRA_EN <= SYSDATETIME() OR CONSUMIDO_EN IS NOT NULL',
    );
    await this.dataSource.query(
      'INSERT INTO dbo.FACT_CFDI_EMAIL_OAUTH_STATE (HASH, EXPIRA_EN) ' +
        'VALUES (@0, DATEADD(MINUTE, 10, SYSDATETIME()))',
      [hash],
    );
  }

  async consumirEstadoOAuth(hash: string): Promise<boolean> {
    const rows: Array<{ ID: number }> = await this.dataSource.query(
      'UPDATE dbo.FACT_CFDI_EMAIL_OAUTH_STATE ' +
        'SET CONSUMIDO_EN = SYSDATETIME() ' +
        'OUTPUT INSERTED.ID ' +
        'WHERE HASH = @0 AND CONSUMIDO_EN IS NULL ' +
        'AND EXPIRA_EN > SYSDATETIME()',
      [hash],
    );
    return rows.length > 0;
  }

  async guardarCuentaGoogle(input: {
    email: string;
    refreshTokenCifrado: string;
  }): Promise<void> {
    await this.dataSource.query(
      'UPDATE dbo.FACT_CFDI_EMAIL_CONFIG ' +
        'SET CUENTA_GOOGLE = @0, REFRESH_TOKEN_CIFRADO = @1, ' +
        'ULTIMA_CONEXION = SYSDATETIME(), ACTUALIZADO_EN = SYSDATETIME() ' +
        'WHERE ID = 1',
      [input.email, input.refreshTokenCifrado],
    );
  }

  async actualizarConfiguracion(input: {
    automatico: boolean;
    nombreRemitente: string;
  }): Promise<void> {
    await this.dataSource.query(
      'UPDATE dbo.FACT_CFDI_EMAIL_CONFIG ' +
        'SET AUTO_ENABLED_AT = CASE ' +
        'WHEN @0 = 1 AND AUTOMATICO = 0 THEN SYSDATETIME() ' +
        'WHEN @0 = 0 THEN NULL ELSE AUTO_ENABLED_AT END, ' +
        'AUTOMATICO = @0, NOMBRE_REMITENTE = @1, ' +
        'ACTUALIZADO_EN = SYSDATETIME() WHERE ID = 1',
      [input.automatico, input.nombreRemitente.trim()],
    );
  }

  async insertarTrabajo(input: {
    idFol: string;
    uuid: string;
    destinatarioCifrado: string | null;
    tieneDestinatario: boolean;
    automatico: boolean;
    motivoOmitido?: string;
  }): Promise<void> {
    const estado = input.tieneDestinatario
      ? input.automatico
        ? 'PENDIENTE'
        : 'OMITIDO_DESHABILITADO'
      : 'OMITIDO_SIN_DESTINATARIO';
    const codigo = input.tieneDestinatario
      ? input.automatico
        ? null
        : 'ENVIO_DESHABILITADO'
      : 'SIN_DESTINATARIO';
    const mensaje = input.tieneDestinatario
      ? input.automatico
        ? null
        : 'El envío automático estaba deshabilitado al timbrar.'
      : input.motivoOmitido ?? 'El cliente no tiene correo registrado válido.';

    await this.dataSource.query(
      'INSERT INTO dbo.FACT_CFDI_EMAIL_OUTBOX ' +
        '(IDFOL, CFDI_UUID, DESTINATARIO_CIFRADO, ESTADO, ULTIMO_CODIGO, ULTIMO_MENSAJE) ' +
        'SELECT @0, @1, @2, @3, @4, @5 ' +
        'WHERE NOT EXISTS (' +
        'SELECT 1 FROM dbo.FACT_CFDI_EMAIL_OUTBOX WITH (UPDLOCK, HOLDLOCK) ' +
        'WHERE CFDI_UUID = @1)',
      [
        input.idFol,
        input.uuid,
        input.destinatarioCifrado,
        estado,
        codigo,
        mensaje,
      ],
    );
  }

  async trabajoSiguiente(): Promise<TrabajoCorreo | null> {
    const rows: TrabajoCorreo[] = await this.dataSource.query(
      ';WITH candidato AS (' +
        'SELECT TOP (1) * FROM dbo.FACT_CFDI_EMAIL_OUTBOX ' +
        'WITH (READPAST, UPDLOCK, ROWLOCK) ' +
        'WHERE ESTADO IN (\'PENDIENTE\', \'REINTENTABLE\') ' +
        'AND (SIGUIENTE_INTENTO_EN IS NULL OR SIGUIENTE_INTENTO_EN <= SYSDATETIME()) ' +
        'AND INTENTOS < 5 ORDER BY CREADO_EN, ID) ' +
        'UPDATE candidato SET ESTADO = \'PROCESANDO\', ' +
        'INTENTOS = INTENTOS + 1, ACTUALIZADO_EN = SYSDATETIME() ' +
        'OUTPUT INSERTED.ID, INSERTED.IDFOL, INSERTED.CFDI_UUID, ' +
        'INSERTED.DESTINATARIO_CIFRADO, INSERTED.ESTADO, INSERTED.INTENTOS, ' +
        'INSERTED.ULTIMO_CODIGO, INSERTED.ULTIMO_MENSAJE, ' +
        'INSERTED.CREADO_EN, INSERTED.ACTUALIZADO_EN, INSERTED.ENVIADO_EN',
    );
    return rows?.[0] ?? null;
  }

  async marcarEnviado(input: {
    id: number;
    messageId: string;
  }): Promise<void> {
    await this.dataSource.query(
      'UPDATE dbo.FACT_CFDI_EMAIL_OUTBOX SET ESTADO = \'ENVIADO\', ' +
        'GMAIL_MESSAGE_ID = @1, ENVIADO_EN = SYSDATETIME(), ' +
        'ACTUALIZADO_EN = SYSDATETIME(), ULTIMO_CODIGO = NULL, ' +
        'ULTIMO_MENSAJE = NULL WHERE ID = @0',
      [input.id, input.messageId],
    );
  }

  async marcarFallo(input: {
    id: number;
    estado: 'REINTENTABLE' | 'ERROR_FINAL' | 'INCIERTO';
    codigo: string;
    mensaje: string;
    intentos: number;
  }): Promise<void> {
    const demoraMinutos = Math.min(60, 2 ** Math.min(input.intentos, 6));
    await this.dataSource.query(
      'UPDATE dbo.FACT_CFDI_EMAIL_OUTBOX SET ESTADO = @1, ' +
        'ULTIMO_CODIGO = @2, ULTIMO_MENSAJE = @3, ' +
        'SIGUIENTE_INTENTO_EN = CASE WHEN @1 = \'REINTENTABLE\' ' +
        'THEN DATEADD(MINUTE, @4, SYSDATETIME()) ELSE NULL END, ' +
        'ACTUALIZADO_EN = SYSDATETIME() WHERE ID = @0',
      [
        input.id,
        input.estado,
        input.codigo,
        input.mensaje.slice(0, 500),
        demoraMinutos,
      ],
    );
  }

  async marcarProcesandoInciertoAntiguo(): Promise<void> {
    await this.dataSource.query(
      'UPDATE dbo.FACT_CFDI_EMAIL_OUTBOX SET ESTADO = \'INCIERTO\', ' +
        'ULTIMO_CODIGO = \'PROCESO_INTERRUMPIDO\', ' +
        'ULTIMO_MENSAJE = \'El proceso se interrumpió durante un envío; revisar antes de reenviar.\', ' +
        'ACTUALIZADO_EN = SYSDATETIME() ' +
        'WHERE ESTADO = \'PROCESANDO\' ' +
        'AND ACTUALIZADO_EN < DATEADD(MINUTE, -15, SYSDATETIME())',
    );
  }

  async listar(limit: number): Promise<TrabajoCorreo[]> {
    const seguro = Math.max(1, Math.min(100, Math.trunc(limit)));
    return this.dataSource.query(
        'SELECT TOP (' +
        seguro +
        ') ID, IDFOL, CFDI_UUID, DESTINATARIO_CIFRADO, ESTADO, INTENTOS, ' +
        'ULTIMO_CODIGO, ULTIMO_MENSAJE, CREADO_EN, ACTUALIZADO_EN, ENVIADO_EN ' +
        'FROM dbo.FACT_CFDI_EMAIL_OUTBOX ORDER BY CREADO_EN DESC, ID DESC',
    );
  }

  async porId(id: number): Promise<TrabajoCorreo | null> {
    const rows: TrabajoCorreo[] = await this.dataSource.query(
      'SELECT TOP (1) ID, IDFOL, CFDI_UUID, DESTINATARIO_CIFRADO, ESTADO, INTENTOS, ' +
        'ULTIMO_CODIGO, ULTIMO_MENSAJE, CREADO_EN, ACTUALIZADO_EN, ENVIADO_EN ' +
        'FROM dbo.FACT_CFDI_EMAIL_OUTBOX WHERE ID = @0',
      [id],
    );
    return rows?.[0] ?? null;
  }

  async reintentar(input: {
    id: number;
    destinatarioCifrado: string;
  }): Promise<boolean> {
    const rows: Array<{ ID: number }> = await this.dataSource.query(
      'UPDATE dbo.FACT_CFDI_EMAIL_OUTBOX SET ESTADO = \'PENDIENTE\', ' +
        'DESTINATARIO_CIFRADO = @1, INTENTOS = 0, SIGUIENTE_INTENTO_EN = NULL, ' +
        'ULTIMO_CODIGO = NULL, ULTIMO_MENSAJE = NULL, ' +
        'ACTUALIZADO_EN = SYSDATETIME() ' +
        'OUTPUT INSERTED.ID WHERE ID = @0 ' +
        'AND ESTADO IN (\'REINTENTABLE\', \'ERROR_FINAL\', \'OMITIDO_SIN_DESTINATARIO\')',
      [input.id, input.destinatarioCifrado],
    );
    return rows.length > 0;
  }

  async candidatosSinTrabajo(
    desde: Date | string,
    limit: number,
  ): Promise<Array<{ IDFOL: string; CFDI_UUID: string }>> {
    const seguro = Math.max(1, Math.min(100, Math.trunc(limit)));
    return this.dataSource.query(
      'SELECT TOP (' +
        seguro +
        ') V.IDFOL, V.CFDI_UUID FROM dbo.FAC_SVR_SHAP V ' +
        'WHERE V.CFDI_PAC = \'QUADRUM\' AND V.CFDI_STATUS = \'TIMBRADO\' ' +
        'AND NULLIF(LTRIM(RTRIM(V.CFDI_UUID)), \'\') IS NOT NULL ' +
        'AND V.CFDI_F_TIMBRADO >= @0 ' +
        'AND (V.CFDI_CANCEL_STATUS IS NULL OR V.CFDI_CANCEL_STATUS = \'\') ' +
        'AND NOT EXISTS (' +
        'SELECT 1 FROM dbo.FACT_CFDI_EMAIL_OUTBOX O WHERE O.CFDI_UUID = V.CFDI_UUID) ' +
        'ORDER BY V.CFDI_F_TIMBRADO, V.IDFOL',
      [desde],
    );
  }
}
