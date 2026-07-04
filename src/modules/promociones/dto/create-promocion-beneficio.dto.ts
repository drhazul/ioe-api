import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreatePromocionBeneficioDto {
  @ApiPropertyOptional({ example: 'PORCENTAJE' })
  @IsOptional()
  @IsString()
  @Length(0, 30)
  T_BENEFICIO?: string;

  @ApiPropertyOptional({ example: 10 })
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

  @ApiPropertyOptional({ example: 'ART001' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  ART_GRATIS?: string;

  @ApiPropertyOptional({ example: '7501234567890' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  UPC_GRATIS?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  CANT_GRATIS?: number;

  @ApiPropertyOptional({ example: 0.01 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  PRECIO_GRATIS?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PRIORIDAD?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ACUMULABLE?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  EST?: number;
}
