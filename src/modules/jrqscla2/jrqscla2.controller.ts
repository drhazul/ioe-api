import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JrqScla2Service } from './jrqscla2.service';
import { CreateJrqScla2Dto } from './dto/create-jrqscla2.dto';
import { UpdateJrqScla2Dto } from './dto/update-jrqscla2.dto';

@ApiTags('jrqscla2')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('jrqscla2')
export class JrqScla2Controller {
  constructor(private readonly service: JrqScla2Service) {}

  @Get()
  findAll(@Query('scla') scla?: string) {
    return this.service.findAll({ scla });
  }

  @Get(':scla2')
  findOne(@Param('scla2') scla2: string) {
    return this.service.findOne(Number(scla2));
  }

  @Post()
  create(@Body() dto: CreateJrqScla2Dto) {
    return this.service.create(dto);
  }

  @Patch(':scla2')
  update(@Param('scla2') scla2: string, @Body() dto: UpdateJrqScla2Dto) {
    return this.service.update(Number(scla2), dto);
  }

  @Delete(':scla2')
  remove(@Param('scla2') scla2: string) {
    return this.service.remove(Number(scla2));
  }
}
