import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatSucService } from './dat-suc.service';
import { CreateDatSucDto } from './dto/create-dat-suc.dto';
import { UpdateDatSucDto } from './dto/update-dat-suc.dto';
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';


@ApiTags('dat-suc')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('dat-suc')
export class DatSucController {
  constructor(private readonly service: DatSucService) {}

  @Get()
  findAll(
    @Query('suc') suc?: string,
    @Query('desc') desc?: string,
  ) {
    return this.service.findAll({ suc, desc });
  }

  @Get(':suc')
  findOne(@Param('suc') suc: string) {
    return this.service.findOne(suc);
  }

  @Post()
  create(@Body() dto: CreateDatSucDto) {
    return this.service.create(dto);
  }

  @Patch(':suc')
  update(@Param('suc') suc: string, @Body() dto: UpdateDatSucDto) {
    return this.service.update(suc, dto);
  }

  @Delete(':suc')
  remove(@Param('suc') suc: string) {
    return this.service.remove(suc);
  }
}
