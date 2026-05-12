import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class SavePromoConfigDto {
  @ApiProperty({ example: 'PORCENTAJE' })
  @IsString()
  @Length(1, 50)
  T_BENEFICIO: string;

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

  @ApiPropertyOptional({ example: 0.01 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  PRECIO_GRATIS?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  SUC_TODAS?: boolean;

  @ApiPropertyOptional({ example: ['001', '002'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  SUC_LIST?: string[];

  @ApiPropertyOptional({ example: 12345 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  CLIENTE?: number;

  @ApiPropertyOptional({ example: [1, 2] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsNumber({}, { each: true })
  DEPA_LIST?: number[];

  @ApiPropertyOptional({ example: [10, 20] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsNumber({}, { each: true })
  SUBD_LIST?: number[];

  @ApiPropertyOptional({ example: [100] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsNumber({}, { each: true })
  CLAS_LIST?: number[];

  @ApiPropertyOptional({ example: [200] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsNumber({}, { each: true })
  SCLA_LIST?: number[];

  @ApiPropertyOptional({ example: [300] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsNumber({}, { each: true })
  SCLA2_LIST?: number[];

  @ApiPropertyOptional({ example: ['G001'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  GUIA_LIST?: string[];

  @ApiPropertyOptional({ example: ['ART01', 'ART02'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  ART_LIST?: string[];

  @ApiPropertyOptional({ example: ['7500000001'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  UPC_LIST?: string[];

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ACTIVO?: number;
}
