import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JrqClasService } from './jrqclas.service';
import { CreateJrqClasDto } from './dto/create-jrqclas.dto';
import { UpdateJrqClasDto } from './dto/update-jrqclas.dto';

@ApiTags('jrqclas')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('jrqclas')
export class JrqClasController {
  constructor(private readonly service: JrqClasService) {}

  @Get()
  findAll(@Query('subd') subd?: string) {
    return this.service.findAll({ subd });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateJrqClasDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateJrqClasDto) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
