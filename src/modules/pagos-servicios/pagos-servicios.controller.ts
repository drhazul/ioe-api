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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AddPsFormaPagoDto } from './dto/add-ps-forma-pago.dto';
import { AddPsTicketServiceDto } from './dto/add-ps-ticket-service.dto';
import { CreatePsFolioDto } from './dto/create-ps-folio.dto';
import { DeletePsTicketLineDto } from './dto/delete-ps-ticket-line.dto';
import { ListPsFoliosQueryDto } from './dto/list-ps-folios-query.dto';
import { SetPsTicketReferenceFolioDto } from './dto/set-ps-ticket-reference-folio.dto';
import { SetPsTicketReferenceGastoDto } from './dto/set-ps-ticket-reference-gasto.dto';
import { UpdatePsFolioClienteDto } from './dto/update-ps-folio-cliente.dto';
import { UpdatePsTicketPvtaDto } from './dto/update-ps-ticket-pvta.dto';
import { FinalizePsPagoDto } from './dto/finalize-ps-pago.dto';
import { PagosServiciosService } from './pagos-servicios.service';

@ApiTags('pagos-servicios')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('ps')
export class PagosServiciosController {
  constructor(private readonly service: PagosServiciosService) {}

  @Get('folios')
  listFolios(
    @Query() query: ListPsFoliosQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listFolios(query, user);
  }

  @Post('folios')
  createFolio(
    @Body() dto: CreatePsFolioDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.createFolio(dto, user, this.requestIp(req));
  }

  @Get('folios/:idFol')
  getPanel(@Param('idFol') idFol: string, @CurrentUser() user: JwtPayload) {
    return this.service.getPanel(idFol, user);
  }

  @Put('folios/:idFol/cliente')
  updateFolioCliente(
    @Param('idFol') idFol: string,
    @Body() dto: UpdatePsFolioClienteDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.updateFolioCliente(
      idFol,
      dto,
      user,
      this.requestIp(req),
    );
  }

  @Post('folios/:idFol/ticket/service')
  addTicketService(
    @Param('idFol') idFol: string,
    @Body() dto: AddPsTicketServiceDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.addTicketService(idFol, dto, user, this.requestIp(req));
  }

  @Get('clientes/:client/adeudos')
  getAdeudosCliente(
    @Param('client') client: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getAdeudosCliente(client, user);
  }

  @Get('clientes/:client/adeudos/:idFol/detalle')
  getAdeudosFolioDetalle(
    @Param('client') client: string,
    @Param('idFol') idFol: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getAdeudosFolioDetalle(client, idFol, user);
  }

  @Post('folios/:idFol/ticket/reference/folio')
  setTicketReferenceFolio(
    @Param('idFol') idFol: string,
    @Body() dto: SetPsTicketReferenceFolioDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.setTicketReferenceFolio(
      idFol,
      dto,
      user,
      this.requestIp(req),
    );
  }

  @Post('folios/:idFol/ticket/reference/gasto')
  setTicketReferenceGasto(
    @Param('idFol') idFol: string,
    @Body() dto: SetPsTicketReferenceGastoDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.setTicketReferenceGasto(
      idFol,
      dto,
      user,
      this.requestIp(req),
    );
  }

  @Put('folios/:idFol/ticket/pvta')
  updateTicketPvta(
    @Param('idFol') idFol: string,
    @Body() dto: UpdatePsTicketPvtaDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.updateTicketPvta(idFol, dto, user, this.requestIp(req));
  }

  @Delete('folios/:idFol/ticket/line')
  deleteTicketLine(
    @Param('idFol') idFol: string,
    @Body() dto: DeletePsTicketLineDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.deleteTicketLine(idFol, dto, user, this.requestIp(req));
  }

  @Post('folios/:idFol/procesar')
  procesar(
    @Param('idFol') idFol: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.procesar(idFol, user, this.requestIp(req));
  }

  @Post('folios/:idFol/formas-pago')
  addFormaPago(
    @Param('idFol') idFol: string,
    @Body() dto: AddPsFormaPagoDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.addFormaPago(idFol, dto, user, this.requestIp(req));
  }

  @Delete('folios/:idFol/formas-pago/:idF')
  deleteFormaPago(
    @Param('idFol') idFol: string,
    @Param('idF') idF: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.deleteFormaPago(idFol, idF, user, this.requestIp(req));
  }

  @Get('folios/:idFol/formas-pago/summary')
  summaryFormaPago(
    @Param('idFol') idFol: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.summaryFormaPago(idFol, user);
  }

  @Post('folios/:idFol/finalizar')
  finalizarPago(
    @Param('idFol') idFol: string,
    @Body() dto: FinalizePsPagoDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    return this.service.finalizarPago(idFol, dto, user, this.requestIp(req));
  }

  private requestIp(req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.socket?.remoteAddress ||
      null;
    return ip ? String(ip) : null;
  }
}
