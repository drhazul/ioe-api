import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateEntidadFiscalSucursalDto {
  @IsOptional()
  @IsIn(['PENDIENTE', 'VALIDADA', 'INACTIVA'])
  estadoValidacion?: 'PENDIENTE' | 'VALIDADA' | 'INACTIVA';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vigenteDesde?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vigenteHasta?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  referenciaValidacion?: string | null;
}
