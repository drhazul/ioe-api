import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

const trimOrUndefined = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  return v === '' ? undefined : v;
};

const numberOrUndefined = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : num;
};

const stringListOrUndefined = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  const normalize = (v: unknown) => {
    if (v === undefined || v === null) return null;
    const text = String(v).trim();
    return text === '' ? null : text;
  };
  if (Array.isArray(value)) {
    const list = value.map(normalize).filter((v): v is string => v !== null);
    return list.length ? list : undefined;
  }
  if (typeof value === 'string') {
    const list = value
      .split(',')
      .map((v) => normalize(v))
      .filter((v): v is string => v !== null);
    return list.length ? list : undefined;
  }
  const single = normalize(value);
  return single ? [single] : undefined;
};

const numberListOrUndefined = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  const normalize = (v: unknown) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  };
  if (Array.isArray(value)) {
    const list = value.map(normalize).filter((v): v is number => v !== null);
    return list.length ? list : undefined;
  }
  if (typeof value === 'string') {
    const list = value
      .split(',')
      .map((v) => normalize(v))
      .filter((v): v is number => v !== null);
    return list.length ? list : undefined;
  }
  const single = normalize(value);
  return single == null ? undefined : [single];
};

export class SearchDatMb51Dto {
  @ApiPropertyOptional({ description: 'Fecha documento desde (FCND)' })
  @IsOptional()
  @IsDateString()
  @Transform(trimOrUndefined)
  fechaDocDesde?: string;

  @ApiPropertyOptional({ description: 'Fecha documento hasta (FCND)' })
  @IsOptional()
  @IsDateString()
  @Transform(trimOrUndefined)
  fechaDocHasta?: string;

  @ApiPropertyOptional({ description: 'Fecha contabilización desde (FCNC)' })
  @IsOptional()
  @IsDateString()
  @Transform(trimOrUndefined)
  fechaContDesde?: string;

  @ApiPropertyOptional({ description: 'Fecha contabilización hasta (FCNC)' })
  @IsOptional()
  @IsDateString()
  @Transform(trimOrUndefined)
  fechaContHasta?: string;

  @ApiPropertyOptional({ description: 'Artículo (ART)' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(trimOrUndefined)
  art?: string;

  @ApiPropertyOptional({ description: 'Lista de artículos (ART)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  arts?: string[];

  @ApiPropertyOptional({ description: 'Documento (DOCP)' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(trimOrUndefined)
  docp?: string;

  @ApiPropertyOptional({ description: 'Almacén (ALMACEN)' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(trimOrUndefined)
  almacen?: string;

  @ApiPropertyOptional({ description: 'Lista de almacenes (ALMACEN)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  almacenes?: string[];

  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(trimOrUndefined)
  suc?: string;

  @ApiPropertyOptional({ description: 'Lista de sucursales (SUC)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  sucs?: string[];

  @ApiPropertyOptional({ description: 'Clase de movimiento (CLSM)' })
  @IsOptional()
  @IsNumber()
  @Transform(numberOrUndefined)
  clsm?: number;

  @ApiPropertyOptional({ description: 'Lista de clases de movimiento (CLSM)' })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Transform(numberListOrUndefined)
  clsms?: number[];

  @ApiPropertyOptional({ description: 'Venta especial (VTAESP)', example: 1 })
  @IsOptional()
  @IsInt()
  @Transform(numberOrUndefined)
  vtaesp?: number;

  @ApiPropertyOptional({ description: 'Usuario (USER)' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(trimOrUndefined)
  user?: string;

  @ApiPropertyOptional({ description: 'Texto (TXT)' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Transform(trimOrUndefined)
  txt?: string;

  @ApiPropertyOptional({ description: 'Página (1..n)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Límite por página', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
