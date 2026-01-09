import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Get,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConteosService } from './conteos.service';
import type { JwtPayload } from '../auth/jwt.strategy';

@ApiTags('conteos')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('conteos')
export class ConteosController {
  constructor(private readonly service: ConteosService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('suc') suc?: string) {
    return this.service.listConteos(user, suc);
  }

  @Post(':cont/upload-items')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadItems(
    @Param('cont') cont: string,
    @UploadedFile() file: any,
    @Query('suc') suc: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.uploadItems(cont, file, user, suc);
  }

  @Post(':cont/process')
  process(@Param('cont') cont: string, @Query('suc') suc: string | undefined, @CurrentUser() user: JwtPayload) {
    return this.service.processConteo(cont, user, suc);
  }

  @Post(':cont/apply-adjustment')
  applyAdjustment(@Param('cont') cont: string, @Query('suc') suc: string | undefined, @CurrentUser() user: JwtPayload) {
    return this.service.applyAdjustment(cont, user, suc);
  }

  @Get(':cont/det')
  listDet(
    @Param('cont') cont: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('suc') suc: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listDetalles(cont, page, limit, user, suc);
  }

  @Get(':cont/summary')
  summary(@Param('cont') cont: string, @Query('suc') suc: string | undefined, @CurrentUser() user: JwtPayload) {
    return this.service.summaryConteo(cont, user, suc);
  }
}
