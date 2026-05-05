import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateSucursalDto {
  @ApiPropertyOptional({ example: 'CDM-01' })
  @IsOptional()
  @IsString()
  @Length(1, 30)
  codigo?: string;

  @ApiPropertyOptional({ example: 'Ciudad de México Centro' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  nombre?: string;

  @ApiPropertyOptional({ example: 'IOE Corporativo' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  empresa?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  @ApiPropertyOptional({ example: 'Calle 1 #23, Colonia Centro, CP 01000' })
  @IsOptional()
  @IsString()
  direccion_completa?: string;

  @ApiPropertyOptional({ example: '+52 55 1234 5678' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: 'ERP-SUC-001' })
  @IsOptional()
  @IsString()
  id_externo_nomina?: string;

  @ApiPropertyOptional({ example: 19.4326 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  latitud?: number | null;

  @ApiPropertyOptional({ example: -99.1332 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  longitud?: number | null;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(5000)
  radio_metros?: number | null;
}
