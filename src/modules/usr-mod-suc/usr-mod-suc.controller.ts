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
import { UsrModSucService } from './usr-mod-suc.service';
import { CreateUsrModSucDto } from './dto/create-usr-mod-suc.dto';
import { UpdateUsrModSucDto } from './dto/update-usr-mod-suc.dto';

@ApiTags('usr-mod-suc')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('usr-mod-suc')
export class UsrModSucController {
  constructor(private readonly service: UsrModSucService) {}

  @Get()
  findAll(
    @Query('modulo') modulo?: string,
    @Query('usuario') usuario?: string,
    @Query('suc') suc?: string,
    @Query('activo') activo?: string,
    @Query('sucUsuario') sucUsuario?: string,
    @Query('depto') depto?: string,
  ) {
    return this.service.findAll({
      modulo,
      usuario,
      suc,
      activo,
      sucUsuario,
      depto,
    });
  }

  @Get(':modulo/:usuario/:suc')
  findOne(
    @Param('modulo') modulo: string,
    @Param('usuario') usuario: string,
    @Param('suc') suc: string,
  ) {
    return this.service.findOne(modulo, usuario, suc);
  }

  @Post()
  create(@Body() dto: CreateUsrModSucDto) {
    return this.service.create(dto);
  }

  @Patch(':modulo/:usuario/:suc')
  update(
    @Param('modulo') modulo: string,
    @Param('usuario') usuario: string,
    @Param('suc') suc: string,
    @Body() dto: UpdateUsrModSucDto,
  ) {
    return this.service.update(modulo, usuario, suc, dto);
  }

  @Delete(':modulo/:usuario/:suc')
  remove(
    @Param('modulo') modulo: string,
    @Param('usuario') usuario: string,
    @Param('suc') suc: string,
  ) {
    return this.service.remove(modulo, usuario, suc);
  }
}
