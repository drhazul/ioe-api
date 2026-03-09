import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class CerrarEntregaOpvFormaDto {
  @ApiProperty({ description: 'Forma de pago' })
  @Type(() => String)
  @IsString()
  @Length(1, 255)
  form!: string;

  @ApiProperty({ description: 'Importe entregado a caja general' })
  @Type(() => Number)
  @IsNumber()
  impe!: number;
}

export class CerrarEntregaOpvDto {
  @ApiProperty({ description: 'Sucursal' })
  @Type(() => String)
  @IsString()
  @Length(1, 25)
  suc!: string;

  @ApiProperty({ description: 'Fecha de operación (YYYY-MM-DD)' })
  @Type(() => String)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fcn debe tener formato YYYY-MM-DD',
  })
  fcn!: string;

  @ApiProperty({ description: 'OPV a cerrar' })
  @Type(() => String)
  @IsString()
  @Length(1, 255)
  opv!: string;

  @ApiPropertyOptional({ description: 'Terminal/caja' })
  @Type(() => String)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  ter?: string;

  @ApiPropertyOptional({
    description: 'Usuario actor para traza contable',
  })
  @Type(() => String)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  user?: string;

  @ApiPropertyOptional({
    description: 'Tipo de corte',
    enum: ['CA', 'VF', 'GLOBAL'],
  })
  @Type(() => String)
  @IsOptional()
  @IsString()
  @IsIn(['CA', 'VF', 'GLOBAL'])
  tipo?: string = 'GLOBAL';

  @ApiPropertyOptional({
    description:
      'Lista opcional de capturas de entrega por forma (form/impe). Si se omite, se conserva lo previamente entregado.',
    type: [CerrarEntregaOpvFormaDto],
  })
  @Type(() => CerrarEntregaOpvFormaDto)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  entregas?: CerrarEntregaOpvFormaDto[];
}
