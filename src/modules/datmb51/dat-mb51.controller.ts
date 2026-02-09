import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Datmb51Service } from './datmb51.service';
import { SearchDatMb51Dto } from './dto/search-datmb51.dto';

@ApiTags('dat-mb51')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('dat-mb51')
export class DatMb51SearchController {
  constructor(private readonly service: Datmb51Service) {}

  @Post('search')
  search(@Body() dto: SearchDatMb51Dto) {
    return this.service.search(dto);
  }
}
