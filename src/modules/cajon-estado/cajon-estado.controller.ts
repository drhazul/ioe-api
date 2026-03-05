import {
  Body,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CajonEstadoAutorizarDto } from './dto/cajon-estado-autorizar.dto';
import { CajonEstadoResumenQueryDto } from './dto/cajon-estado-resumen-query.dto';
import { CajonEstadoSupervisorGuard } from './guards/cajon-estado-supervisor.guard';
import { CajonEstadoService } from './cajon-estado.service';

@ApiTags('cajon-estado')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('cajon-estado')
export class CajonEstadoController {
  constructor(private readonly service: CajonEstadoService) {}

  @Post('autorizar')
  autorizar(
    @Body() dto: CajonEstadoAutorizarDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.autorizarSupervisor(dto, user, this.requestIp(req));
  }

  @Get('resumen')
  @UseGuards(CajonEstadoSupervisorGuard)
  resumen(
    @Query() query: CajonEstadoResumenQueryDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.getResumen(query, user, this.requestIp(req));
  }

  private requestIp(req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return ip ? String(ip) : null;
  }
}
