import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AsistenciaReporteDto } from './dto/asistencia-reporte.dto';
import { NominaExportDto } from './dto/nomina-export.dto';
import { PeriodoCierreDto } from './dto/periodo-cierre.dto';
import { ProcessCheckinDto } from './dto/process-checkin.dto';
import { AsistenciaService } from './asistencia.service';
import { CheckinsProcessorService } from './checkins-processor.service';
import { ExportService } from './export.service';

@ApiTags('asistencia')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('asistencia')
export class AsistenciaController {
  constructor(
    private readonly service: AsistenciaService,
    private readonly exportService: ExportService,
    private readonly checkinsProcessor: CheckinsProcessorService,
  ) {}

  @Get(['reporte', ''])
  reporte(@Query() query: AsistenciaReporteDto) {
    return this.service.reporte(query);
  }

  @Get('procesar-dia')
  procesarDia(@Query('fecha') fecha?: string) {
    return this.service.processDailyAttendance(fecha);
  }

  @Get('marcajes-huerfanos/procesar')
  procesarHuerfanos(@Query('fecha') fecha?: string) {
    return this.service.markOrphanMarks(fecha);
  }

  @Post('checkins/process')
  processCheckin(@Body() dto: ProcessCheckinDto) {
    return this.checkinsProcessor.processCheckIn(dto);
  }

  @Post('periodo/cerrar')
  closePeriodo(@CurrentUser() user: JwtPayload, @Body() dto: PeriodoCierreDto) {
    return this.service.setPeriodoCierre({
      fechaInicio: dto.fecha_inicio,
      fechaFin: dto.fecha_fin,
      cerrado: true,
      motivo: dto.motivo ?? null,
      actorId: Number(user?.sub ?? 0) || null,
    });
  }

  @Post('periodo/abrir')
  openPeriodo(@CurrentUser() user: JwtPayload, @Body() dto: PeriodoCierreDto) {
    return this.service.setPeriodoCierre({
      fechaInicio: dto.fecha_inicio,
      fechaFin: dto.fecha_fin,
      cerrado: false,
      motivo: dto.motivo ?? null,
      actorId: Number(user?.sub ?? 0) || null,
    });
  }

  @Get('periodo')
  listPeriodos() {
    return this.service.listPeriodosCierre();
  }

  @Get(['reporte/export/pdf', 'export/pdf'])
  async exportPdf(@Query() query: AsistenciaReporteDto, @Res() res: Response) {
    const report = await this.service.reporte(query);
    const buffer = await this.exportService.exportAsistenciaPdf(report);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="asistencia_${report.desde}_${report.hasta}.pdf"`,
    );
    res.send(buffer);
  }

  @Get(['reporte/export/excel', 'export/excel'])
  async exportExcel(
    @Query() query: AsistenciaReporteDto,
    @Res() res: Response,
  ) {
    const report = await this.service.reporte(query);
    const buffer = await this.exportService.exportAsistenciaExcel(report);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="asistencia_${report.desde}_${report.hasta}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get(['reporte/export/nomina', 'export/nomina'])
  async exportNomina(@Query() query: NominaExportDto, @Res() res: Response) {
    const report = await this.service.reporte(query);
    const columns = this.exportService.parseNominaColumns(query.columns);
    const format = (query.format ?? 'csv').toLowerCase();

    if (format === 'excel' || format === 'xlsx') {
      const buffer = await this.exportService.exportNominaExcel(
        report,
        columns,
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="nomina_${report.desde}_${report.hasta}.xlsx"`,
      );
      res.send(buffer);
      return;
    }

    const buffer = await this.exportService.exportNominaCsv(report, columns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="nomina_${report.desde}_${report.hasta}.csv"`,
    );
    res.send(buffer);
  }
}
