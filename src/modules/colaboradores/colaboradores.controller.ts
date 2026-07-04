import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ColaboradoresLoggingInterceptor } from './colaboradores-logging.interceptor';
import { ColaboradoresTemplateSyncInterceptor } from './colaboradores-template-sync.interceptor';
import { ColaboradoresService } from './colaboradores.service';
import { CreateColaboradorDto } from './dto/create-colaborador.dto';
import { EnrollColaboradorDto } from './dto/enroll-colaborador.dto';
import { MantenimientoBiometriaDto } from './dto/mantenimiento-biometria.dto';
import { QrLoginDto } from './dto/qr-login.dto';
import { ResetBiometriaDto } from './dto/reset-biometria.dto';
import { SaveNom035Dto } from './dto/save-nom035.dto';
import { SelfServiceMarkDto } from './dto/self-service-mark.dto';
import { UpdateColaboradorDto } from './dto/update-colaborador.dto';
import { UploadColaboradorDocumentoDto } from './dto/upload-colaborador-documento.dto';

@ApiTags('colaboradores')
@ApiBearerAuth('jwt-auth')
@UseInterceptors(ColaboradoresLoggingInterceptor)
@Controller('colaboradores')
export class ColaboradoresController {
  constructor(private readonly service: ColaboradoresService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Query('sucursal_id') sucursalIdRaw?: string,
    @Query('departamento') departamento?: string,
    @Query('cargo') cargo?: string,
    @Query('search') search?: string,
  ) {
    const sucursal_id = sucursalIdRaw ? Number(sucursalIdRaw) : null;
    return this.service.findAll({
      sucursal_id: Number.isFinite(sucursal_id) ? sucursal_id! : null,
      departamento: departamento ?? null,
      cargo: cargo ?? null,
      search: search ?? null,
    });
  }

  @Get('filtros/departamentos')
  @UseGuards(JwtAuthGuard)
  listDepartamentos() {
    return this.service.listDistinctDepartamentos();
  }

  @Get('filtros/cargos')
  @UseGuards(JwtAuthGuard)
  listCargos(@Query('departamento') departamento?: string) {
    return this.service.listDistinctCargos(departamento ?? null);
  }

  @Get('terminal-profile')
  @UseGuards(JwtAuthGuard)
  getTerminalProfile(
    @CurrentUser() user: JwtPayload,
    @Query('id') idRaw?: string,
    @Query('pin') pinRaw?: string,
    @Query('qr_token') qrTokenRaw?: string,
    @Req() req?: any,
  ) {
    return this.service.getTerminalProfile(
      {
        id: idRaw,
        pin: pinRaw,
        qrToken: qrTokenRaw,
      },
      {
        actorId: Number(user?.sub ?? 0) || null,
        ip: this.requestIp(req),
      },
    );
  }

  @Get('validate-pin/:pin')
  @UseGuards(JwtAuthGuard)
  validatePin(
    @CurrentUser() user: JwtPayload,
    @Param('pin') pin: string,
    @Req() req?: any,
  ) {
    return this.service.validatePin(
      pin,
      {
        actorId: Number(user?.sub ?? 0) || null,
        ip: this.requestIp(req),
      },
      String(req?.headers?.['x-device-id'] ?? '').trim() || null,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateColaboradorDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service
      .create(dto, {
        actorId: Number(user?.sub ?? 0) || null,
        ip: this.requestIp(req),
      })
      .then((result) => {
        res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
        return result.data;
      });
  }

  @Get(':id/credencial-qr')
  @UseGuards(JwtAuthGuard)
  qrCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.service.buildCredentialQr(id, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post('qr-login')
  qrLogin(@Body() dto: QrLoginDto, @Req() req: any) {
    return this.service.loginWithQrToken(dto.token, {
      actorId: null,
      ip: this.requestIp(req),
    });
  }

  @Post('marcar')
  marcarSelfService(@Body() dto: SelfServiceMarkDto, @Req() req: any) {
    return this.service.registerSelfServiceMark(
      {
        token: dto.token,
        tipo: dto.tipo,
        lat: dto.lat,
        lon: dto.lon,
        accuracyM: dto.accuracy_m,
      },
      {
        actorId: null,
        ip: this.requestIp(req),
      },
    );
  }

  @Get(':id/horarios-rotativos')
  @UseGuards(JwtAuthGuard)
  horariosRotativos(@Param('id', ParseIntPipe) id: number) {
    return this.service.getHorarioAssignments(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateColaboradorDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Req() req?: any,
  ) {
    return this.service.remove(id, false, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post(':id/reset-biometria')
  @UseGuards(JwtAuthGuard)
  resetBiometria(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetBiometriaDto,
    @Req() req?: any,
  ) {
    return this.service.resetBiometria(id, dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post(':id/enrolar')
  @UseGuards(JwtAuthGuard)
  enroll(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnrollColaboradorDto,
    @Req() req: any,
  ) {
    return this.service.requestEnroll(id, dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post(':id/biometria-mantenimiento')
  @UseGuards(JwtAuthGuard)
  mantenimientoBiometria(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MantenimientoBiometriaDto,
    @Req() req: any,
  ) {
    return this.service.mantenimientoBiometria(id, dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post(':id/nom035-respuestas')
  @UseGuards(JwtAuthGuard)
  saveNom035(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveNom035Dto,
    @Req() req: any,
  ) {
    return this.service.saveNom035Respuesta(id, dto, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Get(':id/nom035-respuestas')
  @UseGuards(JwtAuthGuard)
  listNom035(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = Number(limitRaw ?? 30);
    return this.service.listNom035Respuestas(id, limit);
  }

  @Get(':id/documentos')
  @UseGuards(JwtAuthGuard)
  listDocumentos(@Param('id', ParseIntPipe) id: number) {
    return this.service.listDocumentos(id);
  }

  @Post(':id/documentos')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocumento(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UploadColaboradorDocumentoDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    return this.service.uploadDocumento(id, dto, file, {
      actorId: Number(user?.sub ?? 0) || null,
      ip: this.requestIp(req),
    });
  }

  @Post('adms/template-response')
  @UseInterceptors(ColaboradoresTemplateSyncInterceptor)
  syncTemplateFromDevice(@Req() req: any) {
    return (
      req?.templateSyncResult ?? {
        ok: false,
        message: 'No se pudo procesar template de reloj',
      }
    );
  }

  private requestIp(req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return ip ? String(ip) : null;
  }
}
