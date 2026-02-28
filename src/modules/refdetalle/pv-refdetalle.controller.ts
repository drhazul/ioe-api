import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PvRefDetalleAsignarDto } from './dto/pv-refdetalle-asignar.dto';
import { PvRefDetalleCrearDto } from './dto/pv-refdetalle-crear.dto';
import { PvRefDetalleQueryDto } from './dto/pv-refdetalle-query.dto';
import { RefDetalleService } from './refdetalle.service';

@ApiTags('pv-refdetalle')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('pv/refdetalle')
export class PvRefDetalleController {
  constructor(private readonly service: RefDetalleService) {}

  @Get()
  findByFolio(
    @Query() query: PvRefDetalleQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findByFolioForPv(query, user);
  }

  @Post('crear')
  create(@Body() dto: PvRefDetalleCrearDto, @CurrentUser() user: JwtPayload) {
    return this.service.createForPv(dto, user);
  }

  @Post('asignar')
  assign(@Body() dto: PvRefDetalleAsignarDto, @CurrentUser() user: JwtPayload) {
    return this.service.assignForPv(dto, user);
  }

  @Delete(':idref')
  remove(
    @Param('idref') idref: string,
    @Query('idfol') idfol: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeForPv(idref, idfol, user);
  }
}
