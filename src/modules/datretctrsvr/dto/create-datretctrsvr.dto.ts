import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatRetCtrSvrDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  IDRET: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  TER?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  OPV?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNR?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  IMPR?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ESTA?: string;
}
