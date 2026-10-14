import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CfdiCorreoAccessGuard } from './cfdi-correo-access.guard';
import { ActualizarCorreoConfigDto } from './dto/actualizar-correo-config.dto';
import { ProbarCorreoDto } from './dto/probar-correo.dto';
import { CfdiCorreoService } from './cfdi-correo.service';
import { GoogleOAuthService } from './google-oauth.service';

@ApiTags('cfdi-correo')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, CfdiCorreoAccessGuard)
@Controller('cfdi/correo')
export class CfdiCorreoController {
  constructor(
    private readonly correo: CfdiCorreoService,
    private readonly oauth: GoogleOAuthService,
  ) {}

  @Get('configuracion')
  configuracion() {
    return this.correo.configuracion();
  }

  @Put('configuracion')
  guardarConfiguracion(@Body() dto: ActualizarCorreoConfigDto) {
    return this.correo.guardarConfiguracion(dto);
  }

  @Post('oauth/iniciar')
  iniciarOAuth() {
    return this.oauth.iniciar();
  }

  @Post('prueba')
  probar(@Body() dto: ProbarCorreoDto) {
    return this.correo.probar(dto);
  }

  @Get('envios')
  envios(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.correo.envios(limit ?? 50);
  }

  @Post('envios/:id/reintentar')
  reintentar(@Param('id', new ParseIntPipe()) id: number) {
    return this.correo.reintentar(id);
  }
}
