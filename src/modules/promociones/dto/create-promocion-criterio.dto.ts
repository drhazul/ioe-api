import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreatePromocionCriterioDto {
  @ApiPropertyOptional({ example: 'DF01' })
  @IsOptional()
  @IsString()
  @Length(0, 10)
  SUC?: string;

  @ApiPropertyOptional({ example: 10460540001 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  CLIENTE?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  DEPA?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  SUBD?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  CLAS?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  SCLA?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  SCLA2?: number;

  @ApiPropertyOptional({ example: 'GUIA01' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  GUIA?: string;

  @ApiPropertyOptional({ example: 'ART001' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  ART?: string;

  @ApiPropertyOptional({ example: '7501234567890' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  UPC?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  EST?: number;
}
