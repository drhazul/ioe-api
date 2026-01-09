import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatContCtrlService } from './datcontctrl.service';
import { CreateDatContCtrlDto } from './dto/create-datcontctrl.dto';
import { UpdateDatContCtrlDto } from './dto/update-datcontctrl.dto';

@ApiTags('datcontctrl')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datcontctrl')
export class DatContCtrlController {
  constructor(private readonly service: DatContCtrlService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':tokenreg')
  findOne(@Param('tokenreg') tokenreg: string) {
    return this.service.findOne(tokenreg);
  }

  @Post()
  create(@Body() dto: CreateDatContCtrlDto) {
    return this.service.create(dto);
  }

  @Patch(':tokenreg')
  update(@Param('tokenreg') tokenreg: string, @Body() dto: UpdateDatContCtrlDto) {
    return this.service.update(tokenreg, dto);
  }

  @Delete(':tokenreg')
  remove(@Param('tokenreg') tokenreg: string) {
    return this.service.remove(tokenreg);
  }
}
