import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, Length } from 'class-validator';

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

export class SearchDatMb52Dto {
  @ApiPropertyOptional({ description: 'Lista de sucursales (SUC)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  sucs?: string[];

  @ApiPropertyOptional({ description: 'Lista de almacenes (ALMACEN)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  almacenes?: string[];

  @ApiPropertyOptional({ description: 'Lista de artículos (ART)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  arts?: string[];
}
