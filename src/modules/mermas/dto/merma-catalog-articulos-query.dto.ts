import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class MermaCatalogArticulosQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  suc?: string;

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
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  upc?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
