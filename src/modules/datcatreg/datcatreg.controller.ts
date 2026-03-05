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
import { DatCatRegService } from './datcatreg.service';
import { CreateDatCatRegDto } from './dto/create-datcatreg.dto';
import { UpdateDatCatRegDto } from './dto/update-datcatreg.dto';

@ApiTags('datcatreg')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datcatreg')
export class DatCatRegController {
  constructor(private readonly service: DatCatRegService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Post()
  create(@Body() dto: CreateDatCatRegDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDatCatRegDto) {
    return this.service.update(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
