import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class AddPsTicketServiceDto {
  @ApiProperty({ description: 'Codigo de servicio (AD/AP/CR/DC/DG)' })
  @Transform(({ value }) => toTrimmedString(value).toUpperCase())
  @IsString()
  @Length(2, 2)
  ids: string;
}
