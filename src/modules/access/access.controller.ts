import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessService } from './access.service';
import { CreateModuloDto } from './dto/create-modulo.dto';
import { UpdateModuloDto } from './dto/update-modulo.dto';
import { CreateGrupModuloDto } from './dto/create-grup-modulo.dto';
import { UpdateGrupModuloDto } from './dto/update-grup-modulo.dto';
import { AssignModulesToGroupDto } from './dto/assign-modules-to-group.dto';
import { AssignGroupToRolePermDto } from './dto/assign-group-to-role-perm.dto';
import { CreateModFrontDto } from './dto/create-mod-front.dto';
import { UpdateModFrontDto } from './dto/update-mod-front.dto';
import { CreateGrupmodFrontDto } from './dto/create-grupmod-front.dto';
import { UpdateGrupmodFrontDto } from './dto/update-grupmod-front.dto';
import { AssignFrontModulesToGroupDto } from './dto/assign-front-modules-to-group.dto';
import { AssignFrontGroupToRoleDto } from './dto/assign-front-group-to-role.dto';

@ApiTags('access')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('access')
export class AccessController {
  constructor(private readonly service: AccessService) {}

  private ok<T>(data: T, message = 'ok') {
    return { ok: true, data, message };
  }

  private includeInactives(value?: string) {
    return value === '1' || value?.toLowerCase() === 'true';
  }

  // -------- BACKEND MODULOS --------
  @Get('modulos')
  async listModulos(@Query('includeInactives') includeInactives?: string) {
    const rows = await this.service.listModulos(this.includeInactives(includeInactives));
    return this.ok(rows);
  }

  @Post('modulos')
  @UseGuards(AdminOnlyGuard)
  async createModulo(@Body() dto: CreateModuloDto) {
    const row = await this.service.createModulo(dto);
    return this.ok(row, 'created');
  }

  @Put('modulos/:id')
  @UseGuards(AdminOnlyGuard)
  async updateModulo(@Param('id') id: string, @Body() dto: UpdateModuloDto) {
    const row = await this.service.updateModulo(Number(id), dto);
    return this.ok(row, 'updated');
  }

  @Delete('modulos/:id')
  @UseGuards(AdminOnlyGuard)
  async deleteModulo(@Param('id') id: string) {
    const res = await this.service.deleteModulo(Number(id));
    return this.ok(res, 'deleted');
  }

  // -------- BACKEND GRUPOS --------
  @Get('grupos-modulo')
  async listGruposModulo(@Query('includeInactives') includeInactives?: string) {
    const rows = await this.service.listGruposModulo(this.includeInactives(includeInactives));
    return this.ok(rows);
  }

  @Post('grupos-modulo')
  @UseGuards(AdminOnlyGuard)
  async createGrupoModulo(@Body() dto: CreateGrupModuloDto) {
    const row = await this.service.createGrupoModulo(dto);
    return this.ok(row, 'created');
  }

  @Put('grupos-modulo/:id')
  @UseGuards(AdminOnlyGuard)
  async updateGrupoModulo(@Param('id') id: string, @Body() dto: UpdateGrupModuloDto) {
    const row = await this.service.updateGrupoModulo(Number(id), dto);
    return this.ok(row, 'updated');
  }

  @Delete('grupos-modulo/:id')
  @UseGuards(AdminOnlyGuard)
  async deleteGrupoModulo(@Param('id') id: string) {
    const res = await this.service.deleteGrupoModulo(Number(id));
    return this.ok(res, 'deleted');
  }

  // -------- BACKEND RELACIONES --------
  @Get('grupos-modulo/:id/modulos')
  async listGrupoModulos(@Param('id') id: string) {
    const rows = await this.service.getGrupoModulos(Number(id));
    return this.ok(rows);
  }

  @Post('grupos-modulo/:id/modulos')
  @UseGuards(AdminOnlyGuard)
  async setGrupoModulos(@Param('id') id: string, @Body() dto: AssignModulesToGroupDto) {
    const res = await this.service.setGrupoModulos(Number(id), dto);
    return this.ok(res, 'updated');
  }

  @Delete('grupos-modulo/:id/modulos/:idModulo')
  @UseGuards(AdminOnlyGuard)
  async deleteGrupoModuloRel(@Param('id') id: string, @Param('idModulo') idModulo: string) {
    const res = await this.service.deleteGrupoModuloRel(Number(id), Number(idModulo));
    return this.ok(res, 'deleted');
  }

  // -------- ROLES --------
  @Get('roles')
  async listRoles(@Query('includeInactives') includeInactives?: string) {
    const rows = await this.service.listRoles(this.includeInactives(includeInactives));
    return this.ok(rows);
  }

  // -------- BACKEND PERMS --------
  @Get('roles/:id/permisos-backend')
  async getBackendPerms(@Param('id') id: string, @Query('includeInactives') includeInactives?: string) {
    const rows = await this.service.getBackendPerms(
      Number(id),
      this.includeInactives(includeInactives),
    );
    return this.ok(rows);
  }

  @Post('roles/:id/permisos-backend')
  @UseGuards(AdminOnlyGuard)
  async setBackendPerm(@Param('id') id: string, @Body() dto: AssignGroupToRolePermDto) {
    const row = await this.service.setBackendPerm(Number(id), dto);
    return this.ok(row, 'updated');
  }

  // -------- FRONT MODULOS --------
  @Get('mod-front')
  async listModFront(@Query('includeInactives') includeInactives?: string) {
    const rows = await this.service.listModFront(this.includeInactives(includeInactives));
    return this.ok(rows);
  }

  @Post('mod-front')
  @UseGuards(AdminOnlyGuard)
  async createModFront(@Body() dto: CreateModFrontDto) {
    const row = await this.service.createModFront(dto);
    return this.ok(row, 'created');
  }

  @Put('mod-front/:id')
  @UseGuards(AdminOnlyGuard)
  async updateModFront(@Param('id') id: string, @Body() dto: UpdateModFrontDto) {
    const row = await this.service.updateModFront(Number(id), dto);
    return this.ok(row, 'updated');
  }

  @Delete('mod-front/:id')
  @UseGuards(AdminOnlyGuard)
  async deleteModFront(@Param('id') id: string) {
    const res = await this.service.deleteModFront(Number(id));
    return this.ok(res, 'deleted');
  }

  // -------- FRONT GRUPOS --------
  @Get('grupos-front')
  async listGruposFront(@Query('includeInactives') includeInactives?: string) {
    const rows = await this.service.listGruposFront(this.includeInactives(includeInactives));
    return this.ok(rows);
  }

  @Post('grupos-front')
  @UseGuards(AdminOnlyGuard)
  async createGrupoFront(@Body() dto: CreateGrupmodFrontDto) {
    const row = await this.service.createGrupoFront(dto);
    return this.ok(row, 'created');
  }

  @Put('grupos-front/:id')
  @UseGuards(AdminOnlyGuard)
  async updateGrupoFront(@Param('id') id: string, @Body() dto: UpdateGrupmodFrontDto) {
    const row = await this.service.updateGrupoFront(Number(id), dto);
    return this.ok(row, 'updated');
  }

  @Delete('grupos-front/:id')
  @UseGuards(AdminOnlyGuard)
  async deleteGrupoFront(@Param('id') id: string) {
    const res = await this.service.deleteGrupoFront(Number(id));
    return this.ok(res, 'deleted');
  }

  // -------- FRONT RELACIONES --------
  @Get('grupos-front/:id/mods')
  async listGrupoFrontMods(@Param('id') id: string) {
    const rows = await this.service.getGrupoFrontMods(Number(id));
    return this.ok(rows);
  }

  @Post('grupos-front/:id/mods')
  @UseGuards(AdminOnlyGuard)
  async setGrupoFrontMods(@Param('id') id: string, @Body() dto: AssignFrontModulesToGroupDto) {
    const res = await this.service.setGrupoFrontMods(Number(id), dto);
    return this.ok(res, 'updated');
  }

  // -------- FRONT ENROLAMIENTOS --------
  @Get('roles/:id/enrolamientos-front')
  async getFrontEnrollments(
    @Param('id') id: string,
    @Query('includeInactives') includeInactives?: string,
  ) {
    const rows = await this.service.getFrontEnrollments(
      Number(id),
      this.includeInactives(includeInactives),
    );
    return this.ok(rows);
  }

  @Post('roles/:id/enrolamientos-front')
  @UseGuards(AdminOnlyGuard)
  async setFrontEnrollment(@Param('id') id: string, @Body() dto: AssignFrontGroupToRoleDto) {
    const row = await this.service.setFrontEnrollment(Number(id), dto);
    return this.ok(row, 'updated');
  }

  // -------- FRONT MENU (ME) --------
  @Get('me/front-menu')
  async getFrontMenu(@CurrentUser() user: any) {
    const rows = await this.service.getFrontMenu(Number(user.roleId));
    return this.ok(rows);
  }
}
