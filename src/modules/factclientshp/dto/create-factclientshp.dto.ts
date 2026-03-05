import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateFactClientShpDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CLIEN_UNI?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TIPO?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNR?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  RAZONSOCIALRECEPTOR: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DOMI?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  RFCRECEPTOR: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  NCEL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  NTJT?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  EMAILRECEPTOR: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  RFCEMISOR: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  OPTICA?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  USOCFDI: string;

  @ApiProperty()
  @IsString()
  @Length(1, 255)
  CODIGOPOSTALRECEPTOR: string;

  @ApiProperty({ type: Number })
  @IsNumber()
  REGIMENFISCALRECEPTOR: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  I_CRED?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  VF?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  ESTATUS?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  DATVAL?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  MOD?: number;

  @ApiProperty()
  @IsString()
  @Length(1, 10)
  SUC: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DESCUENTOAPLI?: number;
}
