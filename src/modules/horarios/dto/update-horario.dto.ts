import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min, Matches } from 'class-validator';

export class UpdateHorarioDto {
  @ApiPropertyOptional({ example: 'Turno Matutino' })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  nombre?: string;

  @ApiPropertyOptional({ example: '08:00:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'hora_entrada debe ser HH:mm o HH:mm:ss',
  })
  hora_entrada?: string;

  @ApiPropertyOptional({ example: '17:00:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'hora_salida debe ser HH:mm o HH:mm:ss',
  })
  hora_salida?: string;

  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  tolerancia_minutos?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  dia_festivo?: boolean;

  @ApiPropertyOptional({ example: '07:45:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'inicio_entrada debe ser HH:mm o HH:mm:ss',
  })
  inicio_entrada?: string;

  @ApiPropertyOptional({ example: '08:15:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'fin_entrada debe ser HH:mm o HH:mm:ss',
  })
  fin_entrada?: string;

  @ApiPropertyOptional({ example: 60, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  minutos_almuerzo?: number;

  @ApiPropertyOptional({ example: 5, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  redondeo_entrada?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  es_flexible?: boolean;

  @ApiPropertyOptional({ example: 30, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  ot_minimo_minutos?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  ot_requiere_autorizacion?: boolean;

  @ApiPropertyOptional({ example: 480, default: 480 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(1440)
  horas_jornada_minutos?: number;

  @ApiPropertyOptional({ example: 30, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  horas_extra_minimo_minutos?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  horas_extra_requiere_autorizacion?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
