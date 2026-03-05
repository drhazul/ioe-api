import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class AddRetiroDetalleDto {
  @ApiProperty({ description: 'Forma de pago del detalle' })
  @Transform(({ value }) => toTrimmedString(value).toUpperCase())
  @IsString()
  @Length(1, 255)
  forma: string;

  @ApiPropertyOptional({
    description: 'Importe del detalle (obligatorio si forma != EFECTIVO)',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  impf?: number;
}

