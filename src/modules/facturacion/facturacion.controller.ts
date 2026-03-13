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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FacturacionService } from './facturacion.service';
import { EmitirFacturaDto } from './dto/emitir-factura.dto';
import { CancelarFacturaDto } from './dto/cancelar-factura.dto';
import { ReenviarEmailDto } from './dto/reenviar-email.dto';
import { ListFacturacionPendientesQueryDto } from './dto/list-facturacion-pendientes-query.dto';

@ApiTags('facturacion')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly service: FacturacionService) {}

  @Get('pendientes')
  pendientes(@Query() query: ListFacturacionPendientesQueryDto) {
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
    });
  }

  @Get(':idFol/validar')
  validar(@Param('idFol') idFol: string) {
    return this.service.validarFolio(idFol);
  }

  @Post(':idFol/emitir')
  emitir(@Param('idFol') idFol: string, @Body() _dto: EmitirFacturaDto) {
    return this.service.emitir(idFol);
  }

  @Post(':idFol/refrescar-estado')
  refrescarEstado(@Param('idFol') idFol: string) {
    return this.service.refrescarEstado(idFol);
  }

  @Post(':idFol/reenviar-email')
  reenviarEmail(@Param('idFol') idFol: string, @Body() dto: ReenviarEmailDto) {
    return this.service.reenviarCorreo(idFol, dto.email);
  }

  @Post(':idFol/cancelar')
  cancelar(@Param('idFol') idFol: string, @Body() dto: CancelarFacturaDto) {
    return this.service.cancelar(idFol, dto.motivo);
  }
}
