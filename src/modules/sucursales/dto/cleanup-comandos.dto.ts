import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CleanupComandosDto {
  @ApiPropertyOptional({
    example: 'CDM-01',
    description: 'Si se envia, limpia solo cola de sucursal indicada',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  suc?: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'Solo comandos con antiguedad >= minutos',
    default: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  olderThanMinutes?: number;
}
