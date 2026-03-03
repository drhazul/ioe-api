import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class SetPsTicketReferenceGastoDto {
  @ApiProperty({ description: 'ART de la linea de ticket' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  art: string;

  @ApiProperty({ description: 'Referencia de gasto (texto o IDR)' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 120)
  refGasto: string;
}
