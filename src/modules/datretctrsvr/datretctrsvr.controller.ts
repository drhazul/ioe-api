import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatRetCtrSvrService } from './datretctrsvr.service';
import { CreateDatRetCtrSvrDto } from './dto/create-datretctrsvr.dto';
import { UpdateDatRetCtrSvrDto } from './dto/update-datretctrsvr.dto';

@ApiTags('datretctrsvr')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datretctrsvr')
export class DatRetCtrSvrController {
  constructor(private readonly service: DatRetCtrSvrService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':idret')
  findOne(@Param('idret') idret: string) {
    return this.service.findOne(idret);
  }

  @Post()
  create(@Body() dto: CreateDatRetCtrSvrDto) {
    return this.service.create(dto);
  }

  @Patch(':idret')
  update(@Param('idret') idret: string, @Body() dto: UpdateDatRetCtrSvrDto) {
    return this.service.update(idret, dto);
  }

  @Delete(':idret')
  remove(@Param('idret') idret: string) {
    return this.service.remove(idret);
  }
}
