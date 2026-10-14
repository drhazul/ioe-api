import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  GoogleOAuthError,
  GoogleOAuthService,
} from './google-oauth.service';
import { AdjuntoCorreo, MensajeCorreo, ProveedorCorreo } from './proveedor-correo';

export class ErrorEntregaCorreo extends Error {
  constructor(
    message: string,
    readonly codigo: string,
    readonly tipo: 'REINTENTABLE' | 'ERROR_FINAL' | 'INCIERTO',
  ) {
    super(message);
    this.name = 'ErrorEntregaCorreo';
  }
}

@Injectable()
export class GmailProvider implements ProveedorCorreo {
  // MIME base64 increases binary size by roughly one third. Keep raw files
  // under Gmail's 25 MB attachment ceiling, including message overhead.
  private readonly maxBytes = 17 * 1024 * 1024;

  constructor(private readonly oauth: GoogleOAuthService) {}

  async enviar(mensaje: MensajeCorreo): Promise<string> {
    const bytesAdjuntos = (mensaje.adjuntos ?? []).reduce(
      (total, adjunto) => total + adjunto.contenido.length,
      0,
    );
    if (bytesAdjuntos > this.maxBytes) {
      throw new ErrorEntregaCorreo(
        'Los documentos exceden el tamaño máximo del envío.',
        'ADJUNTOS_EXCEDIDOS',
        'ERROR_FINAL',
      );
    }
    if (!this.esEmail(mensaje.para) || !this.esEmail(mensaje.desde)) {
      throw new ErrorEntregaCorreo(
        'La cuenta emisora o destinataria no es válida.',
        'EMAIL_INVALIDO',
        'ERROR_FINAL',
      );
    }

    const raw = this.crearMime(mensaje);
    let accessToken: string;
    try {
      accessToken = await this.oauth.accessToken();
    } catch (error) {
      if (error instanceof GoogleOAuthError) {
        throw new ErrorEntregaCorreo(
          error.message,
          error.code,
          error.retryable ? 'REINTENTABLE' : 'ERROR_FINAL',
        );
      }
      throw new ErrorEntregaCorreo(
        'No se pudo preparar la autorización de Gmail.',
        'OAUTH_ERROR',
        'ERROR_FINAL',
      );
    }

    let response: Response;
    try {
      response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      throw new ErrorEntregaCorreo(
        'El resultado del envío no se pudo confirmar. Revisar antes de reenviar.',
        'ENVIO_RESULTADO_INCIERTO',
        'INCIERTO',
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null) as {
        error?: { errors?: { reason?: unknown }[] };
      } | null;
      // Only known provider codes are retained. Never persist raw Google
      // messages, which can contain account addresses or request data.
      const permitidos = new Set(['rateLimitExceeded', 'userRateLimitExceeded',
        'dailyLimitExceeded', 'domainPolicy', 'insufficientPermissions',
        'forbidden', 'accessNotConfigured', 'authError']);
      const razones = (Array.isArray(body?.error?.errors) ? body.error.errors : [])
        .map(item => item?.reason)
        .filter((reason): reason is string => typeof reason === 'string' && permitidos.has(reason));
      const detalle = [...new Set(razones)].slice(0, 4).join(',');
      const retryable = response.status === 429 || razones.some(reason =>
        ['rateLimitExceeded', 'userRateLimitExceeded'].includes(reason));
      const uncertain = response.status === 408 || response.status >= 500;
      throw new ErrorEntregaCorreo(
        retryable
          ? 'Gmail no aceptó el envío por una falla temporal.'
          : uncertain
            ? 'Gmail devolvió un resultado incierto. Revisar antes de reenviar.'
            : 'Gmail rechazó el envío; revisar cuenta y permisos.' +
              (detalle ? ' Motivo Google: ' + detalle + '.' : ''),
        'GMAIL_HTTP_' + response.status,
        retryable ? 'REINTENTABLE' : uncertain ? 'INCIERTO' : 'ERROR_FINAL',
      );
    }

    const result = (await response.json().catch(() => ({}))) as {
      id?: string;
    };
    if (!result.id) {
      throw new ErrorEntregaCorreo(
        'Gmail respondió sin confirmar el identificador del mensaje. Revisar antes de reenviar.',
        'GMAIL_RESPUESTA_INCOMPLETA',
        'INCIERTO',
      );
    }
    return result.id;
  }

  private crearMime(mensaje: MensajeCorreo): string {
    const boundary = 'ioe_' + randomBytes(18).toString('hex');
    const lineas = [
      'From: ' +
        this.codificarHeader(mensaje.nombreRemitente) +
        ' <' +
        mensaje.desde +
        '>',
      'To: ' + mensaje.para,
      'Subject: ' + this.codificarHeader(mensaje.asunto),
      'MIME-Version: 1.0',
    ];

    if (!(mensaje.adjuntos?.length)) {
      lineas.push(
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        this.base64EnLineas(Buffer.from(mensaje.texto, 'utf8')),
      );
      return Buffer.from(lineas.join('\r\n'), 'utf8').toString('base64url');
    }

    lineas.push(
      'Content-Type: multipart/mixed; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      this.base64EnLineas(Buffer.from(mensaje.texto, 'utf8')),
    );

    for (const adjunto of mensaje.adjuntos) {
      const nombre = this.nombreSeguro(adjunto.nombre);
      lineas.push(
        '--' + boundary,
        'Content-Type: ' + this.tipoSeguro(adjunto.tipo),
        'Content-Transfer-Encoding: base64',
        'Content-Disposition: attachment; filename="' + nombre + '"',
        '',
        this.base64EnLineas(adjunto.contenido),
      );
    }
    lineas.push('--' + boundary + '--', '');
    return Buffer.from(lineas.join('\r\n'), 'utf8').toString('base64url');
  }

  private codificarHeader(value: string): string {
    const seguro = value.replace(/[\r\n]+/g, ' ').trim();
    return '=?UTF-8?B?' + Buffer.from(seguro, 'utf8').toString('base64') + '?=';
  }

  private nombreSeguro(value: string): string {
    const nombre = value
      .replace(/[\r\n"\\]/g, '_')
      .replace(/[^\w.-]/g, '_')
      .slice(0, 120);
    return nombre || 'documento';
  }

  private tipoSeguro(value: string): string {
    return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(value)
      ? value
      : 'application/octet-stream';
  }

  private base64EnLineas(value: Buffer): string {
    const base64 = value.toString('base64');
    return base64.match(/.{1,76}/g)?.join('\r\n') ?? '';
  }

  private esEmail(value: string): boolean {
    return (
      value.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
      !/[\r\n]/.test(value)
    );
  }
}
