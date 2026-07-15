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
import { AddSugeridoDetalleDto } from './dto/add-sugerido-detalle.dto';
import { CreateSugeridoOrdenDto } from './dto/create-sugerido-orden.dto';
import { SugeridoActionDto } from './dto/sugerido-action.dto';
import { SugeridosCalculoQueryDto } from './dto/sugeridos-calculo-query.dto';
import { SugeridosQueryDto } from './dto/sugeridos-query.dto';
import { UpdateSugeridoDetalleDto } from './dto/update-sugerido-detalle.dto';
import { SugeridosService } from './sugeridos.service';

@ApiTags('sugeridos')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('sugeridos')
export class SugeridosController {
  constructor(private readonly service: SugeridosService) {}

  @Get()
  findAll(@Query() query: SugeridosQueryDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user);
  }

  @Get('calculo')
  calcular(
    @Query() query: SugeridosCalculoQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.calcular(query, user);
  }

  @Get('catalogos/sucursales')
  sucursales(@CurrentUser() user: JwtPayload) {
    return this.service.catalogSucursales(user);
  }

  @Get('catalogos/proveedores')
  proveedores() {
    return this.service.catalogProveedores();
  }

  @Get('catalogos/estatus')
  estatus() {
    return this.service.catalogEstatus();
  }

  @Post()
  create(@Body() dto: CreateSugeridoOrdenDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  @Get(':nped')
  findOne(@Param('nped') nped: string, @CurrentUser() user: JwtPayload) {
    return this.service.findOne(nped, user);
  }

  @Post(':nped/detalle')
  addDetalle(
    @Param('nped') nped: string,
    @Body() dto: AddSugeridoDetalleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.addDetalle(nped, dto, user);
  }

  @Patch(':nped/detalle/:idped')
  updateDetalle(
    @Param('nped') nped: string,
    @Param('idped') idped: string,
    @Body() dto: UpdateSugeridoDetalleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateDetalle(nped, idped, dto, user);
  }

  @Delete(':nped/detalle/:idped')
  removeDetalle(
    @Param('nped') nped: string,
    @Param('idped') idped: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeDetalle(nped, idped, user);
  }

  @Post(':nped/enviar')
  enviar(@Param('nped') nped: string, @CurrentUser() user: JwtPayload) {
    return this.service.enviar(nped, user);
  }

  @Post(':nped/autorizar')
  autorizar(@Param('nped') nped: string, @CurrentUser() user: JwtPayload) {
    return this.service.autorizar(nped, user);
  }

  @Post(':nped/rechazar')
  rechazar(
    @Param('nped') nped: string,
    @Body() dto: SugeridoActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.rechazar(nped, dto, user);
  }

  @Post(':nped/anular')
  anular(
    @Param('nped') nped: string,
    @Body() dto: SugeridoActionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.anular(nped, dto, user);
  }
}
