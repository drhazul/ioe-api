import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JrqDepaService } from './jrqdepa.service';
import { CreateJrqDepaDto } from './dto/create-jrqdepa.dto';
import { UpdateJrqDepaDto } from './dto/update-jrqdepa.dto';

@ApiTags('jrqdepa')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('jrqdepa')
export class JrqDepaController {
  constructor(private readonly service: JrqDepaService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateJrqDepaDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateJrqDepaDto) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
