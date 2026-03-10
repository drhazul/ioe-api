import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();
const toOptionalTrimmedString = (value: unknown): string | undefined => {
  const text = toTrimmedString(value);
  return text.length === 0 ? undefined : text;
};

export class DeleteOrdFromQuoteLineDto {
  @ApiProperty()
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  iord: string;

  @ApiProperty({
    description: 'ID del renglón en PV_TICKET_LOG al que pertenece la ORD',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  ticketId: string;

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
  art?: string;
}
