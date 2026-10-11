import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleOAuthService } from './google-oauth.service';

@Controller('auth/google')
export class GoogleOAuthCallbackController {
  private readonly logger = new Logger(GoogleOAuthCallbackController.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      \"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'\",
    );

    if (error || !code || !state) {
      response.status(400).type('html').send(this.pagina(false));
      return;
    }

    try {
      await this.oauth.completar(code, state);
      response.status(200).type('html').send(this.pagina(true));
    } catch {
      this.logger.warn('No se pudo completar la vinculación de Gmail OAuth.');
      response.status(400).type('html').send(this.pagina(false));
    }
  }

  private pagina(exito: boolean): string {
    const titulo = exito ? 'Gmail conectado' : 'No se pudo conectar Gmail';
    const texto = exito
      ? 'Puedes cerrar esta pestaña y volver a FACTURA_QUADRUM.'
      : 'Cierra esta pestaña, revisa la configuración y vuelve a iniciar la conexión.';
    return (
      '<!doctype html><html lang=\"es\"><meta charset=\"utf-8\">' +
      '<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">' +
      '<title>' +
      titulo +
      '</title><body style=\"font-family:Arial,sans-serif;margin:3rem;max-width:36rem\">' +
      '<h1>' +
      titulo +
      '</h1><p>' +
      texto +
      '</p></body></html>'
    );
  }
}
