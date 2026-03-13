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
      'https://api.facturify.com'
    );
  }

  private getApiKey() {
    return this.config.get<string>('FACTURIFY_API_KEY') || '';
  }

  private getApiSecret() {
    return this.config.get<string>('FACTURIFY_API_SECRET') || '';
  }

  private getStampPath() {
    return this.config.get<string>('FACTURIFY_STAMP_PATH') || '/api/v1/invoice';
  }

  private getCancelPath() {
    return (
      this.config.get<string>('FACTURIFY_CANCEL_PATH') ||
      '/api/v1/invoice/cancel'
    );
  }

  private getEmailPath() {
    return (
      this.config.get<string>('FACTURIFY_EMAIL_PATH') ||
      '/api/v1/invoice/email'
    );
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

  async listEmpresas() {
    const auth = await this.requestToken();
    const resp = await fetch(
      `${this.getBaseUrl()}/api/v1/empresa/?page=1&limit=200&orderBy=created_at&sort=ASC&search=`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'cache-control': 'no-cache',
        },
      },
    );

    const raw = await resp.text();
    let data: any = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // keep raw text
    }

    return {
      ok: resp.ok,
      status: resp.status,
      data,
    };
  }

  async stampInvoice(payload: Record<string, unknown>) {
    const auth = await this.requestToken();
    const resp = await fetch(`${this.getBaseUrl()}${this.getStampPath()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify(payload),
    });

    const raw = await resp.text();
    let data: any = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // keep raw text
    }

    return {
      ok: resp.ok,
      status: resp.status,
      data,
    };
  }

  async cancelInvoice(payload: Record<string, unknown>) {
    const auth = await this.requestToken();
    const resp = await fetch(`${this.getBaseUrl()}${this.getCancelPath()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify(payload),
    });

    const raw = await resp.text();
    let data: any = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // keep raw text
    }

    return {
      ok: resp.ok,
      status: resp.status,
      data,
    };
  }

  async sendInvoiceEmail(payload: Record<string, unknown>) {
    const auth = await this.requestToken();
    const resp = await fetch(`${this.getBaseUrl()}${this.getEmailPath()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify(payload),
    });

    const raw = await resp.text();
    let data: any = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // keep raw text
    }

    return {
      ok: resp.ok,
      status: resp.status,
      data,
    };
  }
}
