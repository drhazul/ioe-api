import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class KioscoVisitaDto {
  @ApiProperty({
    example: 'VIS-QR-2026-0001',
    description: 'Código QR de visitante',
  })
  @IsString()
  @MaxLength(140)
  qr: string;

  @ApiProperty({
    example: '/uploads/asistencia/visit_20260423_001.jpg',
    description: 'URL de foto obligatoria del evento',
  })
  @IsString()
  @MaxLength(300)
  event_photo: string;

  @ApiProperty({
    example: 'TERMINAL-LOBBY-01',
    description: 'Terminal kiosco que captura visita',
  })
  @IsString()
  @MaxLength(80)
  terminal_id: string;

  @ApiProperty({
    example: 'CDM-01',
    description: 'Sucursal/área de visita',
  })
  @IsString()
  @MaxLength(10)
  suc: string;

  @ApiPropertyOptional({ example: '2026-04-23T11:45:22.000Z' })
  @IsOptional()
  @IsDateString()
  punch_time?: string;

  @ApiPropertyOptional({ example: 36.8 })
  @IsOptional()
  @IsNumber()
  body_temp?: number;

  @ApiPropertyOptional({
    example: '19.4326,-99.1332',
    description: 'Lat/Lon compactas',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  gps_coordinates?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_offline?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Min(1)
  verify_mode?: number;
}
