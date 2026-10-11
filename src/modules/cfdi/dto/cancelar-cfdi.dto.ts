import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;

export class CancelarCfdiDto {
  /** UUID del CFDI a cancelar. */
  @IsUUID()
  uuid!: string;

  /** Catalogo c_MotivoCancelacion del SAT. */
  @IsIn(['01', '02', '03', '04'])
  motivo!: string;

  /** Obligatorio con motivo 01, prohibido con los demas. */
  @IsOptional()
  @IsUUID()
  folioSustitucion?: string;

  @IsString()
  @Matches(RFC_RE, { message: 'rfcReceptor no tiene forma de RFC' })
  rfcReceptor!: string;

  /** Total del CFDI tal como quedo en el XML timbrado (p. ej. "7000.01"). */
  @IsString()
  @Matches(/^\d+(\.\d{1,6})?$/, { message: 'total debe ser un numero decimal' })
  total!: string;

  /** Debe ser `true`: cancelar ante el SAT no se deshace. */
  @IsBoolean()
  confirmar!: boolean;
}

export class EstatusCancelacionQueryDto {
  @IsString()
  @Matches(RFC_RE, { message: 'rfcReceptor no tiene forma de RFC' })
  rfcReceptor!: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,6})?$/, { message: 'total debe ser un numero decimal' })
  total!: string;
}
