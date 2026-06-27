import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AddTransferenciaEvidenceDto {
  @IsString()
  @MaxLength(700000)
  imgEvi: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tipo?: string;
}
