import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatAlmacenService } from './dat-almacen.service';

@ApiTags('dat-almacen')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('dat-almacen')
export class DatAlmacenController {
  constructor(private readonly service: DatAlmacenService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
