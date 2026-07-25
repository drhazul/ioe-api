import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { FaltantesSobrantesService } from './faltantes-sobrantes.service';

@ApiTags('faltantes-sobrantes')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('faltantes-sobrantes')
export class FaltantesSobrantesController {
  constructor(private readonly service: FaltantesSobrantesService) {}

  @Get('reportes/catalogos')
  catalogos(@CurrentUser() user: JwtPayload) {
    return this.service.catalogos(user);
  }

  @Get('reportes/ajustes')
  reporteAjustes(
    @Query('suc') suc: string,
    @Query('qna') qna: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reporteAjustes(suc, qna, user);
  }
}
