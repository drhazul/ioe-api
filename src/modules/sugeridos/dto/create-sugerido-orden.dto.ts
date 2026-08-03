import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSugeridoOrdenItemDto {
  @IsString()
  art!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  ctdped!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cto!: number;

  @IsOptional()
  @IsString()
  uncom?: string;
}

export class CreateSugeridoOrdenDto {
  @IsString()
  suc!: string;

  @Type(() => Number)
  @IsInt()
  nprov!: number;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  sugerido?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSugeridoOrdenItemDto)
  items!: CreateSugeridoOrdenItemDto[];
}
