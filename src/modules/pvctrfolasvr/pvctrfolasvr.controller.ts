import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PvCtrFolAsvrService } from './pvctrfolasvr.service';
import { CreatePvCtrFolAsvrDto } from './dto/create-pvctrfolasvr.dto';
import { UpdatePvCtrFolAsvrDto } from './dto/update-pvctrfolasvr.dto';
import { CreatePvCtrFolAsvrAutoDto } from './dto/create-pvctrfolasvr-auto.dto';
import { ListPvCtrFolAsvrQueryDto } from './dto/list-pvctrfolasvr-query.dto';
import type { JwtPayload } from '../auth/jwt.strategy';

@ApiTags('pvctrfolasvr')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('pvctrfolasvr')
export class PvCtrFolAsvrController {
  constructor(private readonly service: PvCtrFolAsvrService) {}

  @Get()
  findAll(
    @Query() query: ListPvCtrFolAsvrQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Get(':idfol')
  findOne(@Param('idfol') idfol: string) {
    return this.service.findOne(idfol);
  }

  @Post('auto')
  createAuto(@Body() dto: CreatePvCtrFolAsvrAutoDto, @CurrentUser() user: JwtPayload) {
    return this.service.createAuto(dto, user);
  }

  @Post()
  create(@Body() dto: CreatePvCtrFolAsvrDto) {
    return this.service.create(dto);
  }

  @Patch(':idfol')
  update(@Param('idfol') idfol: string, @Body() dto: UpdatePvCtrFolAsvrDto) {
    return this.service.update(idfol, dto);
  }

  @Delete(':idfol')
  remove(@Param('idfol') idfol: string) {
    return this.service.remove(idfol);
  }
}
