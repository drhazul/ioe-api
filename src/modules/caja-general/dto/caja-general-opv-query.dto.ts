import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class CajaGeneralOpvQueryDto {
  @ApiProperty({ description: 'Sucursal' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 25)
  suc!: string;

  @ApiProperty({ description: 'Fecha de operación (YYYY-MM-DD)' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fcn debe tener formato YYYY-MM-DD',
  })
  fcn!: string;

  @ApiProperty({ description: 'OPV a consultar' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  opv!: string;

  @ApiPropertyOptional({
    description: 'Tipo de corte',
    enum: ['CA', 'VF', 'GLOBAL'],
  })
  @Transform(({ value }) => {
    const text = toTrimmedString(value).toUpperCase();
    return text.length === 0 ? 'GLOBAL' : text;
  })
  @IsOptional()
  @IsString()
  @IsIn(['CA', 'VF', 'GLOBAL'])
  tipo?: string = 'GLOBAL';
}
