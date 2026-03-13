import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelarFacturaDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;
}
