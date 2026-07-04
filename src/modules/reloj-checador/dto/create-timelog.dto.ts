import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsISO8601,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateTimelogDto {
  @ApiPropertyOptional({ description: 'ID usuario (COLABORADORES.id_usuario)' })
  @Transform(({ value, obj }) => value ?? obj?.id_usuario ?? obj?.ID_USUARIO)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_usuario!: number;

  @ApiPropertyOptional({
    description: 'Fecha/hora marcaje (cliente); servidor usa GETDATE()',
  })
  @IsOptional()
  @IsISO8601()
  punch_time?: string;

  @ApiPropertyOptional({ description: 'PIN hash/texto para MARCAJES.pin' })
  @Transform(({ value, obj }) =>
    String(value ?? obj?.pin ?? obj?.PIN ?? '').trim(),
  )
  @IsString()
  @Length(1, 255)
  pin!: string;

  @ApiPropertyOptional({
    description: 'Tipo de verificación (MARCAJES.verify_mode_label)',
  })
  @Transform(({ value, obj }) =>
    String(
      value ??
        obj?.verify_mode_label ??
        obj?.auth_method ??
        obj?.AUTH_METHOD ??
        '',
    )
      .trim()
      .toUpperCase(),
  )
  @IsString()
  @IsIn(['FACE', 'FINGER', 'PIN'])
  verify_mode_label!: string;

  @ApiPropertyOptional({ description: 'Sucursal objetivo (SUC)' })
  @Transform(({ value, obj }) =>
    String(value ?? obj?.suc ?? obj?.SUC ?? '').trim(),
  )
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;

  @ApiProperty({ enum: ['ENTRADA', 'SALIDA_COMER', 'REGRESO_COMER', 'SALIDA'] })
  @Transform(({ value, obj }) =>
    String(value ?? obj?.tipo ?? obj?.TIPO ?? '')
      .trim()
      .toUpperCase()
      .replaceAll(' ', '_'),
  )
  @IsString()
  @IsIn(['ENTRADA', 'SALIDA_COMER', 'REGRESO_COMER', 'SALIDA'])
  TIPO!: string; // Corregido con !

  @ApiProperty({ enum: ['FACE', 'FINGER', 'PIN'] })
  @Transform(({ value, obj }) =>
    String(
      value ??
        obj?.auth_method ??
        obj?.verify_mode_label ??
        obj?.AUTH_METHOD ??
        '',
    )
      .trim()
      .toUpperCase(),
  )
  @IsString()
  @IsIn(['FACE', 'FINGER', 'PIN'])
  AUTH_METHOD!: string; // Corregido con !

  @ApiPropertyOptional({ description: 'Bandera de liveness para FACE' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  LIVENESS_OK?: number;

  @ApiPropertyOptional({ description: 'Latitud GPS' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  LAT?: number;

  @ApiPropertyOptional({ description: 'Longitud GPS' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  LON?: number;

  @ApiPropertyOptional({ description: 'Precision del GPS en metros' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  GPS_ACCURACY_M?: number;

  @ApiPropertyOptional({
    description: 'Coordenadas GPS compactas (ej: 19.4326,-99.1332)',
  })
  @IsOptional()
  @IsString()
  @Length(3, 80)
  GPS_COORDINATES?: string;

  @ApiPropertyOptional({
    description: 'Temperatura reportada por dispositivo (°C)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(30)
  @Max(45)
  TEMPERATURE?: number;

  @ApiPropertyOptional({
    description:
      'Modo de verificación reportado por dispositivo (FACE/FINGER/PIN/CARD/QR/PASSWORD)',
  })
  @IsOptional()
  @IsString()
  @Length(2, 30)
  VERIFICATION_MODE?: string;

  @ApiPropertyOptional({ description: 'Identificador del dispositivo' })
  @Transform(({ value, obj }) =>
    String(value ?? obj?.device_id ?? obj?.DEVICE_ID ?? '').trim(),
  )
  @IsString()
  @Length(1, 80)
  DEVICE_ID!: string; // Corregido con ![cite: 1, 2]

  @ApiProperty({
    description: 'Idempotencia cliente (device + epoch o UUID)',
  })
  @Transform(({ value, obj }) =>
    String(value ?? obj?.client_id_unico ?? obj?.CLIENT_ID_UNICO ?? '').trim(),
  )
  @IsString()
  @Length(8, 80)
  CLIENT_ID_UNICO!: string; // Corregido con ![cite: 1, 2]

  @ApiProperty({
    description: 'Fecha/hora local del dispositivo (ISO-8601)',
  })
  @Transform(({ value, obj }) =>
    String(
      value ?? obj?.fecha_hora_local ?? obj?.FECHA_HORA_LOCAL ?? '',
    ).trim(),
  )
  @IsISO8601()
  FECHA_HORA_LOCAL!: string; // Corregido con ![cite: 1, 2]

  @ApiPropertyOptional({ description: 'Notas opcionales' })
  @IsOptional()
  @IsString()
  @Length(1, 250)
  NOTES?: string;

  @ApiPropertyOptional({
    description: 'Imagen frontal en base64 para evidencia (<150KB recomendado)',
  })
  @IsOptional()
  @IsString()
  @Length(30, 220000)
  FOTO_BASE64?: string;

  @ApiPropertyOptional({
    description: 'ID numérico de COLABORADORES / MARCAJES.id_usuario',
  })
  @Transform(({ value, obj }) => value ?? obj?.id_usuario ?? obj?.ID_USUARIO)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ID_USUARIO?: number;

  @ApiPropertyOptional({
    description: 'PIN capturado para validación de acceso',
  })
  @Transform(({ value, obj }) =>
    String(value ?? obj?.pin ?? obj?.PIN ?? '').trim(),
  )
  @IsOptional()
  @IsString()
  @Length(1, 255)
  PIN?: string;
}
