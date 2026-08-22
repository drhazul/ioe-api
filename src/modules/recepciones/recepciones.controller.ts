import {
  Body,
  Controller,
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
  CreateRecepcionDto,
  RecepcionActionDto,
  RecepcionMasivaDto,
  RecepcionesQueryDto,
  SaveRecepcionDraftDto,
  UpdateRecepcionCantidadDto,
  UpdateRecepcionCostoDto,
  UpdateRecepcionDatosDto,
} from './dto/recepciones.dto';
import { RecepcionesService } from './recepciones.service';

@ApiTags('recepciones')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('recepciones')
export class RecepcionesController {
  constructor(private readonly service: RecepcionesService) {}

  @Get()
  findAll(
    @Query() query: RecepcionesQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get('historial')
  historial(
    @Query() query: RecepcionesQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.historial(query, user);
  }

  @Get('indicadores')
  indicadores(
    @Query() query: RecepcionesQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.indicadores(query, user);
  }

  @Get('catalogos/sucursales')
  sucursales(@CurrentUser() user: JwtPayload) {
    return this.service.catalogSucursales(user);
  }

  @Get('catalogos/proveedores')
  proveedores() {
    return this.service.catalogProveedores();
  }

  @Get('catalogos/calidad/:art')
  calidad(
    @Param('art') art: string,
    @Query('suc') suc: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.catalogCalidad(art, suc, user);
  }

  @Get('documentos/:docrec')
  documento(@Param('docrec') docrec: string, @CurrentUser() user: JwtPayload) {
    return this.service.findDocumento(docrec, user);
  }

  @Post('documentos/:docrec/solicitar-autorizacion')
  solicitar(@Param('docrec') docrec: string, @CurrentUser() user: JwtPayload) {
    return this.service.solicitarAutorizacion(docrec, user);
  }

  @Post('documentos/:docrec/autorizar')
  autorizar(@Param('docrec') docrec: string, @CurrentUser() user: JwtPayload) {
    return this.service.autorizar(docrec, user);
  }

  @Patch('documentos/:docrec/items/:idrec/cantidad-fisica')
  actualizarCantidadFisica(
    @Param('docrec') docrec: string,
    @Param('idrec') idrec: string,
    @Body() dto: UpdateRecepcionCantidadDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.actualizarCantidadFisica(docrec, idrec, dto, user);
  }

  @Patch('documentos/:docrec/datos')
  actualizarDatos(
    @Param('docrec') docrec: string,
    @Body() dto: UpdateRecepcionDatosDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.actualizarDatos(docrec, dto, user);
  }

  @Patch('documentos/:docrec/items/:idrec/costo')
  actualizarCosto(
    @Param('docrec') docrec: string,
    @Param('idrec') idrec: string,
    @Body() dto: UpdateRecepcionCostoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.actualizarCosto(docrec, idrec, dto, user);
  }

  @Post('documentos/:docrec/rechazar')
  rechazar(
    @Param('docrec') docrec: string,
    @Body() dto: RecepcionActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.rechazar(docrec, dto, user);
  }

  @Post(':nped/masiva/validar')
  validarMasiva(
    @Param('nped') nped: string,
    @Body() dto: RecepcionMasivaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.validarMasiva(nped, dto, user);
  }

  @Post(':nped/masiva/confirmar')
  confirmarMasiva(
    @Param('nped') nped: string,
    @Body() dto: RecepcionMasivaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(nped, dto, user);
  }

  @Get(':nped/borrador')
  borrador(@Param('nped') nped: string, @CurrentUser() user: JwtPayload) {
    return this.service.findDraft(nped, user);
  }

  @Post(':nped/borrador')
  guardarBorrador(
    @Param('nped') nped: string,
    @Body() dto: SaveRecepcionDraftDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.saveDraft(nped, dto, user);
  }

  @Get(':nped')
  findOne(@Param('nped') nped: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(nped, user);
  }

  @Post(':nped')
  create(
    @Param('nped') nped: string,
    @Body() dto: CreateRecepcionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(nped, dto, user);
  }
}
