import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class AusenciasCalendarioDto {
  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString({}, { message: 'fecha_inicio debe estar en formato ISO-8601' })
  fecha_inicio?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsDateString({}, { message: 'fecha_fin debe estar en formato ISO-8601' })
  fecha_fin?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt({ message: 'sucursal_id debe ser entero' })
  @Min(1, { message: 'sucursal_id debe ser mayor que 0' })
  sucursal_id?: number;
}
