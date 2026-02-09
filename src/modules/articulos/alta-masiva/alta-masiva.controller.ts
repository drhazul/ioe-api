import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AltaMasivaService } from './alta-masiva.service';
import { AltaMasivaBatchDto } from './dto/alta-masiva-batch.dto';

@ApiTags('articulos-alta-masiva')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('articulos/alta-masiva')
export class AltaMasivaController {
  constructor(private readonly service: AltaMasivaService) {}

  @Post('upload')
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
  upload(@UploadedFile() file: any) {
    return this.service.upload(file);
  }

  @Post('preview')
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
  preview(@UploadedFile() file: any) {
    return this.service.preview(file);
  }

  @Post('validate')
  validate(@Body() dto: AltaMasivaBatchDto) {
    return this.service.validate(dto.batchId);
  }

  @Post('commit')
  commit(@Body() dto: AltaMasivaBatchDto) {
    return this.service.commit(dto.batchId);
  }
}
