import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreatePvCtrFolAsvrDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  IDFOL: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  CLIEN?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DOC?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCN?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  SUC?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TER?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TRA?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  OPV?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ESTA?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  IMPT?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  FPGO?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  IMPP?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  AUT?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  REQF?: number;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNM?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  OPVM?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  MOD?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 50)
  IDFOLORIG?: string;
}
