import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConceptoDevueltoDto {
  @ApiProperty({ description: 'Posicion del concepto en la factura.' })
  @IsInt()
  @Min(0)
  indice: number;

  @ApiProperty({
    description: 'Piezas a devolver. No puede pasar de lo facturado.',
  })
  @IsNumber()
  @Min(0.000001)
  cantidad: number;
}

export class EmitirNotaCreditoDto {
  @ApiProperty({
    description:
      'Emitir una nota de credito genera un CFDI ante el SAT: debe venir en true.',
  })
  @IsBoolean()
  confirmar: boolean;

  @ApiProperty({ type: [ConceptoDevueltoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConceptoDevueltoDto)
  conceptos: ConceptoDevueltoDto[];
}
