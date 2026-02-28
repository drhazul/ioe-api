import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class CreateDevolucionDto {
  @ApiProperty({
    description: 'Folio original sobre el que se generará la devolución',
    example: 'DF01040220261210',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  idfolOrig: string;

  @ApiProperty({
    description: 'Contraseña del supervisor (rol SUPERPV)',
    example: '***',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @Length(1, 255)
  authPassword: string;
}

