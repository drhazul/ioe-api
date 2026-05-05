import {
  Body,
  Controller,
  Delete,
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
import { CreateHorarioDto } from './dto/create-horario.dto';
import { CreateTurnoCatalogoDto } from './dto/create-turno-catalogo.dto';
import { SetHorarioConfirmacionDto } from './dto/set-horario-confirmacion.dto';
import { UpdateHorarioDto } from './dto/update-horario.dto';
import { HorariosService } from './horarios.service';

@ApiTags('horarios')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('horarios')
export class HorariosController {
  constructor(private readonly service: HorariosService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('semana')
  weekly(
    @Query('week_start') weekStart?: string,
    @Query('sucursal') sucursal?: string,
    @Query('departamento') departamento?: string,
  ) {
    return this.service.getWeeklySchedule({ weekStart, sucursal, departamento });
  }

  @Post('semana/generar')
  generateNextWeek() {
    return this.service.generateNextWeekSchedules();
  }

  @Get('turnos-catalogo')
  findTurnosCatalogo() {
    return this.service.findTurnosCatalogo();
  }

  @Post('turnos-catalogo')
  createTurnoCatalogo(@Body() dto: CreateTurnoCatalogoDto) {
    return this.service.createTurnoCatalogo(dto);
  }

  @Post('confirmacion')
  setConfirmacion(@Body() dto: SetHorarioConfirmacionDto) {
    return this.service.setConfirmacion(dto);
  }

  @Post()
  create(@Body() dto: CreateHorarioDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHorarioDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
