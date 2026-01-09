import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

const ALMACENES = ['001', '002', 'M001', 'T001', 'TODOS'] as const;

export class ListDatContCapDto {
  @ApiProperty({ description: 'Conteo a consultar', example: 'CONT-001' })
  @IsString()
  @Length(1, 255)
  cont: string;

  @ApiPropertyOptional({ description: 'Filtro por almacén. TODOS no filtra.', enum: ALMACENES })
  @IsOptional()
  @IsString()
  @IsIn(ALMACENES)
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const v = String(value).trim().toUpperCase();
    return v === '' ? undefined : v;
  })
  almacen?: string;

  @ApiPropertyOptional({ description: 'Filtro por UPC (prefijo)', example: '7501' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const v = String(value).trim();
    return v === '' ? undefined : v;
  })
  upc?: string;

  @ApiPropertyOptional({ description: 'Solo admin: forzar SUC' })
  @IsOptional()
  @IsString()
  @Length(1, 5)
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    const v = String(value).trim().toUpperCase();
    return v === '' ? undefined : v;
  })
  suc?: string;

  @ApiPropertyOptional({ description: 'Página (1..n)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Límite por página', default: 50, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
