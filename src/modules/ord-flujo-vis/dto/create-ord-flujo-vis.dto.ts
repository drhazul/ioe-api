import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateOrdFlujoVisDto {
  @ApiProperty({
    description: 'Codigo de modulo',
    example: 'DAT_JAO_ORD',
  })
  @IsString()
  @MaxLength(50)
  MODULO!: string;

  @ApiProperty({
    description: 'Panel de consulta',
    example: 'operativo',
    enum: ['operativo', 'estado', 'anulados', 'entregadas'],
  })
  @IsString()
  @IsIn(['operativo', 'estado', 'anulados', 'entregadas'])
  PANEL_MODE!: string;

  @ApiProperty({
    description: 'Codigo de rol',
    example: 'ANALISTA',
  })
  @IsString()
  @MaxLength(50)
  ROLE_CODE!: string;

  @ApiProperty({
    description: 'Flujo ESTSEGU visible',
    example: 9,
  })
  @IsNumber()
  ESTA!: number;

  @ApiPropertyOptional({
    description: 'Solo visible cuando laboratorio es externo',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  SOLO_EXTERNO?: boolean;

  @ApiPropertyOptional({
    description: 'Registro activo',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;
}
