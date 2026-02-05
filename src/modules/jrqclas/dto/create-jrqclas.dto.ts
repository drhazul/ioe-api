import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateJrqClasDto {
  @ApiProperty({ type: Number })
  @IsNumber()
  CLAS: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DCLAS?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  SUBD?: number;
}
