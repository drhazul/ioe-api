import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateOverrideDto {
  @ApiProperty({ description: 'Usuario objetivo del override' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDUSUARIO: number;

  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;

  @ApiProperty({ enum: ['OUT_OF_WINDOW', 'OUT_OF_GEOFENCE', 'SEQUENCE_OVERRIDE'] })
  @IsString()
  @IsIn(['OUT_OF_WINDOW', 'OUT_OF_GEOFENCE', 'SEQUENCE_OVERRIDE'])
  TIPO: string;

  @ApiProperty({ description: 'Motivo del override' })
  @IsString()
  @Length(1, 250)
  REASON: string;

  @ApiProperty({ description: 'Fecha de expiracion ISO UTC' })
  @IsDateString()
  VALID_UNTIL: string;
}
