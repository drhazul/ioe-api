import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMermaDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  suc?: string;

  @IsOptional()
  @MaxLength(120)
  areaM?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  txt?: string;
}
