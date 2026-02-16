import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

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
  if (text === '0' || text === 'false' || text === 'no') {
    return false;
  }
  return false;
};

export class PvCotizacionCierrePreviewDto {
  @ApiProperty({ example: 'VF', enum: ['CA', 'VF'] })
  @Transform(({ value }) => toTrimmedString(value).toUpperCase())
  @IsString()
  @Length(2, 2)
  tipotran: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Requiere factura (aplica para calculo cuando IVA no integrado)',
  })
  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  rqfac?: boolean;

  @ApiPropertyOptional({ description: 'Sucursal de trabajo esperada' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 20)
  suc?: string;
}
