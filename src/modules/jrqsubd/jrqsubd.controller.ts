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
import { JrqSubdService } from './jrqsubd.service';
import { CreateJrqSubdDto } from './dto/create-jrqsubd.dto';
import { UpdateJrqSubdDto } from './dto/update-jrqsubd.dto';

@ApiTags('jrqsubd')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('jrqsubd')
export class JrqSubdController {
  constructor(private readonly service: JrqSubdService) {}

  @Get()
  findAll(@Query('depa') depa?: string) {
    return this.service.findAll({ depa });
  }

  @Get(':subd')
  findOne(@Param('subd') subd: string) {
    return this.service.findOne(Number(subd));
  }

  @Post()
  create(@Body() dto: CreateJrqSubdDto) {
    return this.service.create(dto);
  }

  @Patch(':subd')
  update(@Param('subd') subd: string, @Body() dto: UpdateJrqSubdDto) {
    return this.service.update(Number(subd), dto);
  }

  @Delete(':subd')
  remove(@Param('subd') subd: string) {
    return this.service.remove(Number(subd));
  }
}
