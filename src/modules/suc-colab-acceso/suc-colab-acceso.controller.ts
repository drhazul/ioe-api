import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateSucColabAccesoDto } from './dto/create-suc-colab-acceso.dto';
import { UpdateSucColabAccesoDto } from './dto/update-suc-colab-acceso.dto';
import { SucColabAccesoService } from './suc-colab-acceso.service';

@ApiTags('suc-colab-acceso')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('suc-colab-acceso')
export class SucColabAccesoController {
  constructor(private readonly service: SucColabAccesoService) {}

  @Get()
  findAll(
    @Query('includeInactive') includeInactive?: string,
    @Query('sucDestino') sucDestino?: string,
    @Query('sucOrigen') sucOrigen?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({
      includeInactive,
      sucDestino,
      sucOrigen,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSucColabAccesoDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSucColabAccesoDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
