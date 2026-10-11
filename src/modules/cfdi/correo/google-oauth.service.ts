import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cifrar, descifrar } from '../cripto';
import { CfdiCorreoRepositorio } from './cfdi-correo.repositorio';

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

@Injectable()
export class GoogleOAuthService {
  private tokenEnMemoria?: { value: string; expiresAt: number };

  constructor(
    private readonly config: ConfigService,
    private readonly repo: CfdiCorreoRepositorio,
  ) {}

  async iniciar(): Promise<{ authorizationUrl: string }> {
    const clientId = this.oauthConfig(
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_CLIENT_ID',
    );
    const redirectUri = this.oauthConfig(
      'GOOGLE_OAUTH_REDIRECT_URI',
      'GOOGLE_REDIRECT_URI',
    );
    if (!clientId || !redirectUri) {
      throw new ServiceUnavailableException(
        'Falta configurar GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_REDIRECT_URI en la API.',
      );
    }

    const state = randomBytes(32).toString('base64url');
    await this.repo.guardarEstadoOAuth(this.hash(state));

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);

    return { authorizationUrl: url.toString() };
  }

  async completar(
    code: string,
    state: string,
  ): Promise<{ email: string }> {
    if (!code || !state || state.length > 200) {
      throw new UnauthorizedException('Respuesta OAuth incompleta.');
    }
    const estadoValido = await this.repo.consumirEstadoOAuth(this.hash(state));
    if (!estadoValido) {
      throw new UnauthorizedException(
        'La autorización expiró o ya fue utilizada. Inicia la conexión otra vez.',
      );
    }

    const clientId = this.oauthConfig(
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_CLIENT_ID',
    );
    const clientSecret = this.oauthConfig(
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_CLIENT_SECRET',
    );
    const redirectUri = this.oauthConfig(
      'GOOGLE_OAUTH_REDIRECT_URI',
      'GOOGLE_REDIRECT_URI',
    );
    const llave = this.config.get<string>('CFDI_EMAIL_TOKEN_ENCRYPTION_KEY');
    if (!clientId || !clientSecret || !redirectUri || !llave) {
      throw new ServiceUnavailableException(
        'Falta configuración segura OAuth de Google en la API.',
      );
    }

    const token = await this.intercambiarCodigo({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
    if (!token.refresh_token || !token.access_token) {
      throw new ServiceUnavailableException(
        'Google no devolvió autorización sin conexión. Revoca el permiso de la aplicación y vuelve a conectar.',
      );
    }

    const perfil = await this.perfilGoogle(token.access_token);
    const email = String(perfil.email ?? '').trim().toLowerCase();
    if (perfil.email_verified !== true || !this.esEmail(email)) {
      throw new UnauthorizedException(
        'Google no confirmó una dirección de correo válida para la cuenta autorizada.',
      );
    }

    await this.repo.guardarCuentaGoogle({
      email,
      refreshTokenCifrado: cifrar(token.refresh_token, llave),
    });
    this.tokenEnMemoria = undefined;
    return { email };
  }

  async accessToken(): Promise<string> {
    if (
      this.tokenEnMemoria &&
      this.tokenEnMemoria.expiresAt > Date.now() + 30_000
    ) {
      return this.tokenEnMemoria.value;
    }

    const clientId = this.oauthConfig(
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_CLIENT_ID',
    );
    const clientSecret = this.oauthConfig(
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_CLIENT_SECRET',
    );
    const llave = this.config.get<string>('CFDI_EMAIL_TOKEN_ENCRYPTION_KEY');
    if (!clientId || !clientSecret || !llave) {
      throw new GoogleOAuthError(
        'Falta configuración OAuth de Google en la API.',
        'OAUTH_CONFIG',
        false,
      );
    }

    const config = await this.repo.configuracion();
    if (!config?.REFRESH_TOKEN_CIFRADO) {
      throw new GoogleOAuthError(
        'No hay una cuenta Gmail conectada.',
        'OAUTH_SIN_CUENTA',
        false,
      );
    }

    let refreshToken: string;
    try {
      refreshToken = descifrar(config.REFRESH_TOKEN_CIFRADO, llave);
    } catch {
      throw new GoogleOAuthError(
        'No se pudo abrir la credencial Google guardada.',
        'OAUTH_TOKEN_CIFRADO',
        false,
      );
    }

    let response: Response;
    try {
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GoogleOAuthError(
        'No fue posible renovar el acceso a Google.',
        'OAUTH_RED',
        true,
      );
    }

    const body = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !body.access_token) {
      const retryable = response.status >= 500 || response.status === 429;
      throw new GoogleOAuthError(
        response.status === 400 || response.status === 401
          ? 'Google rechazó la autorización guardada. Reconecta la cuenta.'
          : 'Google no permitió renovar la autorización.',
        response.status === 400 || response.status === 401
          ? 'OAUTH_REAUTORIZAR'
          : 'OAUTH_RENOVACION',
        retryable,
      );
    }

    const expiresIn = Math.max(60, Number(body.expires_in ?? 3600));
    this.tokenEnMemoria = {
      value: body.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return body.access_token;
  }

  private async intercambiarCodigo(input: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<TokenResponse> {
    let response: Response;
    try {
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: input.code,
          client_id: input.clientId,
          client_secret: input.clientSecret,
          redirect_uri: input.redirectUri,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'No fue posible completar la conexión con Google. Intenta otra vez.',
      );
    }

    const body = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok) {
      throw new UnauthorizedException(
        'Google rechazó el código OAuth. Inicia la conexión otra vez.',
      );
    }
    return body;
  }

  private async perfilGoogle(accessToken: string): Promise<{
    email?: string;
    email_verified?: boolean;
  }> {
    let response: Response;
    try {
      response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo verificar la cuenta Google autorizada.',
      );
    }
    if (!response.ok) {
      throw new UnauthorizedException(
        'No se pudo verificar la cuenta Google autorizada.',
      );
    }
    return (await response.json()) as {
      email?: string;
      email_verified?: boolean;
    };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private oauthConfig(primary: string, legacy: string): string | undefined {
    return (
      this.config.get<string>(primary) ||
      this.config.get<string>(legacy)
    );
  }

  private esEmail(value: string): boolean {
    return (
      value.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
      !/[\r\n]/.test(value)
    );
  }
}
