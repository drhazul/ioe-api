import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ListDocumentosDto {
  @ApiPropertyOptional({ description: 'Usuario' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @ApiPropertyOptional({ description: 'Incidencia' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  incId?: number;

  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  suc?: string;

  @ApiPropertyOptional({ description: 'Fecha inicio YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Fecha fin YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Pagina (1..n)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Elementos por pagina (max 500)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
