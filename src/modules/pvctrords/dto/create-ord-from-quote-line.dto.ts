import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();
const toOptionalTrimmedString = (value: unknown): string | undefined => {
  const next = toTrimmedString(value);
  return next.length > 0 ? next : undefined;
};

export class CreateOrdFromQuoteLineDto {
  @ApiProperty()
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  idfol: string;

  @ApiProperty()
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  art: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  descArt?: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.0001)
  ctd: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsInt()
  clien: number;

  @ApiProperty()
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 50)
  estado: string;

  @ApiProperty()
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  tipo: string;

  @ApiProperty()
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 10)
  suc: string;

  @ApiProperty()
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  opv: string;

  @ApiPropertyOptional({ example: '2026-02-13T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fechaEntrega?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  comad?: string;

  @ApiPropertyOptional({
    description: 'IORD existente en el renglón, si aplica',
  })
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  ordExistente?: string;
}
