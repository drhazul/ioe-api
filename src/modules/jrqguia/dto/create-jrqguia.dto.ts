import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateJrqGuiaDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  GUIA: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DESCORT?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  SCLA2?: number;
}
