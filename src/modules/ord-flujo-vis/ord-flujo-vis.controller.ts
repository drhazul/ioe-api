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
import { CreateOrdFlujoVisDto } from './dto/create-ord-flujo-vis.dto';
import { UpdateOrdFlujoVisDto } from './dto/update-ord-flujo-vis.dto';
import { UpdateOrdFlujoVisEstadoDto } from './dto/update-ord-flujo-vis-estado.dto';
import { OrdFlujoVisService } from './ord-flujo-vis.service';

@ApiTags('ord-flujo-vis')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('ord-flujo-vis')
export class OrdFlujoVisController {
  constructor(private readonly service: OrdFlujoVisService) {}

  @Get()
  findAll(
    @Query('includeInactive') includeInactive?: string,
    @Query('modulo') modulo?: string,
    @Query('panelMode') panelMode?: string,
    @Query('roleCode') roleCode?: string,
    @Query('esta') esta?: string,
  ) {
    return this.service.findAll({
      includeInactive,
      modulo,
      panelMode,
      roleCode,
      esta,
    });
  }

  @Get('catalogos')
  getCatalogos() {
    return this.service.getCatalogos();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateOrdFlujoVisDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrdFlujoVisDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/estado')
  updateEstado(
    @Param('id') id: string,
    @Body() dto: UpdateOrdFlujoVisEstadoDto,
  ) {
    return this.service.updateEstado(id, dto.estado);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
