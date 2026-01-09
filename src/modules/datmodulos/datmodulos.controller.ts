import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatmodulosService } from './datmodulos.service';
import { CreateDatmoduloDto } from './dto/create-datmodulo.dto';
import { UpdateDatmoduloDto } from './dto/update-datmodulo.dto';

@ApiTags('datmodulos')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datmodulos')
export class DatmodulosController {
  constructor(private readonly service: DatmodulosService) {}

  @Get()
  findAll(
    @Query('codigo') codigo?: string,
    @Query('depto') depto?: string,
    @Query('nombre') nombre?: string,
  ) {
    return this.service.findAll({ codigo, depto, nombre });
  }

  @Get(':codigo')
  findOne(@Param('codigo') codigo: string) {
    return this.service.findOne(codigo);
  }

  @Post()
  create(@Body() dto: CreateDatmoduloDto) {
    return this.service.create(dto);
  }

  @Patch(':codigo')
  update(@Param('codigo') codigo: string, @Body() dto: UpdateDatmoduloDto) {
    return this.service.update(codigo, dto);
  }

  @Delete(':codigo')
  remove(@Param('codigo') codigo: string) {
    return this.service.remove(codigo);
  }
}
