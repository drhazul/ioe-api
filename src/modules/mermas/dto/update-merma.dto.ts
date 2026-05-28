import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMermaDto {
  @IsOptional()
  @MaxLength(120)
  areaM?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  txt?: string;
}
