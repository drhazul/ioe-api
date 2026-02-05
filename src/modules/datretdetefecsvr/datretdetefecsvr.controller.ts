import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatRetDetEfecSvrService } from './datretdetefecsvr.service';
import { CreateDatRetDetEfecSvrDto } from './dto/create-datretdetefecsvr.dto';
import { UpdateDatRetDetEfecSvrDto } from './dto/update-datretdetefecsvr.dto';

@ApiTags('datretdetefecsvr')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datretdetefecsvr')
export class DatRetDetEfecSvrController {
  constructor(private readonly service: DatRetDetEfecSvrService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDatRetDetEfecSvrDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDatRetDetEfecSvrDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
