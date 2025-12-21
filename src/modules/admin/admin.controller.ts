import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { AdminService } from './admin.service';
import { SetFrontGroupsDto } from './dto/set-front-groups.dto';
import { SetBackendPermsDto } from './dto/set-backend-perms.dto';



@ApiTags('admin')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  // FRONT
  @Get('roles/:id/front-groups')
  getFront(@Param('id') id: string) {
    return this.service.getFrontGroups(Number(id));
  }

  @Post('roles/:id/front-groups')
  setFront(@Param('id') id: string, @Body() dto: SetFrontGroupsDto) {
    return this.service.setFrontGroups(Number(id), dto);
  }

  // BACKEND
  @Get('roles/:id/backend-perms')
  getBackend(@Param('id') id: string) {
    return this.service.getBackendPerms(Number(id));
  }

  @Post('roles/:id/backend-perms')
  setBackend(@Param('id') id: string, @Body() dto: SetBackendPermsDto) {
    return this.service.setBackendPerms(Number(id), dto);
  }
    // CATALOGS (para UI)
  @Get('catalog/backend')
  getCatalogBackend() {
    return this.service.getCatalogBackend();
  }

  @Get('catalog/front')
  getCatalogFront() {
    return this.service.getCatalogFront();
  }
}
