import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import {
  AddDevolucionProveedorDetalleDto,
  AddDevolucionProveedorEvidenceDto,
  ConsolidarDevolucionesProveedorDto,
  CreateDevolucionProveedorDto,
  DevolucionArticulosQueryDto,
  DevolucionProveedorActionDto,
  DevolucionesProveedorQueryDto,
  EnviarTransitoDevolucionProveedorDto,
  UpdateDevolucionProveedorDetalleDto,
  UpdateDevolucionProveedorDto,
} from './dto/devoluciones-proveedor.dto';
import { DevolucionesProveedorService } from './devoluciones-proveedor.service';

@ApiTags('devoluciones-proveedor')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('devoluciones-proveedor')
export class DevolucionesProveedorController {
  constructor(private readonly service: DevolucionesProveedorService) {}

  @Get() findAll(
    @Query() query: DevolucionesProveedorQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findAll(query, user);
  }
  @Get('catalogos/tipos') tipos(@CurrentUser() user: JwtPayload) {
    return this.service.catalogTipos(user);
  }
  @Get('catalogos/motivos') motivos(@CurrentUser() user: JwtPayload) {
    return this.service.catalogMotivos(user);
  }
  @Get('catalogos/proveedores') proveedores(@CurrentUser() user: JwtPayload) {
    return this.service.catalogProveedores(user);
  }
  @Get('catalogos/sucursales') sucursales(@CurrentUser() user: JwtPayload) {
    return this.service.catalogSucursales(user);
  }
  @Get('catalogos/articulos') articulos(
    @Query() query: DevolucionArticulosQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.catalogArticulos(query, user);
  }
  @Get('envios') envios(@CurrentUser() user: JwtPayload) {
    return this.service.listEnvios(user);
  }
  @Post('envios') consolidar(
    @Body() dto: ConsolidarDevolucionesProveedorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.consolidar(dto, user);
  }
  @Post('envios/:envio/salida') salida(
    @Param('envio') envio: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.salidaFisica(envio, user);
  }
  @Post() create(
    @Body() dto: CreateDevolucionProveedorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(dto, user);
  }
  @Get(':doc') findOne(
    @Param('doc') doc: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findOne(doc, user);
  }
  @Get(':doc/detalle/:idpd/evidencias') evidencias(
    @Param('doc') doc: string,
    @Param('idpd') idpd: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listEvidencias(doc, idpd, user);
  }
  @Patch(':doc') update(
    @Param('doc') doc: string,
    @Body() dto: UpdateDevolucionProveedorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(doc, dto, user);
  }
  @Post(':doc/evidencia') addEvidenciaDocumento(
    @Param('doc') doc: string,
    @Body() dto: AddDevolucionProveedorEvidenceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addEvidenciaDocumento(doc, dto, user);
  }
  @Get(':doc/evidencias') evidenciasDocumento(
    @Param('doc') doc: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listEvidenciasDocumento(doc, user);
  }
  @Post(':doc/detalle') addDetalle(
    @Param('doc') doc: string,
    @Body() dto: AddDevolucionProveedorDetalleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addDetalle(doc, dto, user);
  }
  @Patch(':doc/detalle/:idpd') updateDetalle(
    @Param('doc') doc: string,
    @Param('idpd') idpd: string,
    @Body() dto: UpdateDevolucionProveedorDetalleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateDetalle(doc, idpd, dto, user);
  }
  @Delete(':doc/detalle/:idpd') removeDetalle(
    @Param('doc') doc: string,
    @Param('idpd') idpd: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeDetalle(doc, idpd, user);
  }
  @Post(':doc/detalle/:idpd/evidencia') addEvidencia(
    @Param('doc') doc: string,
    @Param('idpd') idpd: string,
    @Body() dto: AddDevolucionProveedorEvidenceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addEvidencia(doc, idpd, dto, user);
  }
  @Patch(':doc/detalle/:idpd/evidencias/:evidenceId') updateEvidencia(
    @Param('doc') doc: string,
    @Param('idpd') idpd: string,
    @Param('evidenceId') evidenceId: string,
    @Body() dto: AddDevolucionProveedorEvidenceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateEvidencia(doc, idpd, evidenceId, dto, user);
  }
  @Post(':doc/solicitar') solicitar(
    @Param('doc') doc: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.solicitar(doc, user);
  }
  @Post(':doc/autorizar') autorizar(
    @Param('doc') doc: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.autorizar(doc, user);
  }
  @Post(':doc/rechazar') rechazar(
    @Param('doc') doc: string,
    @Body() dto: DevolucionProveedorActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.rechazar(doc, dto, user);
  }
  @Post(':doc/cancelar') cancelar(
    @Param('doc') doc: string,
    @Body() dto: DevolucionProveedorActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.cancelar(doc, dto, user);
  }
  @Post(':doc/transito') transito(
    @Param('doc') doc: string,
    @Body() dto: EnviarTransitoDevolucionProveedorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.enviarTransito(doc, dto, user);
  }
  @Post(':doc/recibir') recibir(
    @Param('doc') doc: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.recibir(doc, user);
  }
}
