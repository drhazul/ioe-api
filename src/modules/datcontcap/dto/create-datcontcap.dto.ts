import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length } from 'class-validator';

const ALMACENES = ['001', '002', 'M001', 'T001'] as const;
type Almacen = (typeof ALMACENES)[number];

export class CreateDatContCapDto {
  @ApiProperty({ example: 'CONT-001' })
  @IsString()
  @Length(1, 255)
  cont: string;

  @ApiPropertyOptional({ description: 'Solo admin puede sobrescribir. Por defecto se usa SUC del token.' })
  @IsOptional()
  @IsString()
  @Length(1, 5)
  suc?: string;

  @ApiPropertyOptional({ example: '7501031311309', description: 'UPC/EAN13 del artículo' })
  @IsOptional()
  @IsString()
  @Length(1, 15)
  upc?: string;

  @ApiPropertyOptional({ example: 'A12345', description: 'Código ART si ya se conoce' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  art?: string;

  @ApiProperty({ example: '001', enum: ALMACENES })
  @IsString()
  @IsIn(ALMACENES)
  almacen: Almacen;

  @ApiProperty({ example: 5.5, description: 'Cantidad capturada; se admite delta negativo para correcciones.' })
  @Type(() => Number)
  @IsNumber()
  cantidad: number;

  @ApiPropertyOptional({ example: 'ADD', enum: ['ADD', 'SUB'] })
  @IsOptional()
  @IsString()
  @IsIn(['ADD', 'SUB'])
  tipoMov?: 'ADD' | 'SUB';

  @ApiProperty({
    example: '5c2cc1b6-3e4f-4a9f-bcf3-ae19c63f2d8c',
    description: 'UUID generado por el cliente para idempotencia.',
  })
  @IsOptional()
  @IsUUID()
  capturaUuid?: string;
}
