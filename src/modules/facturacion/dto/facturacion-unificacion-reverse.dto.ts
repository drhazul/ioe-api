import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const normalizeText = (value: unknown) => String(value ?? '').trim();

export class FacturacionUnificacionReverseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Transform(({ value }) => normalizeText(value))
  motivo: string;
}

