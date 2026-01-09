import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatmb51Dto {
  @ApiProperty({ example: 'IDPD-001' })
  @IsString()
  @Length(1, 255)
  IDPD: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  USER?: string;

  @ApiPropertyOptional({ example: 1.23 })
  @IsOptional()
  @IsNumber()
  CLSM?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DOCP?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ART?: string;

  @ApiPropertyOptional({ example: 10.5 })
  @IsOptional()
  @IsNumber()
  CTDA?: number;

  @ApiPropertyOptional({ example: 20.75 })
  @IsOptional()
  @IsNumber()
  CTOT?: number;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCND?: string;

  @ApiPropertyOptional({ example: '2024-01-02T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNC?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TXT?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ALMACEN?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  VTAESP?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  SUC?: string;
}
