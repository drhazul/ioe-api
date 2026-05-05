import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SucursalEventDto } from './sucursal-event.dto';

export class AdmsPushDto {
  @ApiProperty({ example: 'ADMS-MTY-001' })
  @IsString()
  @MaxLength(80)
  deviceId: string;

  @ApiPropertyOptional({ example: 'America/Mexico_City' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({
    example: 'CDM-01',
    description: 'Sucursal por defecto para los eventos del push',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  suc?: string;

  @ApiPropertyOptional({
    example: 'f94c1250-a222-47c0-8df8-424adff80364',
    description: 'Token de autenticación de hardware por sucursal',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sucursal_token?: string;

  @ApiProperty({
    type: [SucursalEventDto],
    description: 'Eventos recibidos por push del reloj (ADMS)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SucursalEventDto)
  events: SucursalEventDto[];
}
