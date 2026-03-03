import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class CreatePsFolioDto {
  @ApiProperty({ description: 'Sucursal del folio PS' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 10)
  suc: string;

  @ApiPropertyOptional({ description: 'Terminal' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 50)
  ter?: string;

  @ApiProperty({ description: 'OPV/usuario de caja' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  opv: string;
}
