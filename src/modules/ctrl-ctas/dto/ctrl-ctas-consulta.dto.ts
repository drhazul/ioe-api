import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

const stringListOrUndefined = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;

  const normalize = (raw: unknown) => {
    const text = String(raw ?? '').trim();
    return text.length ? text : null;
  };

  if (Array.isArray(value)) {
    const list = value
      .map((item) => normalize(item))
      .filter((item): item is string => item !== null);
    return list.length ? list : undefined;
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw.length) return undefined;
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const list = parsed
            .map((item) => normalize(item))
            .filter((item): item is string => item !== null);
          return list.length ? list : undefined;
        }
      } catch (_) {
        // continua con parse por comas
      }
    }
    const list = raw
      .split(',')
      .map((item) => normalize(item))
      .filter((item): item is string => item !== null);
    return list.length ? list : undefined;
  }

  const single = normalize(value);
  return single ? [single] : undefined;
};

export class CtrlCtasConsultaDto {
  @ApiPropertyOptional({ type: [String], description: 'Sucursales (SUC)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  sucs?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Cuentas (CTA)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  ctas?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Clientes (CLIENT) como string',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  clients?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Clases de documento (CLSD)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  clsds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Folios/Tickets (IDFOL)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  idfols?: string[];

  @ApiPropertyOptional({ description: 'Folio único (atajo para detalle)' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  idfol?: string;

  @ApiPropertyOptional({ type: [String], description: 'Colaboradores (IDOPV)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  @Transform(stringListOrUndefined)
  opvs?: string[];

  @ApiPropertyOptional({ description: 'Fecha inicio FCND (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecIni?: string;

  @ApiPropertyOptional({ description: 'Fecha fin FCND (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecFin?: string;
}
