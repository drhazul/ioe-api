import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ActualizarCuentaQuadrumDto {
  @IsString()
  @Matches(/\S/, { message: 'Captura el usuario de Quadrum' })
  @MaxLength(100)
  quadrumUsuario!: string;

  /** Omitir conserva contraseña sólo si no cambia el usuario. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  quadrumPassword?: string;
}
