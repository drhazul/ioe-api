import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TransferenciaActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  txt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  numGuia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  resp?: string;
}
