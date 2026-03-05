import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return text === '1' || text === 'true' || text === 'si' || text === 'yes';
};

export class PagoPreviewRequestDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'Bandera de requiere factura (override opcional)',
  })
  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  rqfac?: boolean;
}
