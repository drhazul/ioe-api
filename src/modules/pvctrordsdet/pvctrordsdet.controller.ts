import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PvCtrOrdsDetService } from './pvctrordsdet.service';
import { CreatePvCtrOrdsDetDto } from './dto/create-pvctrordsdet.dto';
import { UpdatePvCtrOrdsDetDto } from './dto/update-pvctrordsdet.dto';

@ApiTags('pvctrordsdet')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('pvctrordsdet')
export class PvCtrOrdsDetController {
  constructor(private readonly service: PvCtrOrdsDetService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':iordp')
  findOne(@Param('iordp') iordp: string) {
    return this.service.findOne(iordp);
  }

  @Post()
  create(@Body() dto: CreatePvCtrOrdsDetDto) {
    return this.service.create(dto);
  }

  @Patch(':iordp')
  update(@Param('iordp') iordp: string, @Body() dto: UpdatePvCtrOrdsDetDto) {
    return this.service.update(iordp, dto);
  }

  @Delete(':iordp')
  remove(@Param('iordp') iordp: string) {
    return this.service.remove(iordp);
  }
}
