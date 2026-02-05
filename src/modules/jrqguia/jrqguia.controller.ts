import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JrqGuiaService } from './jrqguia.service';
import { CreateJrqGuiaDto } from './dto/create-jrqguia.dto';
import { UpdateJrqGuiaDto } from './dto/update-jrqguia.dto';

@ApiTags('jrqguia')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('jrqguia')
export class JrqGuiaController {
  constructor(private readonly service: JrqGuiaService) {}

  @Get()
  findAll(@Query('scla2') scla2?: string) {
    return this.service.findAll({ scla2 });
  }

  @Get(':guia')
  findOne(@Param('guia') guia: string) {
    return this.service.findOne(guia);
  }

  @Post()
  create(@Body() dto: CreateJrqGuiaDto) {
    return this.service.create(dto);
  }

  @Patch(':guia')
  update(@Param('guia') guia: string, @Body() dto: UpdateJrqGuiaDto) {
    return this.service.update(guia, dto);
  }

  @Delete(':guia')
  remove(@Param('guia') guia: string) {
    return this.service.remove(guia);
  }
}
