import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber, // <--- Faltaba esta línea
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListTimelogsDto {
  @ApiPropertyOptional({ description: 'Filtro por MARCAJES.id_usuario' })
  @Transform(({ value, obj }) => value ?? obj?.id_usuario ?? obj?.idUsuario)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_usuario?: number;

  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;

  @ApiPropertyOptional({ description: 'Sucursal (alias minúscula)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  suc?: string;

  @ApiPropertyOptional({ description: 'Latitud opcional desde cliente' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber() // <--- Ahora TypeScript ya sabrá qué es esto
  LAT?: number;

  @ApiPropertyOptional({ description: 'Longitud opcional desde cliente' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber() // <--- Y aquí también
  LON?: number;

  @ApiPropertyOptional({
    description: 'Usuario a consultar (solo admin/manager)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idUsuario?: number;

  @ApiPropertyOptional({ description: 'Departamento a consultar' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idDepto?: number;

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
