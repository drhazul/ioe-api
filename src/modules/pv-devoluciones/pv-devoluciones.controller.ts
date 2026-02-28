import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { ListDevolucionesQueryDto } from './dto/list-devoluciones-query.dto';
import { PagoFinalizarDto } from './dto/pago-finalizar.dto';
import { PagoPreviewRequestDto } from './dto/pago-preview-request.dto';
import { UpdateCtddDto } from './dto/update-ctdd.dto';
import { PvDevolucionesService } from './pv-devoluciones.service';

@ApiTags('pv-devoluciones')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('pv/devoluciones')
export class PvDevolucionesController {
  constructor(private readonly service: PvDevolucionesService) {}

  @Get()
  list(@Query() query: ListDevolucionesQueryDto, @CurrentUser() user: JwtPayload) {
    return this.service.list(query, user);
  }

  @Post('crear')
  create(
    @Body() dto: CreateDevolucionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.create(dto, user, this.requestIp(req));
  }

  @Get(':idfolDev/detalle')
  detail(@Param('idfolDev') idfolDev: string, @CurrentUser() user: JwtPayload) {
    return this.service.detail(idfolDev, user);
  }

  @Post(':idfolDev/devolver-todo')
  devolverTodo(
    @Param('idfolDev') idfolDev: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.devolverTodo(idfolDev, user);
  }

  @Patch(':idfolDev/lineas/:lineId')
  updateLinea(
    @Param('idfolDev') idfolDev: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateCtddDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateLinea(idfolDev, lineId, dto, user);
  }

  @Post(':idfolDev/detalle/preparar')
  prepararDetalle(
    @Param('idfolDev') idfolDev: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.prepararDetalle(idfolDev, user);
  }

  @Post(':idfolDev/pago/preview')
  pagoPreview(
    @Param('idfolDev') idfolDev: string,
    @Body() dto: PagoPreviewRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.pagoPreview(idfolDev, dto, user);
  }

  @Post(':idfolDev/pago/finalizar')
  pagoFinalizar(
    @Param('idfolDev') idfolDev: string,
    @Body() dto: PagoFinalizarDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.pagoFinalizar(idfolDev, dto, user, this.requestIp(req));
  }

  @Get(':idfolDev/print-preview')
  printPreview(
    @Param('idfolDev') idfolDev: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.printPreview(idfolDev, user);
  }

  private requestIp(req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return ip ? String(ip) : null;
  }
}
