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
    return this.config.get<string>('FACTURIFY_STAMP_PATH') || '/api/v1/factura';
  }

  private getCancelPath() {
    const configured = String(
      this.config.get<string>('FACTURIFY_CANCEL_PATH') || '',
    ).trim();
    if (configured.length) return configured;
    return '/api/v1/factura/{cfdi_uuid}/cancel/';
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

  private buildCancelUrl(cfdiUuid: string) {
    const baseUrl = this.getBaseUrl().replace(/\/+$/, '');
    const rawPath = this.getCancelPath().trim();
    const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

    if (normalizedPath.includes('{cfdi_uuid}')) {
      const resolved = normalizedPath.replace(
        '{cfdi_uuid}',
        encodeURIComponent(cfdiUuid),
      );
      return `${baseUrl}${resolved}`;
    }

    // Compatibilidad con configuración legacy (ruta fija /invoice/cancel).
    if (/\/api\/v1\/invoice\/cancel\/?$/i.test(normalizedPath)) {
      return `${baseUrl}/api/v1/factura/${encodeURIComponent(cfdiUuid)}/cancel/`;
    }

    // Si se configuró una ruta ya dinámica, la usamos tal cual.
    if (
      /\/api\/v1\/factura\/[^/]+\/cancel\/?$/i.test(normalizedPath) ||
      /\/cancel\/?$/i.test(normalizedPath)
    ) {
      return `${baseUrl}${normalizedPath}`;
    }

    return `${baseUrl}${normalizedPath.replace(/\/+$/, '')}/${encodeURIComponent(cfdiUuid)}/cancel/`;
  }

  async cancelInvoice(payload: Record<string, unknown>) {
    const auth = await this.requestToken();
    const cfdiUuid = String(payload?.cfdi_uuid ?? '').trim();
    if (!cfdiUuid) {
      throw new ServiceUnavailableException(
        'Facturify cancelación requiere cfdi_uuid',
      );
    }
    const cancelUrl = this.buildCancelUrl(cfdiUuid);
    const resp = await fetch(cancelUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        'cache-control': 'no-cache',
      },
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

  async getInvoiceByUuid(cfdiUuid: string) {
    const auth = await this.requestToken();
    const resp = await fetch(`${this.getBaseUrl()}/api/v1/factura/${cfdiUuid}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'cache-control': 'no-cache',
      },
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

  async listFacturas(params?: {
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    search?: string;
  }) {
    const auth = await this.requestToken();
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const from = params?.from ?? '2018-01-01';
    const to =
      params?.to ?? new Date().toISOString().slice(0, 10);
    const search = encodeURIComponent(params?.search ?? '');

    const url = `${this.getBaseUrl()}/api/v1/factura/?page=${page}&limit=${limit}&orderBy=created_at&sort=DESC&from=${from}&to=${to}&search=${search}&invoiceType&invoiceSource&download=&empresa_session_rfc=&include=documentos_relacionados`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'cache-control': 'no-cache',
      },
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

  private buildInvoiceAssetUrl(cfdiUuid: string, asset: 'pdf' | 'xml') {
    const base = this.getBaseUrl().replace(/\/+$/, '');
    const uuid = encodeURIComponent(String(cfdiUuid ?? '').trim());
    const suffix = asset === 'pdf' ? '/pdf/' : '/xml';
    return `${base}/api/v1/factura/${uuid}${suffix}`;
  }

  private parseJsonSafe(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async getInvoicePdf(cfdiUuid: string) {
    const auth = await this.requestToken();
    const url = this.buildInvoiceAssetUrl(cfdiUuid, 'pdf');
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'cache-control': 'no-cache',
      },
    });

    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = String(resp.headers.get('content-type') ?? '').toLowerCase();
    const rawText = buffer.toString('utf8');

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        data: this.parseJsonSafe(rawText) ?? rawText,
      };
    }

    if (contentType.includes('application/json')) {
      const parsed = this.parseJsonSafe(rawText) ?? {};
      const data = parsed?.data ?? {};
      const candidates = [
        parsed?.pdf,
        parsed?.PDF,
        data?.pdf,
        data?.PDF,
      ];
      const pdfBase64 = candidates.find(
        (item) => typeof item === 'string' && item.trim().length > 0,
      ) as string | undefined;
      if (pdfBase64) {
        return {
          ok: true,
          status: resp.status,
          pdfBase64: pdfBase64.trim(),
          contentType,
          data: parsed,
        };
      }
      return {
        ok: false,
        status: 502,
        data: parsed,
      };
    }

    return {
      ok: true,
      status: resp.status,
      pdfBase64: buffer.toString('base64'),
      contentType,
    };
  }

  async getInvoiceXml(cfdiUuid: string) {
    const auth = await this.requestToken();
    const url = this.buildInvoiceAssetUrl(cfdiUuid, 'xml');
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'cache-control': 'no-cache',
      },
    });

    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType = String(resp.headers.get('content-type') ?? '').toLowerCase();
    const rawText = buffer.toString('utf8');

    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        data: this.parseJsonSafe(rawText) ?? rawText,
      };
    }

    if (contentType.includes('application/json')) {
      const parsed = this.parseJsonSafe(rawText) ?? {};
      const data = parsed?.data ?? {};
      const candidates = [
        parsed?.xml,
        parsed?.XML,
        data?.xml,
        data?.XML,
      ];
      const xmlText = candidates.find(
        (item) => typeof item === 'string' && item.trim().length > 0,
      ) as string | undefined;
      if (xmlText) {
        const normalized = xmlText.trim();
        const xmlBase64 = normalized.startsWith('<')
          ? Buffer.from(normalized, 'utf8').toString('base64')
          : normalized;
        return {
          ok: true,
          status: resp.status,
          xmlBase64,
          contentType,
          data: parsed,
        };
      }
      return {
        ok: false,
        status: 502,
        data: parsed,
      };
    }

    return {
      ok: true,
      status: resp.status,
      xmlBase64: buffer.toString('base64'),
      contentType,
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
