import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatEstOrdDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsInt()
  ESTA: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TIPO?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  USR?: string;
}
