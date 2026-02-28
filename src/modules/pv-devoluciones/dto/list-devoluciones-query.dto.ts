import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class ListDevolucionesQueryDto {
  @ApiPropertyOptional({ description: 'Sucursal a filtrar' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 20)
  suc?: string;

  @ApiPropertyOptional({ description: 'OPV/usuario a filtrar' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  opv?: string;

  @ApiPropertyOptional({ description: 'Búsqueda por IDFOL/cliente' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  search?: string;
}

