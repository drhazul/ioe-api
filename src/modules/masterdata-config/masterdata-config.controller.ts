import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MasterdataConfigService } from './masterdata-config.service';

@ApiTags('masterdata-config')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('masterdata/configuracion-maestra')
export class MasterdataConfigController {
  constructor(private readonly service: MasterdataConfigService) {}

  @Get()
  getConfig() {
    return this.service.getConfig();
  }

  @Put()
  saveConfig(@Body() payload: Record<string, unknown>) {
    return this.service.saveConfig(payload);
  }
}

