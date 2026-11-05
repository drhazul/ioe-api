import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { businessFromInstant } from './common/time/fecha-negocio';
import { ZONA_NEGOCIO_DEFAULT } from './common/time/fecha-zona';

@Controller()
export class AppController {
  // El constructor conecta este controlador con la lógica de negocio
  constructor(private readonly appService: AppService) {}

  // Esta es la ruta principal (http://localhost:3001/)
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // --- ESTO ES LO QUE NECESITA TU APP DE FLUTTER ---
  // Cuando Flutter pregunte por /health, el servidor responderá que está "ok"
  @Get('health')
  checkHealth() {
    const now = new Date();
    return {
      status: 'ok',
      message: 'Conexión exitosa desde Codex',
      timestamp: now.toISOString(),
      timeZone: ZONA_NEGOCIO_DEFAULT,
      businessDateTime: businessFromInstant(now),
      service: 'IOE-API',
    };
  }
}
