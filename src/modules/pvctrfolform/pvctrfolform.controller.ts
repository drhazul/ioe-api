import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PvCtrFolFormService } from './pvctrfolform.service';
import { CreatePvCtrFolFormDto } from './dto/create-pvctrfolform.dto';
import { UpdatePvCtrFolFormDto } from './dto/update-pvctrfolform.dto';

@ApiTags('pvctrfolform')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('pvctrfolform')
export class PvCtrFolFormController {
  constructor(private readonly service: PvCtrFolFormService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':idf')
  findOne(@Param('idf') idf: string) {
    return this.service.findOne(idf);
  }

  @Post()
  create(@Body() dto: CreatePvCtrFolFormDto) {
    return this.service.create(dto);
  }

  @Patch(':idf')
  update(@Param('idf') idf: string, @Body() dto: UpdatePvCtrFolFormDto) {
    return this.service.update(idf, dto);
  }

  @Delete(':idf')
  remove(@Param('idf') idf: string) {
    return this.service.remove(idf);
  }
}
