import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class ListSolicitudesDto {
  @ApiPropertyOptional({ example: 11 })
  @IsOptional()
  @IsInt({ message: 'colaborador_id debe ser entero' })
  @Min(1, { message: 'colaborador_id debe ser mayor que 0' })
  colaborador_id?: number;

  @ApiPropertyOptional({ example: 'PENDIENTE' })
  @IsOptional()
  @IsIn(['PENDIENTE', 'APROBADO', 'RECHAZADO'], {
    message: 'estatus inválido. Usa PENDIENTE, APROBADO o RECHAZADO',
  })
  estatus?: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString({}, { message: 'fecha_inicio debe estar en formato ISO-8601' })
  fecha_inicio?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsDateString({}, { message: 'fecha_fin debe estar en formato ISO-8601' })
  fecha_fin?: string;
}
