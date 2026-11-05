import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DevelopmentBusinessGuard } from '../../common/guards/development-business.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreateEntidadFiscalDto } from './dto/create-entidad-fiscal.dto';
import { CreateEntidadFiscalSucursalDto } from './dto/create-entidad-fiscal-sucursal.dto';
import { UpdateEntidadFiscalDto } from './dto/update-entidad-fiscal.dto';
import { UpdateEntidadFiscalSucursalDto } from './dto/update-entidad-fiscal-sucursal.dto';
import { EntidadesFiscalesService } from './entidades-fiscales.service';

@ApiTags('entidades-fiscales')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, DevelopmentBusinessGuard)
@Controller('entidades-fiscales')
export class EntidadesFiscalesController {
  constructor(private readonly service: EntidadesFiscalesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user);
  }

  @Get('catalogos/sucursales')
  listSucursales(@CurrentUser() user: JwtPayload) {
    return this.service.listSucursales(user);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.service.get(id, user);
  }

  @Post()
  create(@Body() dto: CreateEntidadFiscalDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEntidadFiscalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/sucursales')
  linkSucursal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEntidadFiscalSucursalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.linkSucursal(id, dto, user);
  }

  @Patch(':id/sucursales/:relacionId')
  updateLink(
    @Param('id', ParseIntPipe) id: number,
    @Param('relacionId', ParseIntPipe) relacionId: number,
    @Body() dto: UpdateEntidadFiscalSucursalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateLink(id, relacionId, dto, user);
  }
}
