import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ApplyPromocionesDto } from './dto/apply-promociones.dto';
import { CreatePromocionBeneficioDto } from './dto/create-promocion-beneficio.dto';
import { CreatePromocionCriterioDto } from './dto/create-promocion-criterio.dto';
import { CreatePromocionDto } from './dto/create-promocion.dto';
import { CreateCatalogOptionDto } from './dto/create-catalog-option.dto';
import { ReordenarPrioridadDto } from './dto/reordenar-prioridad.dto';
import { SavePromoConfigDto } from './dto/save-promo-config.dto';
import { UpdatePromocionBeneficioDto } from './dto/update-promocion-beneficio.dto';
import { UpdatePromocionCriterioDto } from './dto/update-promocion-criterio.dto';
import { UpdatePromocionDto } from './dto/update-promocion.dto';
import { PromocionesService } from './promociones.service';

@ApiTags('promociones')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('promociones')
export class PromocionesController {
  constructor(private readonly service: PromocionesService) {}

  @Get()
  findAll(
    @Query('includeInactive') includeInactive?: string,
    @Query('suc') suc?: string,
    @Query('tipo') tipo?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.findAll({ includeInactive, suc, tipo, search }, user);
  }

  @Get('catalogos/sucursales')
  sucursales(@CurrentUser() user?: JwtPayload) {
    return this.service.listSucursales(user);
  }

  @Get('catalogos/clientes')
  clientes(
    @Query('suc') suc?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.listClientes(suc, search, user);
  }

  @Get('catalogos/t-prom')
  tPromCatalog() {
    return this.service.listCatalog('T_PROM');
  }

  @Post('catalogos/t-prom')
  createTPromCatalog(
    @Body() dto: CreateCatalogOptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createCatalogOption('T_PROM', dto, user);
  }

  @Get('catalogos/tipo-desc')
  tipoDescCatalog() {
    return this.service.listCatalog('TIPO_DESC');
  }

  @Post('catalogos/tipo-desc')
  createTipoDescCatalog(
    @Body() dto: CreateCatalogOptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createCatalogOption('TIPO_DESC', dto, user);
  }

  @Get('catalogos/t-beneficio')
  tBeneficioCatalog() {
    return this.service.listCatalog('T_BENEFICIO');
  }

  @Post('catalogos/t-beneficio')
  createTBeneficioCatalog(
    @Body() dto: CreateCatalogOptionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createCatalogOption('T_BENEFICIO', dto, user);
  }

  @Get('catalogos/depa')
  depaCatalog(@Query('suc') suc?: string) {
    return this.service.listDepa(suc);
  }

  @Get('catalogos/subd')
  subdCatalog(@Query('depa') depa?: string) {
    return this.service.listSubd(depa);
  }

  @Get('catalogos/clas')
  clasCatalog(@Query('subd') subd?: string) {
    return this.service.listClas(subd);
  }

  @Get('catalogos/scla')
  sclaCatalog(@Query('clas') clas?: string) {
    return this.service.listScla(clas);
  }

  @Get('catalogos/scla2')
  scla2Catalog(@Query('scla') scla?: string) {
    return this.service.listScla2(scla);
  }

  @Get('catalogos/guia')
  guiaCatalog(@Query('scla2') scla2?: string) {
    return this.service.listGuia(scla2);
  }

  @Get('catalogos/articulos')
  articulosCatalog(
    @Query('suc') suc?: string,
    @Query('depa') depa?: string,
    @Query('subd') subd?: string,
    @Query('clas') clas?: string,
    @Query('scla') scla?: string,
    @Query('scla2') scla2?: string,
    @Query('guia') guia?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.service.listArticulos({
      suc,
      depa,
      subd,
      clas,
      scla,
      scla2,
      guia,
      search,
    }, user);
  }

  @Get(':idProm')
  findOne(@Param('idProm') idProm: string, @CurrentUser() user?: JwtPayload) {
    return this.service.findOne(idProm, user);
  }

  @Post()
  create(@Body() dto: CreatePromocionDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':idProm')
  update(
    @Param('idProm') idProm: string,
    @Body() dto: UpdatePromocionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(idProm, dto, user);
  }

  @Delete(':idProm/hard')
  removeHard(@Param('idProm') idProm: string, @CurrentUser() user: JwtPayload) {
    return this.service.removeHard(idProm, user);
  }

  @Delete(':idProm')
  remove(@Param('idProm') idProm: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(idProm, user);
  }

  @Get(':idProm/configuracion')
  getConfig(@Param('idProm') idProm: string, @CurrentUser() user?: JwtPayload) {
    return this.service.getConfig(idProm, user);
  }

  @Put(':idProm/configuracion')
  saveConfig(
    @Param('idProm') idProm: string,
    @Body() dto: SavePromoConfigDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.saveConfig(idProm, dto, user);
  }

  @Post(':idProm/reordenar-prioridad')
  reordenarPrioridad(
    @Param('idProm') idProm: string,
    @Body() dto: ReordenarPrioridadDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reordenarPrioridad(idProm, dto, user);
  }

  @Get(':idProm/criterios')
  listCriterios(@Param('idProm') idProm: string, @CurrentUser() user?: JwtPayload) {
    return this.service.listCriterios(idProm, user);
  }

  @Post(':idProm/criterios')
  createCriterio(
    @Param('idProm') idProm: string,
    @Body() dto: CreatePromocionCriterioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createCriterio(idProm, dto, user);
  }

  @Patch('criterios/:idCriterio')
  updateCriterio(
    @Param('idCriterio') idCriterio: string,
    @Body() dto: UpdatePromocionCriterioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateCriterio(idCriterio, dto, user);
  }

  @Delete('criterios/:idCriterio')
  removeCriterio(
    @Param('idCriterio') idCriterio: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeCriterio(idCriterio, user);
  }

  @Get(':idProm/beneficios')
  listBeneficios(@Param('idProm') idProm: string, @CurrentUser() user?: JwtPayload) {
    return this.service.listBeneficios(idProm, user);
  }

  @Post(':idProm/beneficios')
  createBeneficio(
    @Param('idProm') idProm: string,
    @Body() dto: CreatePromocionBeneficioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createBeneficio(idProm, dto, user);
  }

  @Patch('beneficios/:idBeneficio')
  updateBeneficio(
    @Param('idBeneficio') idBeneficio: string,
    @Body() dto: UpdatePromocionBeneficioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateBeneficio(idBeneficio, dto, user);
  }

  @Delete('beneficios/:idBeneficio')
  removeBeneficio(
    @Param('idBeneficio') idBeneficio: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeBeneficio(idBeneficio, user);
  }

  @Post('evaluar/:idfol')
  evaluar(@Param('idfol') idfol: string, @CurrentUser() user: JwtPayload) {
    return this.service.evaluarFolio(idfol, user);
  }

  @Post('aplicar/:idfol')
  aplicar(
    @Param('idfol') idfol: string,
    @Body() dto: ApplyPromocionesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.aplicarFolio(idfol, dto, user);
  }

  @Get('aplicadas/:idfol')
  aplicadas(@Param('idfol') idfol: string) {
    return this.service.aplicadasPorFolio(idfol);
  }
}
