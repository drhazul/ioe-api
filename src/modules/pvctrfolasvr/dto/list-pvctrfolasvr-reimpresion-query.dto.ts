import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class ListPvCtrFolAsvrReimpresionQueryDto {
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

  @ApiPropertyOptional({
    description: 'Busqueda por IDFOL, CLIEN, razon social o OPV',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  search?: string;

  @ApiPropertyOptional({
    description: 'Fecha de FCNM en formato YYYY-MM-DD',
    example: '2026-03-17',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(10, 10)
  fcnm?: string;

  @ApiPropertyOptional({ description: 'Pagina (1..n)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Registros por pagina',
    default: 20,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  pageSize?: number;
}
