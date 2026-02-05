import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PvTicketLogService } from './pvticketlog.service';
import { CreatePvTicketLogDto } from './dto/create-pvticketlog.dto';
import { UpdatePvTicketLogDto } from './dto/update-pvticketlog.dto';

@ApiTags('pvticketlog')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('pvticketlog')
export class PvTicketLogController {
  constructor(private readonly service: PvTicketLogService) {}

  @Get()
  findAll(@Query('idfol') idfol?: string) {
    return this.service.findAll(idfol);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePvTicketLogDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePvTicketLogDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
