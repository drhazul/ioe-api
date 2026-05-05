import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber, // <--- Verifica que esté aquí
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class GetPolicyDto {
  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;

  @ApiPropertyOptional({ description: 'Sucursal (alias minúscula)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  suc?: string;

  @ApiPropertyOptional({ description: 'Latitud opcional' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber() // <--- Esto es lo que requiere el import
  LAT?: number;

  @ApiPropertyOptional({ description: 'Longitud opcional' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber() // <--- Esto también
  LON?: number;

  @ApiPropertyOptional({ description: 'Departamento' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idDepto?: number;
}