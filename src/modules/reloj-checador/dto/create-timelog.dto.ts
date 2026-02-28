import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateTimelogDto {
  @ApiPropertyOptional({ description: 'Sucursal objetivo (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;

  @ApiProperty({ enum: ['ENTRADA', 'SALIDA_COMER', 'REGRESO_COMER', 'SALIDA'] })
  @IsString()
  @IsIn(['ENTRADA', 'SALIDA_COMER', 'REGRESO_COMER', 'SALIDA'])
  TIPO: string;

  @ApiProperty({ enum: ['FACE', 'FINGER', 'PIN'] })
  @IsString()
  @IsIn(['FACE', 'FINGER', 'PIN'])
  AUTH_METHOD: string;

  @ApiPropertyOptional({ description: 'Bandera de liveness para FACE' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  LIVENESS_OK?: number;

  @ApiPropertyOptional({ description: 'Latitud GPS' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  LAT?: number;

  @ApiPropertyOptional({ description: 'Longitud GPS' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  LON?: number;

  @ApiPropertyOptional({ description: 'Precision del GPS en metros' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  GPS_ACCURACY_M?: number;

  @ApiPropertyOptional({ description: 'Identificador del dispositivo' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  DEVICE_ID?: string;

  @ApiPropertyOptional({ description: 'Notas opcionales' })
  @IsOptional()
  @IsString()
  @Length(1, 250)
  NOTES?: string;
}
