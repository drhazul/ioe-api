import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { PvCotizacionCierreFormaDto } from './pv-cotizacion-cierre-forma.dto';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (text === '1' || text === 'true' || text === 'si' || text === 'yes') {
    return true;
  }
  return false;
};

export class PvCotizacionCierreDto {
  @ApiPropertyOptional({ description: 'Sucursal a validar contra el folio' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 20)
  suc?: string;

  @ApiProperty({ example: 'VF', enum: ['CA', 'VF'] })
  @Transform(({ value }) => toTrimmedString(value).toUpperCase())
  @IsString()
  @Length(2, 2)
  tipotran: string;

  @ApiProperty({ type: Boolean, example: false })
  @Transform(toBoolean)
  @IsBoolean()
  rqfac: boolean;

  @ApiPropertyOptional({
    description: 'OPV que ejecuta el cierre (si no se envia, se toma del JWT)',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  idopv?: string;

  @ApiProperty({
    type: [PvCotizacionCierreFormaDto],
    description:
      'Formas de pago definitivas; puede ser vacio cuando el total del cierre es 0',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PvCotizacionCierreFormaDto)
  formas: PvCotizacionCierreFormaDto[];
}
