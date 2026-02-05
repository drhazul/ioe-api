import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreatePvCtrOrdsDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  IORD: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  IDFOL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TIPO?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  OPV?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNS?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNM?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  CLIEN?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  MAT?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTD?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ART?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  COMAD?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  ESTATUS?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  ESTSEGU?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ASIGN?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNRT?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNAS?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNTE?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNTD?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNEN?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  LABOR?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  TPOM?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  MOTR?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  REOORD?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DOCIF?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  SEL?: number;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNMOD?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  SUC?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  NCLIENTE?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  RQFAC?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DESCART?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTORD?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  SELCTRLORD?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  SELCTRORDT?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  SELENT?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  RESMEMR?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  HR_ENT?: string;
}
