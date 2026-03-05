import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class CajonEstadoResumenQueryDto {
  @ApiPropertyOptional({ description: 'Fecha de consulta en formato YYYY-MM-DD' })
  @Transform(({ value }) => {
    const text = toTrimmedString(value);
    return text.length === 0 ? undefined : text;
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha debe tener formato YYYY-MM-DD',
  })
  fecha?: string;
}
