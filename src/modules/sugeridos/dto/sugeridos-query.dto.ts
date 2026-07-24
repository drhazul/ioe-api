import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SugeridosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 30;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  suc?: string;

  @IsOptional()
  @IsString()
  estatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  prov?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
