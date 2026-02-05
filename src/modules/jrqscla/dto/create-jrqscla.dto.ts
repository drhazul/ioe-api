import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateJrqSclaDto {
  @ApiProperty({ type: Number })
  @IsNumber()
  SCLA: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DSCLA?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  CLAS?: number;
}
