import {
  IsBase64,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class GuardarCsdDto {
  /** Contenido del archivo `.cer` en Base64. */
  @IsBase64()
  cerBase64!: string;

  /** Contenido del archivo `.key` en Base64. */
  @IsBase64()
  keyBase64!: string;

  /** Contrasena de la llave privada. Se guarda cifrada, nunca en claro. */
  @IsString()
  @MaxLength(255)
  password!: string;

  /** c_RegimenFiscal del emisor (601, 612, 621...). El .cer no lo trae. */
  @Matches(/^\d{3}$/, {
    message: 'regimenFiscal son 3 digitos del catalogo del SAT',
  })
  regimenFiscal!: string;

  /** CP del lugar de expedicion. Tampoco viene en el certificado. */
  @Matches(/^\d{5}$/, { message: 'codigoPostal son 5 digitos' })
  codigoPostal!: string;

  /**
   * Usuario de Quadrum de esta razon social.
   *
   * Cada RFC timbra con su propia cuenta del PAC, dada de alta junto con su
   * certificado. Si no se captura, ese RFC usa la cuenta del `.env`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  quadrumUsuario?: string;

  /** Contrasena de Quadrum. Se guarda cifrada, nunca en claro. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  quadrumPassword?: string;
}
