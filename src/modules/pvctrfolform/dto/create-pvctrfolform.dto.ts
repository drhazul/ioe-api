import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreatePvCtrFolFormDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  IDF: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  IDFOL?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCN?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  FORM?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  IMPA?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  IMPP?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  IMPC?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  IMPD?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  AUT?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ESTA?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ESTAF?: string;
}
