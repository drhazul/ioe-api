import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class ListPvCtrFolAsvrQueryDto {
  @ApiPropertyOptional({
    description: 'Parametro opcional de cache busting en clientes legacy',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 40)
  _?: string;

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

  @ApiPropertyOptional({ description: 'Busqueda por folio o cliente' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 255)
  search?: string;
}
