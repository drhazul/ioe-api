import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateSolicitudEstatusDto {
  @ApiProperty({ example: 'APROBADO' })
  @IsIn(['PENDIENTE', 'APROBADO', 'RECHAZADO'])
  estatus: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  aprobado_por?: number;

  @ApiProperty({ example: 'Aprobada por RH', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  motivo_resolucion?: string;
}
