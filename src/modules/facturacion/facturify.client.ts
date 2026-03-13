import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FacturifyClient {
  constructor(private readonly config: ConfigService) {}

  getBaseUrl() {
    return this.config.get<string>('FACTURIFY_BASE_URL') || 'https://api-sandbox.facturify.com';
  }

  hasCredentials() {
    return Boolean(
      this.config.get<string>('FACTURIFY_API_KEY') &&
        this.config.get<string>('FACTURIFY_API_SECRET'),
    );
  }

  assertCredentials() {
    if (!this.hasCredentials()) {
      throw new ServiceUnavailableException(
        'Facturify no configurado: faltan FACTURIFY_API_KEY y/o FACTURIFY_API_SECRET',
      );
    }
  }
}
