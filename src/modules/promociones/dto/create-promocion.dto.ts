import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreatePromocionDto {
  @ApiPropertyOptional({ example: 'DF01' })
  @IsOptional()
  @IsString()
  @Length(0, 10)
  SUC?: string;

  @ApiPropertyOptional({ example: 'DESCUENTO' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  T_PROM?: string;

  @ApiPropertyOptional({ example: 'PORCENTAJE' })
  @IsOptional()
  @IsString()
  @Length(0, 30)
  TIPO_DESC?: string;

  @ApiPropertyOptional({ example: '2026-05-09T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  FCN_INI?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  FCN_TER?: string;

  @ApiPropertyOptional({ example: 'Promo de prueba' })
  @IsOptional()
  @IsString()
  @Length(0, 510)
  DESC_PROMO?: string;

  @ApiPropertyOptional({ example: 10.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  PRC_DESC?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  IMP_DESC?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  IMP_COM?: number;

  @ApiPropertyOptional({ example: 'TODO' })
  @IsOptional()
  @IsString()
  @Length(0, 510)
  ALCANCE?: string;

  @ApiPropertyOptional({ example: 'Reglas de promo' })
  @IsOptional()
  @IsString()
  DETALLE_PROMO?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  EST?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  REG_CLIENTE?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ACUMULABLE?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  COMBINABLE?: number;

  @ApiPropertyOptional({ example: 'CONTADO' })
  @IsOptional()
  @IsString()
  @Length(0, 510)
  F_PGO?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PRIORIDAD?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  MAX_APLI_FOLIO?: number;
}
