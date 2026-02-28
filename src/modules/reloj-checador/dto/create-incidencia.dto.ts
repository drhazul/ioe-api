import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateIncidenciaDto {
  @ApiPropertyOptional({ description: 'Usuario de la incidencia (default usuario JWT)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDUSUARIO?: number;

  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;

  @ApiProperty({ enum: ['VACACIONES', 'PERMISO_GOCE', 'PERMISO_SIN_GOCE', 'INCAPACIDAD', 'FALTA', 'RETARDO', 'OTRO'] })
  @IsString()
  @IsIn(['VACACIONES', 'PERMISO_GOCE', 'PERMISO_SIN_GOCE', 'INCAPACIDAD', 'FALTA', 'RETARDO', 'OTRO'])
  TIPO: string;

  @ApiProperty({ description: 'Fecha inicio YYYY-MM-DD' })
  @IsDateString()
  FECHA_INI: string;

  @ApiProperty({ description: 'Fecha fin YYYY-MM-DD' })
  @IsDateString()
  FECHA_FIN: string;

  @ApiPropertyOptional({ description: 'Motivo libre' })
  @IsOptional()
  @IsString()
  @Length(1, 250)
  MOTIVO?: string;

  @ApiPropertyOptional({ enum: ['SOLICITADA', 'APROBADA', 'RECHAZADA', 'CERRADA'] })
  @IsOptional()
  @IsString()
  @IsIn(['SOLICITADA', 'APROBADA', 'RECHAZADA', 'CERRADA'])
  ESTATUS?: string;

  @ApiPropertyOptional({ description: 'Usuario aprobador inicial' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  APROBADA_POR?: number;
}
