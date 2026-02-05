import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatRetDetEfecSvrDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  ID: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  IDFOR?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DENO?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTDA?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  TOTAL?: number;
}
