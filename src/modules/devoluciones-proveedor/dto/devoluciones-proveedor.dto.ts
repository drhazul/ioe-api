import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DevolucionesProveedorQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 30;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() doc?: string;
  @IsOptional() @IsString() suc?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) prov?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) motivo?: number;
  @IsOptional() @IsString() estatus?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class DevolucionArticulosQueryDto {
  @IsString() @MaxLength(20) suc!: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() searchBy?: string;
  @IsOptional() @IsString() depa?: string;
  @IsOptional() @IsString() subd?: string;
  @IsOptional() @IsString() clas?: string;
  @IsOptional() @IsString() scla?: string;
  @IsOptional() @IsString() scla2?: string;
  @IsOptional() @IsString() sph?: string;
  @IsOptional() @IsString() cyl?: string;
  @IsOptional() @IsString() adic?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) prov?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}

export class CreateDevolucionProveedorDto {
  @IsString() @MaxLength(20) suc!: string;
  @IsOptional() @IsString() @MaxLength(10) almacen?: string;
  @Type(() => Number) @IsInt() @Min(1) provd!: number;
  @Type(() => Number) @IsInt() @Min(1) tipoDev!: number;
  @IsOptional() @IsString() @MaxLength(255) docOc?: string;
  @IsOptional() @IsString() @MaxLength(255) docRec?: string;
  @IsOptional() @IsString() @MaxLength(1000) obs?: string;
}

export class UpdateDevolucionProveedorDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) tipoDev?: number;
  @IsOptional() @IsString() @MaxLength(255) docOc?: string;
  @IsOptional() @IsString() @MaxLength(255) docRec?: string;
  @IsOptional() @IsString() @MaxLength(1000) obs?: string;
}

export class AddDevolucionProveedorEvidenceDto {
  @IsOptional() @IsString() @MaxLength(255) nombreArchivo?: string;
  @IsString() @MaxLength(100) mimeType!: string;
  @IsString() @MaxLength(700000) contenido!: string;
}

export class AddDevolucionProveedorDetalleDto {
  @IsString() @MaxLength(20) art!: string;
  @Type(() => Number) @IsNumber() @Min(0.0001) cantidad!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costo?: number;
  @Type(() => Number) @IsInt() @Min(1) motivo!: number;
  @IsOptional() @IsString() @MaxLength(100) lote?: string;
  @IsOptional() @IsDateString() caducidad?: string;
  @IsOptional() @IsString() @MaxLength(1000) obs?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => AddDevolucionProveedorEvidenceDto)
  evidencia!: AddDevolucionProveedorEvidenceDto;
}

export class UpdateDevolucionProveedorDetalleDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.0001) cantidad?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costo?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) motivo?: number;
  @IsOptional() @IsString() @MaxLength(100) lote?: string;
  @IsOptional() @IsDateString() caducidad?: string;
  @IsOptional() @IsString() @MaxLength(1000) obs?: string;
}

export class DevolucionProveedorActionDto {
  @IsOptional() @IsString() @MaxLength(1000) motivo?: string;
}

export class ConsolidarDevolucionesProveedorDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) documentos!: string[];
  @IsString() @MaxLength(120) transportista!: string;
  @IsString() @MaxLength(120) guia!: string;
  @Type(() => Number) @IsInt() @Min(1) cajas!: number;
  @IsOptional() @IsString() @MaxLength(120) rma?: string;
  @IsOptional() @IsString() @MaxLength(1000) obs?: string;
}

export class EnviarTransitoDevolucionProveedorDto {
  @IsString() @MaxLength(120) transportista!: string;
  @IsString() @MaxLength(120) guia!: string;
  @Type(() => Number) @IsInt() @Min(1) cajas!: number;
  @IsOptional() @IsString() @MaxLength(120) rma?: string;
  @IsOptional() @IsString() @MaxLength(1000) obs?: string;
}
