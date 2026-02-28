import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PvTicketLogService } from './pvticketlog.service';
import { AuthorizePvTicketLogPriceDto } from './dto/authorize-pvticketlog-price.dto';
import { CreatePvTicketLogDto } from './dto/create-pvticketlog.dto';
import { UpdatePvTicketLogDto } from './dto/update-pvticketlog.dto';
import { UpdatePvTicketLogPriceDto } from './dto/update-pvticketlog-price.dto';

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

  @Post('precio/authorize')
  authorizePrice(
    @Body() dto: AuthorizePvTicketLogPriceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.authorizePrice(dto, user);
  }

  @Patch(':id/precio')
  updatePrice(
    @Param('id') id: string,
    @Body() dto: UpdatePvTicketLogPriceDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return this.service.updatePrice(id, dto, user, ip ? String(ip) : null);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
