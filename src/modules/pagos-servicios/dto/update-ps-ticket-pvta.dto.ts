import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsString, Length, Min } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class UpdatePsTicketPvtaDto {
  @ApiProperty({ description: 'ART de la linea de ticket' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  art: string;

  @ApiProperty({ description: 'Nuevo PVTA' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  pvta: number;
}
