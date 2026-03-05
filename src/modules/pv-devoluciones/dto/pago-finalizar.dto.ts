import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { PagoFinalizarFormaDto } from './pago-finalizar-forma.dto';

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return text === '1' || text === 'true' || text === 'si' || text === 'yes';
};

export class PagoFinalizarDto {
  @ApiProperty({ type: Boolean, example: false })
  @Transform(toBoolean)
  @IsBoolean()
  rqfac: boolean;

  @ApiProperty({ type: [PagoFinalizarFormaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PagoFinalizarFormaDto)
  formas: PagoFinalizarFormaDto[];
}
