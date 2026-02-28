import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateIncidenciaStatusDto {
  @ApiProperty({ enum: ['SOLICITADA', 'APROBADA', 'RECHAZADA', 'CERRADA'] })
  @IsString()
  @IsIn(['SOLICITADA', 'APROBADA', 'RECHAZADA', 'CERRADA'])
  ESTATUS: string;

  @ApiPropertyOptional({ description: 'Usuario aprobador/rechazador' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  APROBADA_POR?: number;

  @ApiPropertyOptional({ description: 'Motivo/observacion del cambio' })
  @IsOptional()
  @IsString()
  @Length(1, 250)
  REASON?: string;
}
