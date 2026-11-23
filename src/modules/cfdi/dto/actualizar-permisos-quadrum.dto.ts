import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class ActualizarPermisosQuadrumDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  noCertificado!: string;

  @IsBoolean()
  factura!: boolean;

  @IsBoolean()
  notaCredito!: boolean;

  @IsBoolean()
  complementoPago!: boolean;
}
