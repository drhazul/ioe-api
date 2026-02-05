import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreatePvTicketLogDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  ID: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  IDFOL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  UPC?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ART?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DES?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTD?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  PVTA?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  PVTAT?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  ORD?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  IDDEV?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTDD?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CTDDF?: number;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  UPDATED_AT?: string;
}
