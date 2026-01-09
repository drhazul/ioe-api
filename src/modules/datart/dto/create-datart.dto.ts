import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatArtDto {
  @ApiProperty({ example: '00001' })
  @IsString()
  @Length(1, 5)
  SUC: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TIPO?: string;

  @ApiProperty({ example: 'ART001' })
  @IsString()
  @Length(1, 10)
  ART: string;

  @ApiProperty({ example: '1234567890123' })
  @IsString()
  @Length(1, 15)
  UPC: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CLAVESAT?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  UNIMEDSAT?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DES?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  STOCK?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  STOCK_MIN?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ESTATUS?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DIA_REABASTO?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  PVTA?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTOP?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  PROV_1?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTO_PROV1?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  PROV_2?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTO_PROV2?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  PROV_3?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTO_PROV3?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  UN_COMP?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  FACT_COMP?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  UN_VTA?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  FACT_VTA?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  BASE?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  SPH?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CYL?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  ADIC?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DEPA?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  SUBD?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CLAS?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  SCLA?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  SCLA2?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  UMUE?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  UTRA?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  UNIV?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  UFRE?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  BLOQ?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  MARCA?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  MODELO?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  SELJA?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  SELOP?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  MODF?: number;
}
