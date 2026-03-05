import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CatCtasService } from './cat-ctas.service';
import { CreateCatCtaDto } from './dto/create-cat-cta.dto';
import { UpdateCatCtaDto } from './dto/update-cat-cta.dto';

@ApiTags('cat-ctas')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('cat-ctas')
export class CatCtasController {
  constructor(private readonly service: CatCtasService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('suc') suc?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    return this.service.findAll({ search, suc, page, limit }, req?.user);
  }

  @Get(':cta')
  findOne(@Param('cta') cta: string, @Req() req?: any) {
    return this.service.findOne(cta, req?.user);
  }

  @Post()
  create(@Body() dto: CreateCatCtaDto, @Req() req?: any) {
    return this.service.create(dto, req?.user);
  }

  @Put(':cta')
  update(
    @Param('cta') cta: string,
    @Body() dto: UpdateCatCtaDto,
    @Req() req?: any,
  ) {
    return this.service.update(cta, dto, req?.user);
  }

  @Delete(':cta')
  remove(@Param('cta') cta: string, @Req() req?: any) {
    return this.service.remove(cta, req?.user);
  }
}
