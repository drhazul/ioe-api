import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSugeridoDetalleDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  ctdped?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cto?: number;

  @IsOptional()
  @IsString()
  uncom?: string;
}
