import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFloatPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DatEstOrdService } from './datestord.service';
import { CreateDatEstOrdDto } from './dto/create-datestord.dto';
import { UpdateDatEstOrdDto } from './dto/update-datestord.dto';

@ApiTags('datestord')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datestord')
export class DatEstOrdController {
  constructor(private readonly service: DatEstOrdService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseFloatPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDatEstOrdDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseFloatPipe) id: number,
    @Body() dto: UpdateDatEstOrdDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseFloatPipe) id: number) {
    return this.service.remove(id);
  }
}
