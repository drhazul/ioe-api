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
import { PvCtrOrdsService } from './pvctrords.service';
import { CreateOrdFromQuoteLineDto } from './dto/create-ord-from-quote-line.dto';
import { DeleteOrdFromQuoteLineDto } from './dto/delete-ord-from-quote-line.dto';
import { CreatePvCtrOrdsDto } from './dto/create-pvctrords.dto';
import { UpdatePvCtrOrdsDto } from './dto/update-pvctrords.dto';

@ApiTags('pvctrords')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('pvctrords')
export class PvCtrOrdsController {
  constructor(private readonly service: PvCtrOrdsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':iord')
  findOne(@Param('iord') iord: string) {
    return this.service.findOne(iord);
  }

  @Post()
  create(@Body() dto: CreatePvCtrOrdsDto) {
    return this.service.create(dto);
  }

  @Post('create-from-quote-line')
  createFromQuoteLine(@Body() dto: CreateOrdFromQuoteLineDto) {
    return this.service.createFromQuoteLine(dto);
  }

  @Post('delete-from-quote-line')
  deleteFromQuoteLine(@Body() dto: DeleteOrdFromQuoteLineDto) {
    return this.service.deleteFromQuoteLine(dto);
  }

  @Patch(':iord')
  update(@Param('iord') iord: string, @Body() dto: UpdatePvCtrOrdsDto) {
    return this.service.update(iord, dto);
  }

  @Delete(':iord')
  remove(@Param('iord') iord: string) {
    return this.service.remove(iord);
  }
}
