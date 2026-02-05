import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatRetDetSvrService } from './datretdetsvr.service';
import { CreateDatRetDetSvrDto } from './dto/create-datretdetsvr.dto';
import { UpdateDatRetDetSvrDto } from './dto/update-datretdetsvr.dto';

@ApiTags('datretdetsvr')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datretdetsvr')
export class DatRetDetSvrController {
  constructor(private readonly service: DatRetDetSvrService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDatRetDetSvrDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDatRetDetSvrDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
