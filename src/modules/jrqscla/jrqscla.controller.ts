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
import { JrqSclaService } from './jrqscla.service';
import { CreateJrqSclaDto } from './dto/create-jrqscla.dto';
import { UpdateJrqSclaDto } from './dto/update-jrqscla.dto';

@ApiTags('jrqscla')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('jrqscla')
export class JrqSclaController {
  constructor(private readonly service: JrqSclaService) {}

  @Get()
  findAll(@Query('clas') clas?: string) {
    return this.service.findAll({ clas });
  }

  @Get(':scla')
  findOne(@Param('scla') scla: string) {
    return this.service.findOne(Number(scla));
  }

  @Post()
  create(@Body() dto: CreateJrqSclaDto) {
    return this.service.create(dto);
  }

  @Patch(':scla')
  update(@Param('scla') scla: string, @Body() dto: UpdateJrqSclaDto) {
    return this.service.update(Number(scla), dto);
  }

  @Delete(':scla')
  remove(@Param('scla') scla: string) {
    return this.service.remove(Number(scla));
  }
}
