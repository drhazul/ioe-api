import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateEntidadFiscalDto {
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-ZÑ&0-9]{12,13}$/i)
  rfc: string;

  @IsIn(['FISICA', 'MORAL'])
  tipoPersona: 'FISICA' | 'MORAL';

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
}
