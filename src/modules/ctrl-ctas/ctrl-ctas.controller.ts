import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CtrlCtasService } from './ctrl-ctas.service';
import { CtrlCtasConsultaDto } from './dto/ctrl-ctas-consulta.dto';

@ApiTags('ctrl-ctas')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('ctrl-ctas')
export class CtrlCtasController {
  constructor(private readonly service: CtrlCtasService) {}

  @Get('config')
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.service.getConfig(user);
  }

  @Get('catalog/ctas')
  catalogCtas(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('sucs') sucs?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.catalogCtas(user, { search, sucs, limit });
  }

  @Get('catalog/clientes')
  catalogClientes(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('sucs') sucs?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.catalogClientes(user, { search, sucs, limit });
  }

  @Get('catalog/opvs')
  catalogOpvs(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('sucs') sucs?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.catalogOpvs(user, { search, sucs, limit });
  }

  @Post('consulta/resumen-cliente')
  resumenCliente(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CtrlCtasConsultaDto,
  ) {
    return this.service.resumenCliente(dto, user);
  }

  @Post('consulta/resumen-transaccion')
  resumenTransaccion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CtrlCtasConsultaDto,
  ) {
    return this.service.resumenTransaccion(dto, user);
  }

  @Post('consulta/detalle')
  detalleTransaccion(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CtrlCtasConsultaDto,
  ) {
    return this.service.detalleTransaccion(dto, user);
  }
}
