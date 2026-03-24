import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  ValidateNested,
  Length,
  Min,
} from 'class-validator';

export class SendOrdDto {
  @ApiPropertyOptional({ example: 'ENC_MAQUILA_01' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  asign?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  labor?: number;
}

export class RecibirOrdDto {
  // DTO reservado para compatibilidad futura.
}

export class EntregarOrdDto {
  @ApiPropertyOptional({ example: 'Recibido conforme' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  observaciones?: string;

  @ApiPropertyOptional({ example: 'FIRMA_DIGITAL_BASE64' })
  @IsOptional()
  @IsString()
  firmaCliente?: string;
}

export class GarantiaOrdDto {
  @ApiProperty({ example: 'Ajuste por defecto de laboratorio' })
  @IsString()
  @Length(3, 255)
  motivo!: string;
}

export class CambioMaterialDto {
  @ApiProperty({ example: 'ART-NUEVO-001' })
  @IsString()
  @Length(1, 255)
  artNuevo!: string;

  @ApiProperty({ example: 'Cambio por graduación especial' })
  @IsString()
  @Length(3, 255)
  motivo!: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  labor?: number;

  @ApiPropertyOptional({ example: 'DIF-ORD-20260322-001' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  docDif?: string;
}

export class MermaOrdDto {
  @ApiProperty({ example: 0.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidadMerma!: number;

  @ApiProperty({ example: 'Defecto detectado en tallado' })
  @IsString()
  @Length(3, 255)
  motivo!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  crearNuevaOrd?: boolean;
}

export class ScanOrdDto {
  @ApiProperty({ example: 'IORD-20260322-001' })
  @IsString()
  @Length(1, 255)
  code!: string;
}

export class ValidateEnviarOrdDto {
  @ApiProperty({ example: 'DF10132300002' })
  @IsString()
  @Length(1, 255)
  code!: string;
}

export class SendOrdBatchDto {
  @ApiProperty({
    type: [String],
    example: ['DF10132300002', 'DF10132300003'],
  })
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  iords!: string[];
}

export class AssignOrdBatchDto extends SendOrdBatchDto {
  @ApiProperty({ example: 'OPV0001' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  idopv!: string;
}

export class RegresarIncidenciaBatchDto extends SendOrdBatchDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  tipom!: number;
}

export class AssignLaboratorioBatchDto extends SendOrdBatchDto {
  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  labor!: number;
}

export class SaveOrdDetalleLineaDto {
  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  iordp?: string;

  @ApiPropertyOptional({ example: 'OD' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  job?: string;

  @ApiPropertyOptional({ example: '-1.25' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  esf?: string;

  @ApiPropertyOptional({ example: '-0.50' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  cil?: string;

  @ApiPropertyOptional({ example: '90' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  eje?: string;
}

export class SaveOrdDetalleDto {
  @ApiPropertyOptional({ example: 5, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  labor?: number | null;

  @ApiPropertyOptional({ example: 'Observaciones del analista' })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  comentarios?: string;

  @ApiProperty({ type: [SaveOrdDetalleLineaDto] })
  @IsDefined()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveOrdDetalleLineaDto)
  details!: SaveOrdDetalleLineaDto[];
}
