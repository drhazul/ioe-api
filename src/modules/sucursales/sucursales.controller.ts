import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  ParseIntPipe,
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
import { AdmsPushDto } from './dto/adms-push.dto';
import { CleanupComandosDto } from './dto/cleanup-comandos.dto';
import { CleanupFotosDto } from './dto/cleanup-fotos.dto';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { ImportUsbDto } from './dto/import-usb.dto';
import { KioscoVisitaDto } from './dto/kiosco-visita.dto';
import { SucursalCommandDto } from './dto/sucursal-command.dto';
import { SyncSucursalDto } from './dto/sync-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { UploadAsistenciaFotoDto } from './dto/upload-asistencia-foto.dto';
import { SucursalesLoggingInterceptor } from './sucursales-logging.interceptor';
import { SucursalesService } from './sucursales.service';

@ApiTags('sucursales')
@ApiBearerAuth('jwt-auth')
@UseInterceptors(SucursalesLoggingInterceptor)
@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly service: SucursalesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateSucursalDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSucursalDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post('import-usb')
  @UseGuards(JwtAuthGuard)
  importUsb(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ImportUsbDto,
    @Req() req: any,
  ) {
    return this.service.importUsb(dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  syncSucursal(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SyncSucursalDto,
    @Req() req: any,
  ) {
    return this.service.syncArea(dto.suc, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post('adms/push')
  receiveAdmsPush(@Body() dto: AdmsPushDto, @Req() req: any) {
    return this.service.receiveAdmsPush(dto, {
      actorId: null,
      ip: this.requestIp(req),
    });
  }

  @Post('kiosco/visita')
  registerKioscoVisita(@Body() dto: KioscoVisitaDto, @Req() req: any) {
    return this.service.registerKioscoVisita(dto, {
      actorId: null,
      ip: this.requestIp(req),
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Get(':codigo/token')
  @UseGuards(JwtAuthGuard)
  getSucursalToken(
    @CurrentUser() user: JwtPayload,
    @Param('codigo') codigo: string,
    @Req() req: any,
  ) {
    return this.service.getOrCreateSucursalToken(codigo, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Get(':codigo/config')
  @UseGuards(JwtAuthGuard)
  getSucursalConfig(@Param('codigo') codigo: string) {
    return this.service.getSucursalConfig(codigo);
  }

  @Get(':codigo/geofence')
  @UseGuards(JwtAuthGuard)
  getGeofence(@Param('codigo') codigo: string) {
    return this.service.getGeofence(codigo);
  }

  @Post('comandos/cleanup')
  @UseGuards(JwtAuthGuard)
  cleanupComandos(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CleanupComandosDto,
    @Req() req: any,
  ) {
    return this.service.cleanupComandos(dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post('comandos/accion')
  @UseGuards(JwtAuthGuard)
  queueCommand(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SucursalCommandDto,
    @Req() req: any,
  ) {
    return this.service.queueSucursalCommand(dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Get(':codigo/comandos')
  @UseGuards(JwtAuthGuard)
  listRecentCommands(
    @Param('codigo') codigo: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = Number(limitRaw ?? 5);
    return this.service.listRecentCommands(codigo, limit);
  }

  @Post('asistencia/fotos/cleanup')
  @UseGuards(JwtAuthGuard)
  cleanupFotos(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CleanupFotosDto,
    @Req() req: any,
  ) {
    return this.service.cleanupAsistenciaFotos(dto.days ?? 90, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post('asistencia/foto')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        idUsuario: { type: 'number' },
        idTimelog: { type: 'number' },
        suc: { type: 'string' },
        fotoBase64: { type: 'string' },
        fileName: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
      required: ['idUsuario'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  uploadFotoAsistencia(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UploadAsistenciaFotoDto,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    return this.service.uploadAsistenciaFoto(dto, file, {
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
