import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Datmb51Service } from './datmb51.service';
import { CreateDatmb51Dto } from './dto/create-datmb51.dto';
import { UpdateDatmb51Dto } from './dto/update-datmb51.dto';

@ApiTags('datmb51')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datmb51')
export class Datmb51Controller {
  constructor(private readonly service: Datmb51Service) {}

  @Get()
  findAll(
    @Query('idpd') idpd?: string,
    @Query('user') user?: string,
    @Query('art') art?: string,
    @Query('almacen') almacen?: string,
    @Query('suc') suc?: string,
  ) {
    return this.service.findAll({ idpd, user, art, almacen, suc });
  }

  @Get(':idpd')
  findOne(@Param('idpd') idpd: string) {
    return this.service.findOne(idpd);
  }

  @Post()
  create(@Body() dto: CreateDatmb51Dto) {
    return this.service.create(dto);
  }

  @Patch(':idpd')
  update(@Param('idpd') idpd: string, @Body() dto: UpdateDatmb51Dto) {
    return this.service.update(idpd, dto);
  }

  @Delete(':idpd')
  remove(@Param('idpd') idpd: string) {
    return this.service.remove(idpd);
  }
}
