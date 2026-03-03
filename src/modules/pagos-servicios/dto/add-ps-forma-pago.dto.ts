import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class AddPsFormaPagoDto {
  @ApiProperty({ description: 'Forma de pago' })
  @Transform(({ value }) => toTrimmedString(value).toUpperCase())
  @IsString()
  @Length(1, 40)
  form: string;

  @ApiProperty({ description: 'Importe de la forma' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  impp: number;

  @ApiPropertyOptional({ description: 'Autorizacion/referencia cuando aplique' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  aut?: string;
}
