import { IsOptional, IsString } from 'class-validator';

export class MermaReporteQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  suc?: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsString()
  clasificacion?: string;

  @IsOptional()
  @IsString()
  articulo?: string;

  @IsOptional()
  @IsString()
  estatus?: string;
}
