import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { FacturacionService } from './facturacion.service';
import { EmitirFacturaDto } from './dto/emitir-factura.dto';
import { CancelarFacturaDto } from './dto/cancelar-factura.dto';
import { ReenviarEmailDto } from './dto/reenviar-email.dto';
import { ListFacturacionPendientesQueryDto } from './dto/list-facturacion-pendientes-query.dto';
import { FacturacionUnificacionPreviewDto } from './dto/facturacion-unificacion-preview.dto';
import { FacturacionUnificacionCreateDto } from './dto/facturacion-unificacion-create.dto';
import { FacturacionUnificacionReverseDto } from './dto/facturacion-unificacion-reverse.dto';

@ApiTags('facturacion')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly service: FacturacionService) {}

  @Get('pendientes')
  pendientes(
    @Query() query: ListFacturacionPendientesQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listarPendientes({
      page: query.page,
      pageSize: query.pageSize,
      suc: query.suc,
      estatus: query.estatus,
      razonSocialReceptor: query.razonSocialReceptor,
      rfcReceptor: query.rfcReceptor,
      clien: query.clien,
      idFol: query.idFol,
      tipoFact: query.tipoFact,
    }, user);
  }

  @Post('unificaciones/preview')
  previewUnificacion(
    @Body() dto: FacturacionUnificacionPreviewDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.previewUnificacion(dto.idFols, user);
  }

  @Post('unificaciones')
  crearUnificacion(
    @Body() dto: FacturacionUnificacionCreateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.crearUnificacion({
      idFols: dto.idFols,
      comentario: dto.comentario,
      user,
    });
  }

  @Post('unificaciones/:grupoId/reversa')
  reversarUnificacion(
    @Param('grupoId') grupoId: string,
    @Body() dto: FacturacionUnificacionReverseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reversarUnificacion({
      grupoId,
      motivo: dto.motivo,
      user,
    });
  }

  @Get('unificaciones/:grupoId')
  detalleUnificacion(
    @Param('grupoId') grupoId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.detalleUnificacion(grupoId, user);
  }

  @Get(':idFol/validar')
  validar(@Param('idFol') idFol: string, @CurrentUser() user: JwtPayload) {
    return this.service.validarFolio(idFol, user);
  }

  @Post(':idFol/emitir')
  emitir(
    @Param('idFol') idFol: string,
    @Body() _dto: EmitirFacturaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.emitir(idFol, user);
  }

  @Post(':idFol/refrescar-estado')
  refrescarEstado(
    @Param('idFol') idFol: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.refrescarEstado(idFol, user);
  }

  @Post(':idFol/reenviar-email')
  reenviarEmail(
    @Param('idFol') idFol: string,
    @Body() dto: ReenviarEmailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reenviarCorreo(idFol, dto.email, user);
  }

  @Post(':idFol/cancelar')
  cancelar(
    @Param('idFol') idFol: string,
    @Body() dto: CancelarFacturaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.cancelar(idFol, dto.motivo, user);
  }

  @Get(':idFol/artifacts')
  artifacts(
    @Param('idFol') idFol: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.obtenerArtefactos(idFol, user);
  }
}
