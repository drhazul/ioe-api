import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const toTrimmed = (value: unknown) => String(value ?? '').trim();
const toOptionalTrimmed = (value: unknown): string | undefined => {
  const text = toTrimmed(value);
  return text.length == 0 ? undefined : text;
};

export class PvRefDetalleAsignarDto {
  @ApiProperty()
  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @Length(1, 255)
  idref: string;

  @ApiPropertyOptional({
    description:
      'Validación opcional para asegurar que el IDREF pertenece al folio',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  idfol?: string;
}
