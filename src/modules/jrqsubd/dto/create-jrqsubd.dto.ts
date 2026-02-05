import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateJrqSubdDto {
  @ApiProperty({ type: Number })
  @IsNumber()
  SUBD: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DSUBD?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  DEPA?: number;
}
