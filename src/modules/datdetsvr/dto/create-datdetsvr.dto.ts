import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatDetSvrDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ART?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  UPC?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  CONT?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DES?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTOP?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  TOTAL?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  MB52_T?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DIF_T?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DIF_CTOP?: number;

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
  @IsInt()
  EXT?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  '001'?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  '002'?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  M001?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  T001?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  MB52_01?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  MB52_02?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  MB52_M1?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  MB52_T1?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DIF_01?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DIF_02?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DIF_M1?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DIF_T1?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  SUC?: string;
}
