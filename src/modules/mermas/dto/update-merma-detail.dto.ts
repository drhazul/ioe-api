import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateMermaDetailDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.0000001)
  ctd?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  motM?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  areaM?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  respM?: string;

  @IsOptional()
  @IsString()
  obsM?: string;

  @IsOptional()
  @IsString()
  @MaxLength(700000)
  eviM?: string;
}
