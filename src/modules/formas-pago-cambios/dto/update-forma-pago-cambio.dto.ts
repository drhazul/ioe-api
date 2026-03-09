import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFormaPagoCambioDto {
  @ApiPropertyOptional({
    description: 'Nueva forma de pago',
    example: 'TARJETA',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ?? '').toString().trim().toUpperCase())
  newForm?: string;

  @ApiPropertyOptional({
    description: 'Compatibilidad legacy del frontend',
    example: 'TARJETA',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ?? '').toString().trim().toUpperCase())
  FORM?: string;

  @ApiPropertyOptional({
    description:
      'Contraseña de supervisor SUPERPV para autorizar el cambio de forma',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  AUTH_PASSWORD?: string;

  @ApiPropertyOptional({
    description:
      'Referencia/autorización para guardar en AUT del detalle de forma',
    example: 'REF123456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ?? '').toString().trim())
  AUT?: string;

  @ApiPropertyOptional({
    description: 'Compatibilidad camelCase de referencia/autorización para AUT',
    example: 'REF123456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ?? '').toString().trim())
  aut?: string;

  @ApiPropertyOptional({
    description:
      'Cuando es true, limpia AUT en el detalle de forma durante la actualización',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === true || value === false) return value;
    const text = String(value ?? '')
      .trim()
      .toLowerCase();
    return text == '1' || text == 'true' || text == 'yes';
  })
  clearAut?: boolean;
}
