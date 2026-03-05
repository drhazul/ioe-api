import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RetirosService } from './retiros.service';

@ApiTags('catalogos')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('catalogos')
export class RetirosCatalogosController {
  constructor(private readonly service: RetirosService) {}

  @Get('formas-retiro')
  listFormasRetiro() {
    return this.service.listFormasRetiro();
  }
}

