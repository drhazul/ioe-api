import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { businessFromInstant } from './fecha-negocio';

@Injectable()
export class BusinessClockService implements OnModuleInit {
  private validUntil = 0;
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  get required(): boolean {
    if (
      this.config.get('DB_NAME') === 'IOELOCAL' ||
      this.config.get('NODE_ENV') === 'production'
    )
      return true;
    return (
      String(this.config.get('IOE_REQUIRE_CDMX_SQL_CLOCK') ?? 'false') ===
      'true'
    );
  }

  async onModuleInit() {
    if (this.required) await this.assertReady();
  }

  /** Guardia transversal de escrituras: no aceptar operación con SQL en otra zona. */
  async assertReady() {
    if (!this.required || Date.now() < this.validUntil) return;
    try {
      const [row] = await this.db.query(`SELECT
        CONVERT(varchar(33), GETDATE(), 126) AS localWall,
        CONVERT(varchar(33), SYSUTCDATETIME(), 126) AS utcWall,
        CURRENT_TIMEZONE_ID() AS zoneId`);
      const expected = businessFromInstant(new Date(`${row.utcWall}Z`));
      const errorMs = Math.abs(
        Date.parse(`${row.localWall}Z`) - Date.parse(`${expected}Z`),
      );
      if (
        row.zoneId !== 'Central Standard Time (Mexico)' ||
        !Number.isFinite(errorMs) ||
        errorMs > 2000
      ) {
        throw new Error('SQL no cumple contrato horario CDMX');
      }
      this.validUntil = Date.now() + 5000;
    } catch {
      this.validUntil = 0;
      throw new ServiceUnavailableException(
        'Reloj SQL fuera del contrato CDMX; operación detenida. Revisar mantenimiento de zona horaria.',
      );
    }
  }
}
