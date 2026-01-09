import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class CreateModFrontDto {
  @ApiProperty({ example: 'SYS_DAT_MAE' })
  @IsString()
  @Length(1, 50)
  CODIGO: string;

  @ApiProperty({ example: 'Datos Maestros' })
  @IsString()
  @Length(1, 100)
  NOMBRE: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 100)
  DEPTO?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNR?: string;
}
