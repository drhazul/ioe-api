import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateEntidadFiscalDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  nombreLegal?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreComercial?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{3}$/)
  regimenFiscal?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/)
  cpFiscal?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  domicilioFiscal?: string | null;

  @IsOptional()
  @IsIn(['PENDIENTE', 'VALIDADA', 'INACTIVA'])
  estadoValidacion?: 'PENDIENTE' | 'VALIDADA' | 'INACTIVA';

  @IsOptional()
  @IsString()
  @MaxLength(250)
  referenciaValidacion?: string | null;
}
