import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AusenciasCalendarioDto } from './dto/ausencias-calendario.dto';
import { CreateSolicitudDto } from './dto/create-solicitud.dto';
import { ListSolicitudesDto } from './dto/list-solicitudes.dto';
import { UpdateSolicitudEstatusDto } from './dto/update-solicitud-estatus.dto';
import { VacacionesDashboardDto } from './dto/vacaciones-dashboard.dto';
import { IncidenciasVacacionesService } from './incidencias-vacaciones.service';

@ApiTags('incidencias-vacaciones')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('incidencias')
export class IncidenciasVacacionesController {
  constructor(private readonly service: IncidenciasVacacionesService) {}

  @Get('tipos')
  findTipos() {
    return this.service.findTipos();
  }

  @Post('solicitudes')
  createSolicitud(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSolicitudDto,
    @Req() req: any,
  ) {
    return this.service.createSolicitud(dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Get('solicitudes')
  listSolicitudes(@Query() query: ListSolicitudesDto) {
    return this.service.listSolicitudes(query);
  }

  @Patch('solicitudes/:id/estatus')
  updateSolicitudEstatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSolicitudEstatusDto,
    @Req() req: any,
  ) {
    return this.service.updateSolicitudEstatus(id, dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Get('calendario')
  getAusenciasCalendario(@Query() query: AusenciasCalendarioDto) {
    return this.service.getAusenciasCalendario(query);
  }

  @Get('dashboard/:colaboradorId')
  getVacacionesDashboard(
    @Param('colaboradorId', ParseIntPipe) colaboradorId: number,
    @Query() query: VacacionesDashboardDto,
  ) {
    return this.service.getVacationDashboard(colaboradorId, query.anio);
  }

  @Post('evidencia')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadEvidencia(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.service.uploadEvidencia(file, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  private requestIp(req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return ip ? String(ip) : null;
  }
}
