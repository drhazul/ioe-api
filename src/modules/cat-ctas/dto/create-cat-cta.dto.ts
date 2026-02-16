import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateCatCtaDto {
  @ApiProperty({ example: 'CREDITO' })
  @IsString()
  @Length(1, 255)
  CTA: string;

  @ApiPropertyOptional({ example: 'Cuenta de credito' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  DCTA?: string;

  @ApiPropertyOptional({ example: 'CLIENTE' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  RELACION?: string;

  @ApiPropertyOptional({ example: 'DF01' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  SUC?: string;
}
