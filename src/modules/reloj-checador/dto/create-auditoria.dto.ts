import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateAuditoriaDto {
  @ApiProperty({ description: 'Evento de auditoría del cliente' })
  @IsString()
  @Length(3, 120)
  EVENTO: string;

  @ApiPropertyOptional({ description: 'Detalle de auditoría' })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  DETALLE?: string;

  @ApiProperty({ description: 'Identificador del dispositivo' })
  @IsString()
  @Length(3, 120)
  DEVICE_ID: string;

  @ApiProperty({ description: 'GUID idempotente del cliente' })
  @IsUUID('4')
  CLIENT_ID_UNICO: string;

  @ApiProperty({ description: 'Fecha/hora local del dispositivo en ISO-8601' })
  @IsISO8601()
  FECHA_HORA_LOCAL: string;
}
