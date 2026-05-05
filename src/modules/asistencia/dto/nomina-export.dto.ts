import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AsistenciaReporteDto } from './asistencia-reporte.dto';

export class NominaExportDto extends AsistenciaReporteDto {
  @ApiPropertyOptional({
    description: 'Formato de salida',
    enum: ['csv', 'excel', 'xlsx'],
    default: 'csv',
  })
  @IsOptional()
  @IsString()
  @IsIn(['csv', 'excel', 'xlsx'])
  format?: 'csv' | 'excel' | 'xlsx';

  @ApiPropertyOptional({
    description: 'Columnas separadas por coma',
    example: 'fecha,pin,nombre,entrada,salida,estatus',
  })
  @IsOptional()
  @IsString()
  columns?: string;
}
