import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const SUCURSAL_EVENT_TIPOS = [
  'ENTRADA',
  'SALIDA_COMER',
  'REGRESO_COMER',
  'SALIDA',
] as const;

export const SUCURSAL_AUTH_METHODS = [
  'FACE',
  'FINGER',
  'PIN',
  'CARD',
  'QR',
  'PASSWORD',
] as const;

export class SucursalEventDto {
  @ApiProperty({ example: 1234 })
  @IsInt()
  @Min(1)
  idUsuario: number;

  @ApiProperty({ enum: SUCURSAL_EVENT_TIPOS, example: 'ENTRADA' })
  @IsOptional()
  @IsString()
  @IsIn(SUCURSAL_EVENT_TIPOS)
  tipo?: (typeof SUCURSAL_EVENT_TIPOS)[number];

  @ApiProperty({
    example: '2026-04-20T08:15:00',
    description: 'Fecha evento en formato ISO 8601',
  })
  @IsString()
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional({ example: 'CDM-01' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  suc?: string;

  @ApiPropertyOptional({ example: 'RELOJ-MTY-001' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceId?: string;

  @ApiPropertyOptional({ enum: SUCURSAL_AUTH_METHODS, example: 'PIN' })
  @IsOptional()
  @IsString()
  @IsIn(SUCURSAL_AUTH_METHODS)
  authMethod?: (typeof SUCURSAL_AUTH_METHODS)[number];

  @ApiPropertyOptional({
    example: '19.4326,-99.1332',
    description: 'Coordenadas GPS compactas en formato lat,lon',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  gpsCoordinates?: string;

  @ApiPropertyOptional({
    example: 36.5,
    description: 'Temperatura capturada por dispositivo (°C)',
  })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({
    example: 'FACE',
    description: 'Modo de verificación reportado por reloj',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  verificationMode?: string;

  @ApiPropertyOptional({
    example: 15,
    description: 'Código numérico de verificación (1=Huella, 3=PIN, 15=Rostro)',
  })
  @IsOptional()
  @IsInt()
  verifyMode?: number;

  @ApiPropertyOptional({
    example: 'A1B2C3',
    description: 'PIN seguro para validación industrial',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  securePin?: string;

  @ApiPropertyOptional({
    example: 'FINGER-EMERG-01',
    description: 'ID de huella reportado por dispositivo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  fingerprintId?: string;

  @ApiPropertyOptional({
    example: '/uploads/asistencia/evt_123.jpg',
    description: 'Foto del evento enviada por terminal',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  eventPhoto?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Marca true cuando terminal estuvo offline y sincroniza después',
  })
  @IsOptional()
  @IsBoolean()
  isOffline?: boolean;
}
