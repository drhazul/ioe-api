import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
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
  @ApiPropertyOptional({ example: 'Ajuste por defecto de laboratorio' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  motivo?: string;
}

export class AplicarMermaCambioDto {
  @ApiProperty({ example: 1, enum: [1, 2] })
  @Type(() => Number)
  @IsNumber()
  @IsIn([1, 2])
  tipom!: number;

  @ApiProperty({ example: 2, description: 'IDM del catálogo DAT_ORD_MOTM' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  motr!: number;
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

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  motr?: number;

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

  @ApiPropertyOptional({ example: 1, enum: [0.5, 1] })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsIn([0.5, 1])
  ctdCM?: number;
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

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  motr?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  crearNuevaOrd?: boolean;

  @ApiPropertyOptional({ example: 'ART-NUEVO-001' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  artNuevo?: string;

  @ApiPropertyOptional({ example: 1, enum: [0.5, 1] })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsIn([0.5, 1])
  ctdCM?: number;
}

export class CambioMermaContextDto {
  @ApiProperty({ example: 1, enum: [1, 2] })
  @Type(() => Number)
  @IsNumber()
  @IsIn([1, 2])
  tipo!: number;
}

export class PrepararCambioMermaDto {
  @ApiProperty({ example: 1, enum: [1, 2] })
  @Type(() => Number)
  @IsNumber()
  @IsIn([1, 2])
  tipo!: number;

  @ApiPropertyOptional({ example: 1, enum: [0.5, 1] })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsIn([0.5, 1])
  ctdCM?: number;

  @ApiPropertyOptional({ example: 'Cambio por graduación especial' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  motivo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  motr?: number;
}

export class ActualizarArticuloCambioMermaDto extends CambioMermaContextDto {
  @ApiProperty({ example: 'ART-NUEVO-001' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  artNuevo!: string;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  pvtaNuevo?: number;
}

export class SolicitarAutorizacionCambioMermaDto extends PrepararCambioMermaDto {
  @ApiPropertyOptional({ example: 'ART-NUEVO-001' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  artNuevo?: string;

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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  crearNuevaOrd?: boolean;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  pvtaNuevo?: number;
}

export class RetrabajoCambioMermaDto extends CambioMermaContextDto {}

export class CrearCambioMermaDto extends PrepararCambioMermaDto {}

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

  @ApiPropertyOptional({ example: 'BISELADO', enum: ['TALLADO', 'BISELADO'] })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  tipo?: string;

  @ApiPropertyOptional({ example: 'Observaciones del analista' })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  comentarios?: string;

  @ApiPropertyOptional({ example: '14:35' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'hrEnt debe tener formato HH:MM',
  })
  hrEnt?: string;

  @ApiProperty({ type: [SaveOrdDetalleLineaDto] })
  @IsDefined()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveOrdDetalleLineaDto)
  details!: SaveOrdDetalleLineaDto[];
}
