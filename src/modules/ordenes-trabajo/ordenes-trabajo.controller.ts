import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ListOrdenesTrabajoQueryDto } from './dto/list-ordenes-trabajo-query.dto';
import {
  ActualizarArticuloCambioMermaDto,
  AssignLaboratorioBatchDto,
  AssignOrdBatchDto,
  CambioMaterialDto,
  CambioMermaContextDto,
  CrearCambioMermaDto,
  EntregarOrdDto,
  GarantiaOrdDto,
  MermaOrdDto,
  PrepararCambioMermaDto,
  RecibirOrdDto,
  RegresarIncidenciaBatchDto,
  RetrabajoCambioMermaDto,
  SolicitarAutorizacionCambioMermaDto,
  SendOrdBatchDto,
  SaveOrdDetalleDto,
  ScanOrdDto,
  SendOrdDto,
  ValidateEnviarOrdDto,
} from './dto/ordenes-trabajo-actions.dto';
import { OrdenesTrabajoService } from './ordenes-trabajo.service';

@ApiTags('ordenes-trabajo')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('ordenes-trabajo')
export class OrdenesTrabajoController {
  constructor(private readonly service: OrdenesTrabajoService) {}

  @Get()
  list(
    @Query() query: ListOrdenesTrabajoQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.list(query, user);
  }

  @Get('motivos-movimiento')
  listMotivosMovimiento(
    @Query('tipo') tipo: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listMotivosMovimiento(tipo, user);
  }

  @Get(':iord')
  getByIord(@Param('iord') iord: string, @CurrentUser() user: JwtPayload) {
    return this.service.getByIord(iord, user);
  }

  @Get(':iord/detalle')
  getDetail(@Param('iord') iord: string, @CurrentUser() user: JwtPayload) {
    return this.service.getDetail(iord, user);
  }

  @Get(':iord/cambio-merma/context')
  getCambioMermaContext(
    @Param('iord') iord: string,
    @Query() query: CambioMermaContextDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getCambioMermaContext(iord, query, user);
  }

  @Post(':iord/cambio-merma/preparar')
  prepararCambioMerma(
    @Param('iord') iord: string,
    @Body() dto: PrepararCambioMermaDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.prepararCambioMerma(iord, dto, user, this.requestIp(req));
  }

  @Post(':iord/cambio-merma/actualizar-articulo')
  actualizarArticuloCambioMerma(
    @Param('iord') iord: string,
    @Body() dto: ActualizarArticuloCambioMermaDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.actualizarArticuloCambioMerma(
      iord,
      dto,
      user,
      this.requestIp(req),
    );
  }

  @Post(':iord/cambio-merma/solicitar-autorizacion')
  solicitarAutorizacionCambioMerma(
    @Param('iord') iord: string,
    @Body() dto: SolicitarAutorizacionCambioMermaDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.solicitarAutorizacionCambioMerma(
      iord,
      dto,
      user,
      this.requestIp(req),
    );
  }

  @Post(':iord/cambio-merma/autorizar')
  autorizarCambioMerma(
    @Param('iord') iord: string,
    @Body() dto: CambioMermaContextDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.autorizarCambioMerma(
      iord,
      dto,
      user,
      this.requestIp(req),
    );
  }

  @Post(':iord/cambio-merma/retrabajo')
  retrabajoCambioMerma(
    @Param('iord') iord: string,
    @Body() dto: RetrabajoCambioMermaDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.retrabajoCambioMerma(
      iord,
      dto,
      user,
      this.requestIp(req),
    );
  }

  @Post(':iord/cambio-merma/crear')
  crearCambioMerma(
    @Param('iord') iord: string,
    @Body() dto: CrearCambioMermaDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.crearCambioMerma(iord, dto, user, this.requestIp(req));
  }

  @Post(':iord/autorizar')
  autorizar(
    @Param('iord') iord: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.autorizar(iord, user, this.requestIp(req));
  }

  @Post(':iord/enviar')
  enviar(
    @Param('iord') iord: string,
    @Body() dto: SendOrdDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.enviar(iord, dto, user, this.requestIp(req));
  }

  @Post('enviar/validar')
  validarEnviarOrd(
    @Body() dto: ValidateEnviarOrdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validarEnviarOrd(dto, user);
  }

  @Post('enviar/lote')
  enviarLote(
    @Body() dto: SendOrdBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.enviarLote(dto, user, this.requestIp(req));
  }

  @Post('anular/lote')
  anularLote(
    @Body() dto: SendOrdBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.anularLote(dto, user, this.requestIp(req));
  }

  @Get('asignar/colaboradores')
  listarColaboradoresAsignar(
    @Query('suc') suc: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listarColaboradoresAsignar(suc, user);
  }

  @Post('asignar/validar')
  validarAsignarOrd(
    @Body() dto: ValidateEnviarOrdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validarAsignarOrd(dto, user);
  }

  @Post('asignar/lote')
  asignarLote(
    @Body() dto: AssignOrdBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.asignarLote(dto, user, this.requestIp(req));
  }

  @Post('trabajo-terminado/validar')
  validarTrabajoTerminadoOrd(
    @Body() dto: ValidateEnviarOrdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validarTrabajoTerminadoOrd(dto, user);
  }

  @Post('trabajo-terminado/lote')
  trabajoTerminadoLote(
    @Body() dto: SendOrdBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.trabajoTerminadoLote(dto, user, this.requestIp(req));
  }

  @Post('regresar-incidencia/validar')
  validarRegresarIncidenciaOrd(
    @Body() dto: ValidateEnviarOrdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validarRegresarIncidenciaOrd(dto, user);
  }

  @Post('regresar-incidencia/lote')
  regresarIncidenciaLote(
    @Body() dto: RegresarIncidenciaBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.regresarIncidenciaLote(dto, user, this.requestIp(req));
  }

  @Post('regresar-tienda/validar')
  validarRegresarTiendaOrd(
    @Body() dto: ValidateEnviarOrdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validarRegresarTiendaOrd(dto, user);
  }

  @Post('regresar-tienda/lote')
  regresarTiendaLote(
    @Body() dto: SendOrdBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.regresarTiendaLote(dto, user, this.requestIp(req));
  }

  @Post('asignar-laboratorio/lote')
  asignarLaboratorioLote(
    @Body() dto: AssignLaboratorioBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.asignarLaboratorioLote(dto, user, this.requestIp(req));
  }

  @Post('recibir/validar')
  validarRecibirOrd(
    @Body() dto: ValidateEnviarOrdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validarRecibirOrd(dto, user);
  }

  @Post('recibir/lote')
  recibirLote(
    @Body() dto: SendOrdBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.recibirLote(dto, user, this.requestIp(req));
  }

  @Post('entregar/validar')
  validarEntregarOrd(
    @Body() dto: ValidateEnviarOrdDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validarEntregarOrd(dto, user);
  }

  @Post('entregar/lote')
  entregarLote(
    @Body() dto: SendOrdBatchDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.entregarLote(dto, user, this.requestIp(req));
  }

  @Post(':iord/recibir')
  recibir(
    @Param('iord') iord: string,
    @Body() dto: RecibirOrdDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.recibir(iord, dto, user, this.requestIp(req));
  }

  @Post(':iord/entregar')
  entregar(
    @Param('iord') iord: string,
    @Body() dto: EntregarOrdDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.entregar(iord, dto, user, this.requestIp(req));
  }

  @Post(':iord/garantia')
  garantia(
    @Param('iord') iord: string,
    @Body() dto: GarantiaOrdDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.garantia(iord, dto, user, this.requestIp(req));
  }

  @Post(':iord/cambio-material')
  cambioMaterial(
    @Param('iord') iord: string,
    @Body() dto: CambioMaterialDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.cambioMaterial(iord, dto, user, this.requestIp(req));
  }

  @Post(':iord/merma')
  merma(
    @Param('iord') iord: string,
    @Body() dto: MermaOrdDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.merma(iord, dto, user, this.requestIp(req));
  }

  @Post(':iord/detalle/guardar')
  saveDetail(
    @Param('iord') iord: string,
    @Body() dto: SaveOrdDetalleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.saveDetail(iord, dto, user, this.requestIp(req));
  }

  @Post('scan/recibir')
  scanRecibir(
    @Body() dto: ScanOrdDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.scanRecibir(dto, user, this.requestIp(req));
  }

  @Post('scan/entregar')
  scanEntregar(
    @Body() dto: ScanOrdDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.scanEntregar(dto, user, this.requestIp(req));
  }

  private requestIp(req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return ip ? String(ip) : null;
  }
}
