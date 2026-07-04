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
import { AddTransferenciaDetailDto } from './dto/add-transferencia-detail.dto';
import { CreateTransferenciaDto } from './dto/create-transferencia.dto';
import { TransferenciaActionDto } from './dto/transferencia-action.dto';
import { TransferenciaArticulosQueryDto } from './dto/transferencia-articulos-query.dto';
import { TransferenciaQueryDto } from './dto/transferencia-query.dto';
import { UpdateTransferenciaDetailDto } from './dto/update-transferencia-detail.dto';
import { UpdateTransferenciaDto } from './dto/update-transferencia.dto';
import { TransferenciasService } from './transferencias.service';

@ApiTags('transferencias')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('transferencias')
export class TransferenciasController {
  constructor(private readonly service: TransferenciasService) {}

  @Get()
  findAll(
    @Query() query: TransferenciaQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get('catalogos/sucursales')
  sucursales(@CurrentUser() user: JwtPayload) {
    return this.service.catalogSucursales(user);
  }

  @Get('catalogos/motivos')
  motivos() {
    return this.service.catalogMotivos();
  }

  @Get('catalogos/prioridades')
  prioridades() {
    return this.service.catalogPrioridades();
  }

  @Get('catalogos/estatus')
  estatus() {
    return this.service.catalogEstatus();
  }

  @Get('catalogos/articulos')
  articulos(
    @Query() query: TransferenciaArticulosQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.catalogArticulos(query, user);
  }

  @Get('notificaciones')
  notificaciones(@CurrentUser() user: JwtPayload) {
    return this.service.notificaciones(user);
  }

  @Post()
  create(@Body() dto: CreateTransferenciaDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  @Get(':doc')
  findOne(@Param('doc') doc: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(doc, user);
  }

  @Patch(':doc')
  update(
    @Param('doc') doc: string,
    @Body() dto: UpdateTransferenciaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(doc, dto, user);
  }

  @Get(':doc/envio')
  envio(@Param('doc') doc: string, @CurrentUser() user: JwtPayload) {
    return this.service.envio(doc, user);
  }

  @Post(':doc/detalle')
  addDetalle(
    @Param('doc') doc: string,
    @Body() dto: AddTransferenciaDetailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addDetalle(doc, dto, user);
  }

  @Patch(':doc/detalle/:idpd')
  updateDetalle(
    @Param('doc') doc: string,
    @Param('idpd') idpd: string,
    @Body() dto: UpdateTransferenciaDetailDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateDetalle(doc, idpd, dto, user);
  }

  @Delete(':doc/detalle/:idpd')
  removeDetalle(
    @Param('doc') doc: string,
    @Param('idpd') idpd: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeDetalle(doc, idpd, user);
  }

  @Post(':doc/enviar')
  enviar(@Param('doc') doc: string, @CurrentUser() user: JwtPayload) {
    return this.service.enviar(doc, user);
  }

  @Post(':doc/liberar')
  liberar(@Param('doc') doc: string, @CurrentUser() user: JwtPayload) {
    return this.service.liberar(doc, user);
  }

  @Post(':doc/rechazar')
  rechazar(
    @Param('doc') doc: string,
    @Body() dto: TransferenciaActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.rechazar(doc, dto, user);
  }

  @Post(':doc/preparar')
  preparar(@Param('doc') doc: string, @CurrentUser() user: JwtPayload) {
    return this.service.preparar(doc, user);
  }

  @Post(':doc/transito')
  transito(
    @Param('doc') doc: string,
    @Body() dto: TransferenciaActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.transito(doc, dto, user);
  }

  @Post(':doc/recibir')
  recibir(@Param('doc') doc: string, @CurrentUser() user: JwtPayload) {
    return this.service.recibir(doc, user);
  }

  @Post(':doc/contabilizar')
  contabilizar(@Param('doc') doc: string, @CurrentUser() user: JwtPayload) {
    return this.service.contabilizar(doc, user);
  }
}
