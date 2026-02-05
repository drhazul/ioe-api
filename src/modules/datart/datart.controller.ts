import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatArtService } from './datart.service';
import { CreateDatArtDto } from './dto/create-datart.dto';
import { UpdateDatArtDto } from './dto/update-datart.dto';

@ApiTags('datart')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datart')
export class DatArtController {
  constructor(private readonly service: DatArtService) {}

  @Get()
  findAll(
    @Query('suc') suc?: string,
    @Query('art') art?: string,
    @Query('upc') upc?: string,
    @Query('des') des?: string,
    @Query('tipo') tipo?: string,
    @Query('modelo') modelo?: string,
    @Query('depa') depa?: string,
    @Query('subd') subd?: string,
    @Query('clas') clas?: string,
    @Query('scla') scla?: string,
    @Query('scla2') scla2?: string,
    @Query('sph') sph?: string,
    @Query('cyl') cyl?: string,
    @Query('adic') adic?: string,
  ) {
    return this.service.findAll({
      suc,
      art,
      upc,
      des,
      tipo,
      modelo,
      depa,
      subd,
      clas,
      scla,
      scla2,
      sph,
      cyl,
      adic,
    });
  }

  @Get(':suc/:art/:upc')
  findOne(@Param('suc') suc: string, @Param('art') art: string, @Param('upc') upc: string) {
    return this.service.findOne(suc, art, upc);
  }

  @Post()
  create(@Body() dto: CreateDatArtDto) {
    return this.service.create(dto);
  }

  @Patch(':suc/:art/:upc')
  update(
    @Param('suc') suc: string,
    @Param('art') art: string,
    @Param('upc') upc: string,
    @Body() dto: UpdateDatArtDto,
  ) {
    return this.service.update(suc, art, upc, dto);
  }

  @Delete(':suc/:art/:upc')
  remove(@Param('suc') suc: string, @Param('art') art: string, @Param('upc') upc: string) {
    return this.service.remove(suc, art, upc);
  }
}
