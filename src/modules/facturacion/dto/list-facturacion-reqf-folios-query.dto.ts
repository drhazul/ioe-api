import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

const normalizeText = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text.toUpperCase();
};

export class ListFacturacionReqfFoliosQueryDto {
  @ApiPropertyOptional({
    description: 'Filtro opcional por sucursal',
    example: 'DF01',
  })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  @Transform(({ value }) => normalizeText(value))
  suc?: string;

  @ApiPropertyOptional({
    description: 'Filtro opcional por fecha FCNM (YYYY-MM-DD)',
    example: '2026-03-17',
  })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  @Transform(({ value }) => normalizeText(value))
  fcnm?: string;

  @ApiPropertyOptional({
    description: 'Busqueda por IDFOL, CLIEN, razon social u OPV',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => normalizeText(value))
  search?: string;

  @ApiPropertyOptional({ description: 'Pagina (1..n)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
