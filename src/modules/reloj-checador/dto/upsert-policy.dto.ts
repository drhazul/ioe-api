import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class UpsertPolicyDto {
  @ApiProperty({ description: 'Sucursal (SUC)' })
  @IsString()
  @Length(1, 10)
  SUC: string;

  @ApiPropertyOptional({ description: 'Departamento opcional' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDDEPTO?: number;

  @ApiPropertyOptional({ description: 'Zona horaria IANA' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  TIMEZONE?: string;

  @ApiPropertyOptional({ description: 'Tolerancia temprana en minutos' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ALLOW_EARLY_MIN?: number;

  @ApiPropertyOptional({ description: 'Tolerancia tardia en minutos' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ALLOW_LATE_MIN?: number;

  @ApiPropertyOptional({ description: 'Requiere GPS (0/1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  REQUIRE_GPS?: number;

  @ApiPropertyOptional({ description: 'Latitud geocerca' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  GEOFENCE_LAT?: number;

  @ApiPropertyOptional({ description: 'Longitud geocerca' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  GEOFENCE_LON?: number;

  @ApiPropertyOptional({ description: 'Radio geocerca en metros' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  GEOFENCE_RADIUS_M?: number;

  @ApiPropertyOptional({ description: 'Precision maxima GPS en metros' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  GPS_MAX_ACCURACY_M?: number;

  @ApiPropertyOptional({ description: 'Requiere liveness (0/1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  REQUIRE_LIVENESS?: number;

  @ApiPropertyOptional({ description: 'Hora inicio jornada HH:mm[:ss]' })
  @IsOptional()
  @IsString()
  @Matches(timePattern)
  SHIFT_START?: string;

  @ApiPropertyOptional({ description: 'Hora fin jornada HH:mm[:ss]' })
  @IsOptional()
  @IsString()
  @Matches(timePattern)
  SHIFT_END?: string;

  @ApiPropertyOptional({ description: 'Hora salida a comer HH:mm[:ss]' })
  @IsOptional()
  @IsString()
  @Matches(timePattern)
  LUNCH_START?: string;

  @ApiPropertyOptional({ description: 'Hora regreso de comer HH:mm[:ss]' })
  @IsOptional()
  @IsString()
  @Matches(timePattern)
  LUNCH_END?: string;

  @ApiPropertyOptional({ description: 'Enforce windows (0/1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  ENFORCE_WINDOWS?: number;

  @ApiPropertyOptional({ description: 'Limite horas extra diarias' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  OVERTIME_DAILY_LIMIT_HOURS?: number;

  @ApiPropertyOptional({ description: 'Limite horas extra semanales' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  OVERTIME_WEEKLY_LIMIT_HOURS?: number;

  @ApiPropertyOptional({ description: 'Activa policy (0/1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  ACTIVE?: number;
}
