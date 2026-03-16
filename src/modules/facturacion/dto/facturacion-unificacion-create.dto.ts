import { IsOptional, IsString, MaxLength } from 'class-validator';
import { FacturacionUnificacionPreviewDto } from './facturacion-unificacion-preview.dto';

export class FacturacionUnificacionCreateDto extends FacturacionUnificacionPreviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comentario?: string;
}

