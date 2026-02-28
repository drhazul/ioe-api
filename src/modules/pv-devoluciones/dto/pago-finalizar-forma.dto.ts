import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();
const toOptionalTrimmedString = (value: unknown): string | undefined => {
  const next = toTrimmedString(value);
  return next.length > 0 ? next : undefined;
};

export class PagoFinalizarFormaDto {
  @ApiProperty({ example: 'EFECTIVO' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 40)
  form: string;

  @ApiProperty({ type: Number, example: 150.5 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  impp: number;

  @ApiPropertyOptional({
    description: 'Autorización o referencia cuando aplique',
  })
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  aut?: string;
}

