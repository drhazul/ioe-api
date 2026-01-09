import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class CreateDatmoduloDto {
  @ApiProperty({ example: 'MOD001' })
  @IsString()
  @Length(1, 50)
  CODIGO: string;

  @ApiProperty({ example: 'Inventarios' })
  @IsString()
  @Length(1, 100)
  NOMBRE: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 100)
  DEPTO?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  FCNR?: string;
}
