import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

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
  @Type(() => Number)
  @IsNumber()
  depa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  subd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  clas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scla?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scla2?: number;

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
