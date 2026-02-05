import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatRetDetSvrDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  ID: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  IDRET?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  FORMA?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  IMPF?: number;
}
