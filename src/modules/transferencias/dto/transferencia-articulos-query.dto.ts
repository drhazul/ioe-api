import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TransferenciaArticulosQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  searchBy?: string;

  @IsOptional()
  @IsString()
  sucSal?: string;

  @IsOptional()
  @IsString()
  sucEnt?: string;

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
  @IsString()
  sph?: string;

  @IsOptional()
  @IsString()
  cyl?: string;

  @IsOptional()
  @IsString()
  adic?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
