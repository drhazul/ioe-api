import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class CajonEstadoAutorizarDto {
  @ApiProperty({
    description: 'Password del supervisor para autorizar consulta',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsString()
  @MinLength(1)
  passwordSupervisor: string;
}
