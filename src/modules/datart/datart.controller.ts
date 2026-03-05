import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DatArtService } from './datart.service';
import { CreateDatArtDto } from './dto/create-datart.dto';
import { UpdateDatArtDto } from './dto/update-datart.dto';
import type { JwtPayload } from '../auth/jwt.strategy';

@ApiTags('datart')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('datart')
export class DatArtController {
  constructor(private readonly service: DatArtService) {}

  @Get()
  findAll(
    @Query('suc') suc?: string,
    @Query('art') art?: string,
    @Query('upc') upc?: string,
    @Query('des') des?: string,
    @Query('tipo') tipo?: string,
    @Query('modelo') modelo?: string,
    @Query('depa') depa?: string,
    @Query('subd') subd?: string,
    @Query('clas') clas?: string,
    @Query('scla') scla?: string,
    @Query('scla2') scla2?: string,
    @Query('sph') sph?: string,
    @Query('cyl') cyl?: string,
    @Query('adic') adic?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('withTotal') withTotal?: string,
    @Query('view') view?: string,
    @Query('loteId') loteId?: string,
  ) {
    return this.service.findAll({
      suc,
      art,
      upc,
      des,
      tipo,
      modelo,
      depa,
      subd,
      clas,
      scla,
      scla2,
      sph,
      cyl,
      adic,
      page,
      limit,
      withTotal,
      view,
      loteId,
    });
  }

  @Get(':suc/:art/:upc')
  findOne(
    @Param('suc') suc: string,
    @Param('art') art: string,
    @Param('upc') upc: string,
  ) {
    return this.service.findOne(suc, art, upc);
  }

  @Post()
  create(@Body() dto: CreateDatArtDto) {
    return this.service.create(dto);
  }

  @Patch(':suc/:art/:upc')
  update(
    @Param('suc') suc: string,
    @Param('art') art: string,
    @Param('upc') upc: string,
    @Body() dto: UpdateDatArtDto,
  ) {
    return this.service.update(suc, art, upc, dto);
  }

  @Delete(':suc/:art/:upc')
  remove(
    @Param('suc') suc: string,
    @Param('art') art: string,
    @Param('upc') upc: string,
  ) {
    return this.service.remove(suc, art, upc);
  }

  @Post('massive-upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  massiveUpload(@UploadedFile() file: any, @CurrentUser() user: JwtPayload) {
    return this.service.massiveUpload(file, user);
  }
}
