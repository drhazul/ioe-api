import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Datmb52Service } from './datmb52.service';
import { SearchDatMb52Dto } from './dto/search-datmb52.dto';

@ApiTags('dat-mb52')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('dat-mb52')
export class DatMb52ResumenController {
  constructor(private readonly service: Datmb52Service) {}

  @Post('resumen')
  resumen(@Body() dto: SearchDatMb52Dto) {
    return this.service.resumen(dto);
  }
}
