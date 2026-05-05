import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificacionesService } from './notificaciones.service';

@ApiTags('notificaciones')
@ApiBearerAuth('jwt-auth')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query('pin') pin: string) {
    return this.service.listByPin(pin);
  }

  @Patch(':id/leida')
  @UseGuards(JwtAuthGuard)
  markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.service.markAsRead(id);
  }

  @Post('cron/run')
  @UseGuards(JwtAuthGuard)
  runCron(@Query('fecha') fecha?: string) {
    return this.service.runManual(fecha);
  }
}
