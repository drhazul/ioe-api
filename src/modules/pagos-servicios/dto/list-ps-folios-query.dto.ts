import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

export class ListPsFoliosQueryDto {
  @ApiPropertyOptional({ description: 'Sucursal del panel PS' })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 10)
  suc?: string;

  @ApiPropertyOptional({
    description:
      'Estado a consultar: PENDIENTE | EDITANDO | PAGADO | CERRADO_PS | ALL',
  })
  @Transform(({ value }) => toTrimmedString(value))
  @IsOptional()
  @IsString()
  @Length(1, 20)
  esta?: string;

  @ApiPropertyOptional({ description: 'OPV (usuario logueado)' })
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
