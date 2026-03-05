import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FactClientShpService } from './factclientshp.service';
import { CreateFactClientShpDto } from './dto/create-factclientshp.dto';
import { UpdateFactClientShpDto } from './dto/update-factclientshp.dto';

@ApiTags('factclientshp')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('factclientshp')
export class FactClientShpController {
  constructor(private readonly service: FactClientShpService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.service.findAll(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(Number(id), req.user);
  }

  @Post()
  create(@Body() dto: CreateFactClientShpDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFactClientShpDto,
    @Req() req: any,
  ) {
    return this.service.update(Number(id), dto, req.user);
  }
}
