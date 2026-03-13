import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CajaGeneralFormaDetalleQueryDto } from './dto/caja-general-forma-detalle-query.dto';
import { CajaGeneralGlobalQueryDto } from './dto/caja-general-global-query.dto';
import { CajaGeneralOpvQueryDto } from './dto/caja-general-opv-query.dto';
import { CerrarEntregaOpvDto } from './dto/cerrar-entrega-opv.dto';
import { ReactivarEntregaOpvDto } from './dto/reactivar-entrega-opv.dto';
import { CajaGeneralService } from './caja-general.service';

@ApiTags('caja-general')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('caja-general')
export class CajaGeneralController {
  constructor(private readonly service: CajaGeneralService) {}

  @Get('opv/resumen')
  getResumenOpv(
    @Query() query: CajaGeneralOpvQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getResumenOpv(query, user);
  }

  @Post('opv/cerrar')
  cerrarEntrega(
    @Body() dto: CerrarEntregaOpvDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.cerrarEntregaOpv(dto, user, this.requestIp(req));
  }

  @Post('opv/reactivar')
  reactivarEntrega(
    @Body() dto: ReactivarEntregaOpvDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.reactivarEntregaOpv(dto, user, this.requestIp(req));
  }

  @Get('global/resumen')
  getResumenGlobal(
    @Query() query: CajaGeneralGlobalQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getResumenGlobal(query, user);
  }

  @Get('opv/reporte')
  getReporteOpv(
    @Query() query: CajaGeneralOpvQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getReporteOpv(query, user);
  }

  @Get('opv/forma-detalle')
  getDetalleFormaOpv(
    @Query() query: CajaGeneralFormaDetalleQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getDetalleFormaOpv(query, user);
  }

  @Get('opv/pendiente-transacciones')
  getPendienteTransaccionesOpv(
    @Query() query: CajaGeneralOpvQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getPendienteTransaccionesOpv(query, user);
  }

  @Get('global/reporte')
  getReporteGlobal(
    @Query() query: CajaGeneralGlobalQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getReporteGlobal(query, user);
  }

  @Get('global/excel')
  getExcelGlobal(
    @Query() query: CajaGeneralGlobalQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getExcelGlobal(query, user);
  }

  @Get('opv/pendientes')
  getOpvPendientes(
    @Query() query: CajaGeneralGlobalQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getOpvPendientes(query, user);
  }

  private requestIp(req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return ip ? String(ip) : null;
  }
}
