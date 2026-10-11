import { IsBoolean } from 'class-validator';

export class EmitirVentaDto {
  /**
   * Debe ser `true`. Timbrar una venta real genera un CFDI ante el SAT que
   * despues solo se puede cancelar.
   */
  @IsBoolean()
  confirmar!: boolean;
}
