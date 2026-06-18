import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  MinLength,
} from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();
const toOptionalTrimmedString = (value: unknown): string | undefined => {
  const next = toTrimmedString(value);
  return next.length > 0 ? next : undefined;
};

export class AuthorizeOrdRelationDto {
  @ApiProperty({
    description:
      'Contraseña del supervisor para autorizar relacion de venta anterior',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @MinLength(1)
  passwordSupervisor: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  idfol?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  ticketId?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  art?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.0001)
  ctd?: number;
}
