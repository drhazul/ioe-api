import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const toTrimmed = (value: unknown) => String(value ?? '').trim();
const toOptionalTrimmed = (value: unknown): string | undefined => {
  const text = toTrimmed(value);
  return text.length == 0 ? undefined : text;
};

export class PvRefDetalleQueryDto {
  @ApiProperty()
  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @Length(1, 255)
  idfol: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => toOptionalTrimmed(value))
  @IsOptional()
  @IsString()
  @Length(1, 40)
  tipo?: string;
}
