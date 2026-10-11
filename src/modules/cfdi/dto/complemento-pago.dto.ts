import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsString, Matches, Min } from 'class-validator';

export class EmitirComplementoPagoDto {
  @ApiProperty({
    description:
      'Emitir un complemento de pago genera un CFDI ante el SAT: debe venir en true.',
  })
  @IsBoolean()
  confirmar: boolean;

  @ApiProperty({ description: 'Fecha en que el cliente pago, yyyy-MM-dd.' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/, {
    message: 'fechaPago debe ser yyyy-MM-dd.',
  })
  fechaPago: string;

  @ApiProperty({
    description:
      'Clave del catalogo c_FormaPago: 01 efectivo, 03 transferencia...',
  })
  @IsString()
  @Matches(/^\d{2}$/, {
    message: 'formaDePago debe ser una clave de dos digitos.',
  })
  formaDePago: string;

  @ApiProperty({ description: 'Importe abonado, con IVA incluido.' })
  @IsNumber()
  @Min(0.01)
  monto: number;
}
