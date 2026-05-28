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
import { AddMermaDetailDto } from './dto/add-merma-detail.dto';
import { AnularMermaDto } from './dto/anular-merma.dto';
import { AuditarMermaDto } from './dto/auditar-merma.dto';
import { CreateMermaDto } from './dto/create-merma.dto';
import { MermaCatalogArticulosQueryDto } from './dto/merma-catalog-articulos-query.dto';
import { MermaQueryDto } from './dto/merma-query.dto';
import { MermaReporteQueryDto } from './dto/merma-reporte-query.dto';
import { RevisarMermaDto } from './dto/revisar-merma.dto';
import { UpdateMermaDetailDto } from './dto/update-merma-detail.dto';
import { UpdateMermaDto } from './dto/update-merma.dto';
import { MermasService } from './mermas.service';

@ApiTags('mermas')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('mermas')
export class MermasController {
  constructor(private readonly service: MermasService) {}

  @Get()
  findAll(@Query() query: MermaQueryDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user, false);
  }

  @Get('consulta')
  findAllConsulta(
    @Query() query: MermaQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findAll(query, user, true);
  }

  @Get('gestion/cabeceras-abiertas')
  listGestionCabecerasAbiertas(
    @CurrentUser() user: JwtPayload,
    @Query('suc') suc?: string,
  ) {
    return this.service.listGestionCabecerasAbiertas(user, suc);
  }

  @Get('auditoria/pendientes')
  auditoriaPendientes(
    @Query() query: MermaQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listAuditoriaPendientes(query, user);
  }

  @Get('catalogos/motivos')
  motivos() {
    return this.service.catalogMotivos();
  }

  @Get('catalogos/clasificaciones')
  clasificaciones() {
    return this.service.catalogClasificaciones();
  }

  @Get('catalogos/estatus')
  estatus() {
    return this.service.catalogEstatus();
  }

  @Get('catalogos/areas')
  areas() {
    return this.service.catalogAreas();
  }

  @Get('catalogos/sucursales')
  sucursales(@CurrentUser() user: JwtPayload) {
    return this.service.catalogSucursales(user);
  }

  @Get('catalogos/articulos')
  catalogArticulos(
    @Query() query: MermaCatalogArticulosQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.catalogArticulos(query, user);
  }

  @Get('reportes/mensual')
  reporteMensual(
    @Query() query: MermaReporteQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reporteMensual(query, user);
  }

  @Get('reportes/sucursal')
  reporteSucursal(
    @Query() query: MermaReporteQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reporteSucursal(query, user);
  }

  @Get('reportes/taller')
  reporteTaller(
    @Query() query: MermaReporteQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reporteTaller(query, user);
  }

  @Get('reportes/producto')
  reporteProducto(
    @Query() query: MermaReporteQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reporteProducto(query, user);
  }

  @Get('reportes/motivos')
  reporteMotivos(
    @Query() query: MermaReporteQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reporteMotivos(query, user);
  }

  @Get('reportes/comparativo')
  reporteComparativo(
    @Query() query: MermaReporteQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reporteComparativo(query, user);
  }

  @Get('reportes/anual')
  reporteAnual(
    @Query() query: MermaReporteQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reporteAnual(query, user);
  }

  @Post()
  create(@Body() dto: CreateMermaDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  @Get(':docmer')
  findOne(@Param('docmer') docmer: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(docmer, user);
  }

  @Patch(':docmer')
  update(
    @Param('docmer') docmer: string,
    @Body() dto: UpdateMermaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(docmer, dto, user);
  }

  @Delete(':docmer')
  remove(@Param('docmer') docmer: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(docmer, user);
  }

  @Get(':docmer/detalle')
  listDetalle(
    @Param('docmer') docmer: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listDetalle(docmer, user);
  }

  @Post(':docmer/detalle')
  addDetalle(
    @Param('docmer') docmer: string,
    @Body() dto: AddMermaDetailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addDetalle(docmer, dto, user);
  }

  @Patch(':docmer/detalle/:idpd')
  updateDetalle(
    @Param('docmer') docmer: string,
    @Param('idpd') idpd: string,
    @Body() dto: UpdateMermaDetailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateDetalle(docmer, idpd, dto, user);
  }

  @Delete(':docmer/detalle/:idpd')
  removeDetalle(
    @Param('docmer') docmer: string,
    @Param('idpd') idpd: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeDetalle(docmer, idpd, user);
  }

  @Post(':docmer/solicitar-autorizacion')
  solicitarAutorizacion(
    @Param('docmer') docmer: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.solicitarAutorizacion(docmer, user);
  }

  @Post(':docmer/revisar')
  revisar(
    @Param('docmer') docmer: string,
    @Body() dto: RevisarMermaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.revisar(docmer, dto, user);
  }

  @Post(':docmer/contabilizar')
  contabilizar(
    @Param('docmer') docmer: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.contabilizar(docmer, user);
  }

  @Post(':docmer/anular')
  anular(
    @Param('docmer') docmer: string,
    @Body() dto: AnularMermaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.anular(docmer, dto, user);
  }

  @Post(':docmer/auditar')
  auditar(
    @Param('docmer') docmer: string,
    @Body() dto: AuditarMermaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.auditar(docmer, dto, user);
  }

  @Get('consulta/:docmer')
  findOneConsulta(
    @Param('docmer') docmer: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findOneConsulta(docmer, user);
  }

  @Get('consulta/:docmer/soporte')
  soporte(@Param('docmer') docmer: string, @CurrentUser() user: JwtPayload) {
    return this.service.buildSoporte(docmer, user);
  }

  @Get('consulta/:docmer/etiqueta')
  etiqueta(@Param('docmer') docmer: string, @CurrentUser() user: JwtPayload) {
    return this.service.buildEtiqueta(docmer, user);
  }
}
