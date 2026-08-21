import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RecepcionesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 30;

  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() oc?: string;
  @IsOptional() @IsString() proveedor?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  prov?: number;
  @IsOptional() @IsString() suc?: string;
  @IsOptional() @IsString() estatus?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class RecepcionItemDto {
  @IsOptional() @IsString() @MaxLength(510) idped?: string;
  @IsString() @MaxLength(510) art!: string;
  @Type(() => Number) @IsNumber() @Min(0) cantidadRecibida!: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cantidadAceptada?: number;
  @IsOptional()
  @IsIn(['PENDIENTE', 'APROBADO', 'RECHAZADO', 'NO_APLICA'])
  calidadEstado?: string;
  @IsOptional() @IsDateString() caducidad?: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;
  @IsOptional() calidad?: Record<string, unknown>;
}

export class RecepcionGuiaDto {
  @IsString() @MaxLength(100) guia!: string;
  @IsOptional() @IsString() @MaxLength(120) paqueteria?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cantidadPaquetes?: number;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}

export class RecepcionIncidenciaDto {
  @IsIn([
    'FALTANTE',
    'SOBRANTE',
    'NO_SOLICITADO',
    'COSTO',
    'DANO',
    'CALIDAD',
    'OTRO',
  ])
  tipo!: string;
  @IsOptional() @IsString() @MaxLength(510) art?: string;
  @IsOptional() @Type(() => Number) @IsNumber() cantidadEsperada?: number;
  @IsOptional() @Type(() => Number) @IsNumber() cantidadRecibida?: number;
  @IsOptional() @IsString() @MaxLength(1000) motivo?: string;
}

export class CreateRecepcionDto {
  @IsIn(['TOTAL', 'PARCIAL', 'DIFERENCIAS', 'RECHAZO'])
  tipoRecepcion!: string;

  @IsOptional()
  @IsIn(['FACTURA', 'NOTA', 'PENDIENTE', 'CONSIGNACION'])
  tipoDocumento?: string;
  @IsOptional() @IsString() @MaxLength(100) folioDocumento?: string;
  @IsOptional() @IsString() @MaxLength(10) almacen?: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecepcionItemDto)
  items!: RecepcionItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecepcionGuiaDto)
  guias?: RecepcionGuiaDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecepcionIncidenciaDto)
  incidencias?: RecepcionIncidenciaDto[];
}

export class RecepcionActionDto {
  @IsOptional() @IsString() @MaxLength(1000) motivo?: string;
}

export class UpdateRecepcionCantidadDto {
  @Type(() => Number) @IsNumber() @Min(0) cantidadFisica!: number;
}

export class UpdateRecepcionCostoDto {
  @Type(() => Number) @IsNumber() @Min(0) costo!: number;
}

export class UpdateRecepcionDatosDto {
  @IsOptional()
  @IsIn(['FACTURA', 'NOTA', 'PENDIENTE', 'CONSIGNACION'])
  tipoDocumento?: string;
  @IsOptional() @IsString() @MaxLength(100) folioDocumento?: string;
  @IsOptional() @IsString() @MaxLength(100) guia?: string;
  @IsOptional() @IsString() @MaxLength(120) paqueteria?: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;
}

export class RecepcionMasivaDto extends CreateRecepcionDto {}

export class RecepcionDraftItemDto {
  @IsString() @MaxLength(510) idped!: string;
  @IsString() @MaxLength(510) art!: string;
  @Type(() => Number) @IsNumber() @Min(0) cantidadRecibida = 0;
  @Type(() => Number) @IsNumber() @Min(0) cantidadAceptada = 0;
  @IsOptional()
  @IsIn(['APROBADO', 'RECHAZADO', 'NO_APLICA'])
  estatus?: string;
}

export class SaveRecepcionDraftDto {
  @IsOptional()
  @IsIn(['TOTAL', 'PARCIAL', 'DIFERENCIAS', 'RECHAZO'])
  tipoRecepcion?: string;
  @IsOptional()
  @IsIn(['FACTURA', 'NOTA', 'PENDIENTE', 'CONSIGNACION'])
  tipoDocumento?: string;
  @IsOptional() @IsString() @MaxLength(100) folioDocumento?: string;
  @IsOptional() @IsString() @MaxLength(100) guia?: string;
  @IsOptional() @IsString() @MaxLength(120) paqueteria?: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecepcionDraftItemDto)
  items!: RecepcionDraftItemDto[];
}
