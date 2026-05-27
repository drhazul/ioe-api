import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ApplyPromocionesDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'Si true, limpia aplicaciones previas y recalcula desde CTD*PVTA.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overwrite?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Si true, genera pendientes de ticket gratis en tabla de relación/detalle.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'si' || text === 'yes';
  })
  @IsBoolean()
  generarGratis?: boolean;
}
