import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RefDetalleService } from './refdetalle.service';
import { CreateRefDetalleDto } from './dto/create-refdetalle.dto';
import { UpdateRefDetalleDto } from './dto/update-refdetalle.dto';

@ApiTags('refdetalle')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('refdetalle')
export class RefDetalleController {
  constructor(private readonly service: RefDetalleService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':idref')
  findOne(@Param('idref') idref: string) {
    return this.service.findOne(idref);
  }

  @Post()
  create(@Body() dto: CreateRefDetalleDto) {
    return this.service.create(dto);
  }

  @Patch(':idref')
  update(@Param('idref') idref: string, @Body() dto: UpdateRefDetalleDto) {
    return this.service.update(idref, dto);
  }

  @Delete(':idref')
  remove(@Param('idref') idref: string) {
    return this.service.remove(idref);
  }
}
