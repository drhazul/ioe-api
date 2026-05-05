import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // --- ESTA ES LA RUTA MANUAL QUE FALTA ---
  @Get('health')
  checkHealth() {
    return { 
      status: 'ok', 
      message: 'Servidor IOE funcionando correctamente' 
    };
  }
}