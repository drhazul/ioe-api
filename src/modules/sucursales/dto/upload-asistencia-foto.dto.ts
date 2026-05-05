import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBase64,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UploadAsistenciaFotoDto {
  @ApiProperty({ example: 1234 })
  @IsInt()
  @Min(1)
  idUsuario: number;

  @ApiPropertyOptional({ example: 9001 })
  @IsOptional()
  @IsInt()
  @Min(1)
  idTimelog?: number;

  @ApiPropertyOptional({ example: 'CDM-01' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  suc?: string;

  @ApiPropertyOptional({
    example: 'iVBORw0KGgoAAAANSUhEUgAA...',
    description: 'Foto en base64. Opcional si se envia multipart file',
  })
  @IsOptional()
  @IsString()
  @IsBase64()
  fotoBase64?: string;

  @ApiPropertyOptional({
    example: 'checada_1234.jpg',
    description: 'Nombre archivo opcional',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fileName?: string;
}
