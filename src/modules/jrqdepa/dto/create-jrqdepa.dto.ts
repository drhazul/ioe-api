import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateJrqDepaDto {
  @ApiProperty({ type: Number })
  @IsNumber()
  DEPA: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DDEPA?: string;
}
