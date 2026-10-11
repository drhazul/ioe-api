import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CfdiCorreoService } from './cfdi-correo.service';

@Injectable()
export class CfdiCorreoWorker {
  private readonly logger = new Logger(CfdiCorreoWorker.name);
  private advirtioError = false;

  constructor(private readonly correo: CfdiCorreoService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async procesar(): Promise<void> {
    try {
      await this.correo.procesarPendientes();
      this.advirtioError = false;
    } catch {
      if (!this.advirtioError) {
        this.logger.warn(
          'Worker de correo inactivo: revisa la migración y configuración de FACTURA_QUADRUM.',
        );
        this.advirtioError = true;
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async reconciliar(): Promise<void> {
    try {
      await this.correo.reconciliar();
    } catch {
      this.logger.warn(
        'No se pudo reconciliar la cola de correo de FACTURA_QUADRUM.',
      );
    }
  }
}
