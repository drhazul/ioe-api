import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class UploadDocumentoDto {
  @ApiPropertyOptional({
    description: 'Usuario dueño del documento (default usuario JWT)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDUSUARIO?: number;

  @ApiPropertyOptional({ description: 'Incidencia asociada' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDINC?: number;

  @ApiPropertyOptional({ description: 'Sucursal (SUC)' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;

  @ApiProperty({
    enum: ['EXPEDIENTE', 'JUSTIFICANTE', 'INE', 'CONTRATO', 'OTRO'],
  })
  @IsString()
  @IsIn(['EXPEDIENTE', 'JUSTIFICANTE', 'INE', 'CONTRATO', 'OTRO'])
  TIPO: string;

  @ApiProperty({ description: 'Nombre de archivo' })
  @IsString()
  @Length(1, 160)
  FILE_NAME: string;

  @ApiProperty({ description: 'Mime type del archivo' })
  @IsString()
  @Length(1, 80)
  MIME_TYPE: string;

  @ApiProperty({ description: 'Archivo base64 (sin metadatos o data URI)' })
  @IsString()
  @Length(1, 80000000)
  CONTENT_BASE64: string;

  @ApiPropertyOptional({ description: 'Hash SHA256 (hex)' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Fa-f0-9]{64}$/)
  SHA256?: string;
}
