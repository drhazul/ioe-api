import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SugeridosCalculoQueryDto {
  @IsString()
  suc!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  prov?: number;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  depa?: string;

  @IsOptional()
  @IsString()
  subd?: string;

  @IsOptional()
  @IsString()
  clas?: string;

  @IsOptional()
  @IsString()
  scla?: string;

  @IsOptional()
  @IsString()
  scla2?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(365)
  dias?: number = 90;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;
}
