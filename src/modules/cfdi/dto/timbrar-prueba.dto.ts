import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const IMPORTE_RE = /^\d+(\.\d{1,2})?$/;

export class TimbrarPruebaDto {
  /** Debe ser `true`: timbrar consume un timbre del ambiente de pruebas. */
  @IsBoolean()
  confirmar!: boolean;
}

export class TimbrarNotaCreditoPruebaDto {
  /** Debe ser `true`: timbrar consume un timbre del ambiente de pruebas. */
  @IsBoolean()
  confirmar!: boolean;

  /** UUID de la factura (vigente) que acredita la nota. */
  @IsUUID()
  uuidRelacionado!: string;

  /** Piezas devueltas, de 1 a 7. Por omision 2. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  cantidadDevuelta?: number;
}

export class TimbrarReciboPagoPruebaDto {
  /** Debe ser `true`: timbrar consume un timbre del ambiente de pruebas. */
  @IsBoolean()
  confirmar!: boolean;

  /** UUID de la factura PPD que se paga. */
  @IsUUID()
  uuidFactura!: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  serieFactura?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  folioFactura?: string;

  /** Abono del cliente, IVA incluido. Por omision 3000.00. */
  @IsOptional()
  @Matches(IMPORTE_RE, {
    message: 'monto debe ser un importe con hasta 2 decimales',
  })
  monto?: string;

  /** Numero de pago sobre la factura. Por omision 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  parcialidad?: number;

  /** Saldo antes de este pago. Por omision, el total de la factura de prueba. */
  @IsOptional()
  @Matches(IMPORTE_RE, {
    message: 'saldoAnterior debe ser un importe con hasta 2 decimales',
  })
  saldoAnterior?: string;
}
