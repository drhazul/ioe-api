import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatDetSvrService } from './datdetsvr.service';
import { CreateDatDetSvrDto } from './dto/create-datdetsvr.dto';
import { UpdateDatDetSvrDto } from './dto/update-datdetsvr.dto';

@ApiTags('datdetsvr')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datdetsvr')
export class DatDetSvrController {
  constructor(private readonly service: DatDetSvrService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateDatDetSvrDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDatDetSvrDto) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
