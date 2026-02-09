import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatCmovService } from './dat-cmov.service';

@ApiTags('dat-cmov')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('dat-cmov')
export class DatCmovController {
  constructor(private readonly service: DatCmovService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
