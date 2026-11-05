import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DevelopmentBusinessGuard } from '../../common/guards/development-business.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreditosConfigService } from './creditos-config.service';
import {
  CreditosConfigDto,
  CreditosSucursalConfigDto,
} from './dto/creditos-config.dto';

@ApiTags('empresas')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, DevelopmentBusinessGuard)
@Controller('empresas/:id/configuracion/creditos')
export class CreditosConfigController {
  constructor(private readonly service: CreditosConfigService) {}

  @Get()
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.service.get(id, user);
  }

  @Patch()
  set(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreditosConfigDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.set(id, dto, user);
  }

  @Patch('sucursales/:suc')
  setSucursal(
    @Param('id', ParseIntPipe) id: number,
    @Param('suc') suc: string,
    @Body() dto: CreditosSucursalConfigDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.setSucursal(id, suc, dto, user);
  }
}
