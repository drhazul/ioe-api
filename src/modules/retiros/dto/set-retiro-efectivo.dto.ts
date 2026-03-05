import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class SetRetiroEfectivoItemDto {
  @ApiProperty({ description: 'Denominacion (money)' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  deno: number;

  @ApiProperty({ description: 'Cantidad de piezas (float, permite decimales)' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(0)
  ctda: number;
}

export class SetRetiroEfectivoDto {
  @ApiPropertyOptional({
    description: 'Denominacion para actualización unitaria',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  deno?: number;

  @ApiPropertyOptional({
    description: 'Cantidad para actualización unitaria',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 })
  @Min(0)
  ctda?: number;

  @ApiPropertyOptional({
    description: 'Batch de denominaciones',
    type: [SetRetiroEfectivoItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetRetiroEfectivoItemDto)
  items?: SetRetiroEfectivoItemDto[];
}

