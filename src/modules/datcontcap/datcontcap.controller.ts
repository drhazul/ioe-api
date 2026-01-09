import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreateDatContCapDto } from './dto/create-datcontcap.dto';
import { ListDatContCapDto } from './dto/list-datcontcap.dto';
import { SummaryDatContCapDto } from './dto/summary-datcontcap.dto';
import { DatContCapService } from './datcontcap.service';

@ApiTags('capturas')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('capturas')
export class DatContCapController {
  constructor(private readonly service: DatContCapService) {}

  @Get('conteos-disponibles')
  getConteosDisponibles(@CurrentUser() user: JwtPayload) {
    return this.service.conteosDisponibles(user);
  }

  @Get()
  listar(@Query() query: ListDatContCapDto, @CurrentUser() user: JwtPayload) {
    return this.service.listarCapturas(query, user);
  }

  @Post()
  crearCaptura(@Body() dto: CreateDatContCapDto, @CurrentUser() user: JwtPayload) {
    return this.service.capturar(dto, user);
  }

  @Get('summary')
  summary(@Query() query: SummaryDatContCapDto, @CurrentUser() user: JwtPayload) {
    return this.service.resumen(query.cont, user, query.suc);
  }

  // Alias mantenido para compatibilidad
  @Get('resumen')
  resumen(@Query() query: SummaryDatContCapDto, @CurrentUser() user: JwtPayload) {
    return this.service.resumen(query.cont, user, query.suc);
  }
}
