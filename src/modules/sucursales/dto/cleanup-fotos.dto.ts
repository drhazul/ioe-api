import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CleanupFotosDto {
  @ApiPropertyOptional({
    example: 90,
    description: 'Eliminar fotos con antiguedad mayor a dias',
    default: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;
}
