import {
  Body,
  Controller,
  Get,
  Param,
  Query,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { ListFormaPagoCambioTodayQueryDto } from './dto/list-forma-pago-cambio-today-query.dto';
import { UpdateFormaPagoCambioDto } from './dto/update-forma-pago-cambio.dto';
import { FormasPagoCambiosService } from './formas-pago-cambios.service';

@ApiTags('formas-pago')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('formas-pago')
export class FormasPagoCambiosController {
  constructor(private readonly service: FormasPagoCambiosService) {}

  @Get('catalogos')
  listCatalog() {
    return this.service.listCatalog();
  }

  @Get('cambios/today')
  listToday(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListFormaPagoCambioTodayQueryDto,
  ) {
    return this.service.listToday(user, query);
  }

  @Put('cambios/:idf')
  updateForma(
    @Param('idf') idf: string,
    @Body() dto: UpdateFormaPagoCambioDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return this.service.updateForma(idf, dto, user, ip ? String(ip) : null);
  }
}
