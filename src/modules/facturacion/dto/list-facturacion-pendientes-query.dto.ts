import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

const ESTATUS_FACTURACION = [
  'TODOS',
  'PENDIENTE',
  'CANCELACION PENDIENTE',
  'FACTURADO',
  'FACTURADO Y CANCELACION PENDIENTE',
] as const;

const normalizeText = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
};

const normalizeUpperText = (value: unknown) => {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : undefined;
};

export class ListFacturacionPendientesQueryDto {
  @ApiPropertyOptional({ description: 'Página (1..n)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Registros por página',
    default: 20,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Filtro por sucursal (contiene)',
    example: 'DF01',
  })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  @Transform(({ value }) => normalizeUpperText(value))
  suc?: string;

  @ApiPropertyOptional({
    description: 'Filtro por estatus',
    enum: ESTATUS_FACTURACION,
    default: 'TODOS',
  })
  @IsOptional()
  @IsString()
  @IsIn(ESTATUS_FACTURACION)
  @Transform(({ value }) => normalizeUpperText(value))
  estatus?: string;

  @ApiPropertyOptional({
    description: 'Filtro por razón social receptor (contiene)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(({ value }) => normalizeUpperText(value))
  razonSocialReceptor?: string;

  @ApiPropertyOptional({
    description: 'Filtro por RFC receptor (contiene)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Transform(({ value }) => normalizeUpperText(value))
  rfcReceptor?: string;

  @ApiPropertyOptional({
    description: 'Filtro por cliente (contiene)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Transform(({ value }) => normalizeUpperText(value))
  clien?: string;

  @ApiPropertyOptional({
    description: 'Filtro por folio (contiene)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  @Transform(({ value }) => normalizeUpperText(value))
  idFol?: string;

  @ApiPropertyOptional({
    description: 'Filtro por tipo de facturación (contiene)',
  })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Transform(({ value }) => normalizeUpperText(value))
  tipoFact?: string;
}
