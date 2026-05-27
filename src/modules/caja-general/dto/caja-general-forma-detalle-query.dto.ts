import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { CajaGeneralOpvQueryDto } from './caja-general-opv-query.dto';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class CajaGeneralFormaDetalleQueryDto extends CajaGeneralOpvQueryDto {
  @ApiProperty({ description: 'Forma de pago a detallar' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  form!: string;
}
