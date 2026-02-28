import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateTimelogDto {
  @ApiPropertyOptional({ description: 'Nueva fecha/hora del marcaje en ISO' })
  @IsOptional()
  @IsDateString()
  FCNR?: string;

  @ApiPropertyOptional({ description: 'Nuevo tipo de checkpoint' })
  @IsOptional()
  @IsString()
  @IsIn(['ENTRADA', 'SALIDA_COMER', 'REGRESO_COMER', 'SALIDA'])
  TIPO?: string;

  @ApiPropertyOptional({ description: 'Notas del marcaje' })
  @IsOptional()
  @IsString()
  @Length(1, 250)
  NOTES?: string;

  @ApiProperty({ description: 'Motivo obligatorio de la correccion' })
  @IsString()
  @Length(1, 250)
  REASON: string;
}
