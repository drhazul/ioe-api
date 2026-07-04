import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

const MANTENIMIENTO_ACTIONS = ['SIN_CAMBIO', 'REGISTRAR', 'CAMBIAR'] as const;
type MantenimientoAction = (typeof MANTENIMIENTO_ACTIONS)[number];

export class MantenimientoBiometriaDto {
  @ApiPropertyOptional({
    example: 'MAT-2026-123456',
    description: 'Identificador único ID_EMPLEADO',
  })
  @IsOptional()
  @IsString()
  @Length(1, 40)
  id_empleado?: string;

  @ApiPropertyOptional({
    enum: MANTENIMIENTO_ACTIONS,
    default: 'SIN_CAMBIO',
  })
  @IsOptional()
  @IsString()
  @IsIn(MANTENIMIENTO_ACTIONS)
  face_action?: MantenimientoAction;

  @ApiPropertyOptional({
    enum: MANTENIMIENTO_ACTIONS,
    default: 'SIN_CAMBIO',
  })
  @IsOptional()
  @IsString()
  @IsIn(MANTENIMIENTO_ACTIONS)
  fingerprint_action?: MantenimientoAction;

  @ApiPropertyOptional({
    enum: MANTENIMIENTO_ACTIONS,
    default: 'SIN_CAMBIO',
  })
  @IsOptional()
  @IsString()
  @IsIn(MANTENIMIENTO_ACTIONS)
  pin_action?: MantenimientoAction;

  @ApiPropertyOptional({
    example: '100245',
    description: 'Nuevo NIP/PIN del colaborador',
  })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  new_pin?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Forzar estado final del método rostro',
  })
  @IsOptional()
  @IsBoolean()
  has_face?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Forzar estado final del método huella',
  })
  @IsOptional()
  @IsBoolean()
  has_fingerprint?: boolean;
}
