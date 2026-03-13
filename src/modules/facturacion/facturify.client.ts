import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FacturifyClient {
  constructor(private readonly config: ConfigService) {}

  getBaseUrl() {
    return (
      this.config.get<string>('FACTURIFY_BASE_URL') ||
      'https://api-sandbox.facturify.com'
    );
  }

  private getApiKey() {
    return this.config.get<string>('FACTURIFY_API_KEY') || '';
  }

  private getApiSecret() {
    return this.config.get<string>('FACTURIFY_API_SECRET') || '';
  }

  hasCredentials() {
    return Boolean(this.getApiKey() && this.getApiSecret());
  }

  assertCredentials() {
    if (!this.hasCredentials()) {
      throw new ServiceUnavailableException(
        'Facturify no configurado: faltan FACTURIFY_API_KEY y/o FACTURIFY_API_SECRET',
      );
    }
  }

  async requestToken() {
    this.assertCredentials();

    const resp = await fetch(`${this.getBaseUrl()}/api/v1/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.getApiKey(),
        api_secret: this.getApiSecret(),
      }),
    });

    const payload = (await resp.json().catch(() => ({}))) as any;
    if (!resp.ok) {
      throw new UnauthorizedException(
        `Facturify auth falló (${resp.status}): ${payload?.message ?? 'sin detalle'}`,
      );
    }

    const token = payload?.jwt?.token as string | undefined;
    if (!token) {
      throw new UnauthorizedException(
        'Facturify auth sin token en respuesta',
      );
    }

    return {
      token,
      expiresIn: Number(payload?.jwt?.expires_in ?? 0),
    };
  }
}
