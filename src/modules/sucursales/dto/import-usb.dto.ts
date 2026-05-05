import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SucursalEventDto } from './sucursal-event.dto';

export class ImportUsbDto {
  @ApiProperty({
    type: [SucursalEventDto],
    description: 'Eventos parseados desde archivo USB (.txt/.dat)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => SucursalEventDto)
  events: SucursalEventDto[];

  @ApiPropertyOptional({
    example: 'CDM-01',
    description: 'Sucursal por defecto si el evento no la trae',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  suc?: string;
}
