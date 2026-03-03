import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class DeletePsTicketLineDto {
  @ApiProperty({ description: 'ART de la linea de ticket a eliminar' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  art: string;
}
