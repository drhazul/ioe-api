import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateJrqScla2Dto {
  @ApiProperty({ type: Number })
  @IsNumber()
  SCLA2: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DSCLA2?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  SCLA?: number;
}
