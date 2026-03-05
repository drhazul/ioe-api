import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateDatFormDto {
  @ApiPropertyOptional({ example: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ASPEL?: number;

  @ApiProperty({ example: 'CREDITO' })
  @IsString()
  @Length(1, 50)
  FORM!: string;

  @ApiPropertyOptional({ example: 'CRE' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  NOM?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  ESTADO?: boolean;
}
