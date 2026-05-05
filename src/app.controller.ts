import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

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
    return {
      status: 'ok',
      message: 'Conexión exitosa desde Codex',
      timestamp: new Date().toISOString(),
      service: 'IOE-API'
    };
  }
}
