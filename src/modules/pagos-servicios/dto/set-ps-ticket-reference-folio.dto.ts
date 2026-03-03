import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class SetPsTicketReferenceFolioDto {
  @ApiProperty({ description: 'ART de la linea de ticket' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  art: string;

  @ApiProperty({ description: 'Folio adeudo de referencia' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  idFolRef: string;
}
