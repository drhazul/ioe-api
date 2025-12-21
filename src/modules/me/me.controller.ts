import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  @Get('front-menu')
  getFrontMenu(@CurrentUser() user: any) {
    return this.service.getFrontMenu(Number(user.roleId));
  }

  @Get('backend-perms')
  getBackendPerms(@CurrentUser() user: any) {
    return this.service.getBackendPerms(Number(user.roleId));
  }
}
