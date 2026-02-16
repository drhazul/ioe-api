import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PvCotizacionCierreDto } from './dto/pv-cotizacion-cierre.dto';
import { PvCotizacionCierrePreviewDto } from './dto/pv-cotizacion-cierre-preview.dto';
import { PvCotizacionesCierreService } from './pv-cotizaciones-cierre.service';

@ApiTags('pv-cotizaciones')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('pv/cotizaciones')
export class PvCotizacionesCierreController {
  constructor(private readonly service: PvCotizacionesCierreService) {}

  @Get(':idfol/cierre/context')
  getContext(@Param('idfol') idfol: string, @CurrentUser() user: JwtPayload) {
    return this.service.getContext(idfol, user);
  }

  @Post(':idfol/cierre/preview')
  preview(
    @Param('idfol') idfol: string,
    @Body() dto: PvCotizacionCierrePreviewDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.preview(idfol, dto, user);
  }

  @Post(':idfol/cierre')
  close(
    @Param('idfol') idfol: string,
    @Body() dto: PvCotizacionCierreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.close(idfol, dto, user);
  }
}
