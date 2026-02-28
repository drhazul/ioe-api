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
import { DatFormService } from './dat-form.service';
import { CreateDatFormDto } from './dto/create-dat-form.dto';
import { UpdateDatFormDto } from './dto/update-dat-form.dto';
import { UpdateDatFormEstadoDto } from './dto/update-dat-form-estado.dto';

@ApiTags('dat-form')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('dat-form')
export class DatFormController {
  constructor(private readonly service: DatFormService) {}

  @Get()
  findAll(
    @Query('includeInactive') includeInactive?: string,
    @Query('form') form?: string,
    @Query('nom') nom?: string,
    @Query('estado') estado?: string,
  ) {
    return this.service.findAll({ includeInactive, form, nom, estado });
  }

  @Get(':idform')
  findOne(@Param('idform') idform: string) {
    return this.service.findOne(idform);
  }

  @Post()
  create(@Body() dto: CreateDatFormDto) {
    return this.service.create(dto);
  }

  @Patch(':idform')
  update(@Param('idform') idform: string, @Body() dto: UpdateDatFormDto) {
    return this.service.update(idform, dto);
  }

  @Patch(':idform/estado')
  updateEstado(
    @Param('idform') idform: string,
    @Body() dto: UpdateDatFormEstadoDto,
  ) {
    return this.service.updateEstado(idform, dto.estado);
  }

  @Delete(':idform')
  remove(@Param('idform') idform: string) {
    return this.service.remove(idform);
  }
}
