import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateEntidadFiscalSucursalDto {
  @IsString()
  @MaxLength(10)
  suc: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vigenteDesde?: string | null;
}
