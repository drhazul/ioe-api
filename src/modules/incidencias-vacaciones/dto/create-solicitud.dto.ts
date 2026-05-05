import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSolicitudDto {
  @ApiProperty({ example: 11 })
  @IsDefined({ message: 'El colaborador es requerido' })
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  colaborador_id: number;

  @ApiProperty({ example: 2 })
  @IsDefined({ message: 'El tipo de incidencia es requerido' })
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  tipo_id: number;

  @ApiProperty({ example: '2026-04-22' })
  @IsDefined({ message: 'La fecha de inicio es requerida' })
  @IsDateString({}, { message: 'La fecha de inicio debe estar en formato ISO-8601' })
  fecha_inicio: string;

  @ApiProperty({ example: '2026-04-24' })
  @IsDefined({ message: 'La fecha de fin es requerida' })
  @IsDateString({}, { message: 'La fecha de fin debe estar en formato ISO-8601' })
  fecha_fin: string;

  @ApiPropertyOptional({ example: 'Consulta médica general' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const clean = value.trim();
    return clean.length === 0 ? undefined : clean;
  })
  @IsString()
  @Length(0, 500)
  motivo?: string;

  @ApiPropertyOptional({ example: '/uploads/incidencias/ev_123.png' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const clean = value.trim();
    return clean.length === 0 ? undefined : clean;
  })
  @IsString()
  @Length(0, 500)
  evidencia_url?: string;
}
