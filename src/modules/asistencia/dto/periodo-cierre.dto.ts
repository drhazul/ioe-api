import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class PeriodoCierreDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  fecha_inicio: string;

  @ApiProperty({ example: '2026-04-15' })
  @IsDateString()
  fecha_fin: string;

  @ApiPropertyOptional({ example: 'Cierre de nómina quincena 1' })
  @IsOptional()
  @IsString()
  @Length(1, 250)
  motivo?: string;
}
