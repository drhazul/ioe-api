import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

const toTrimmed = (value: unknown) => String(value ?? '').trim();
const toOptionalTrimmed = (value: unknown): string | undefined => {
  const text = toTrimmed(value);
  return text.length == 0 ? undefined : text;
};

export class PvRefDetalleCrearDto {
  @ApiProperty()
  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @Length(1, 255)
  suc: string;

  @ApiProperty()
  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @Length(1, 255)
  idfol: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  idc: number;

  @ApiPropertyOptional({
    description: 'OPV del usuario; si no se envía, se toma del JWT',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  opv?: string;

  @ApiProperty()
  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @Length(1, 255)
  rfcEmisor: string;

  @ApiProperty({
    description:
      'Forma de pago de referencia: TARJETA, TARJETA CREDITO, CHEQUE, TRANSFERENCIA, DEPOSITO 3RO',
  })
  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @Length(1, 40)
  tipo: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  impt: number;

  @ApiPropertyOptional({ example: '2026-02-20T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fcnd?: string;

  @ApiPropertyOptional({
    description: 'IDREF opcional; si no se envía se genera automáticamente',
  })
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  idref?: string;
}
