import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AddRetiroDetalleDto } from './dto/add-retiro-detalle.dto';
import { CreateRetiroDto } from './dto/create-retiro.dto';
import { SetRetiroEfectivoDto } from './dto/set-retiro-efectivo.dto';
import { RetirosService } from './retiros.service';

@ApiTags('retiros')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('retiros')
export class RetirosController {
  constructor(private readonly service: RetirosService) {}

  @Post()
  create(
    @Body() dto: CreateRetiroDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.create(dto, user, this.requestIp(req));
  }

  @Get('today')
  listToday(@CurrentUser() user: JwtPayload) {
    return this.service.listToday(user);
  }

  @Get(':idret')
  getById(@Param('idret') idret: string, @CurrentUser() user: JwtPayload) {
    return this.service.getById(idret, user);
  }

  @Post(':idret/detalles')
  addDetalle(
    @Param('idret') idret: string,
    @Body() dto: AddRetiroDetalleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.addDetalle(idret, dto, user, this.requestIp(req));
  }

  @Put('detalles/:idfor/efectivo')
  setEfectivo(
    @Param('idfor') idfor: string,
    @Body() dto: SetRetiroEfectivoDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.setEfectivo(idfor, dto, user, this.requestIp(req));
  }

  @Delete('detalles/:idfor')
  deleteDetalle(
    @Param('idfor') idfor: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.deleteDetalle(idfor, user, this.requestIp(req));
  }

  @Post(':idret/finalize')
  finalize(
    @Param('idret') idret: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.finalize(idret, user, this.requestIp(req));
  }

  @Post(':idret/cancel')
  cancel(
    @Param('idret') idret: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.cancel(idret, user, this.requestIp(req));
  }

  private requestIp(req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return ip ? String(ip) : null;
  }
}
