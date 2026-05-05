import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ProcessCheckinDto {
  @ApiProperty({ example: 101 })
  @IsInt()
  @Min(1)
  colaborador_id: number;

  @ApiProperty({ example: '2026-04-22T08:59:00' })
  @IsDateString()
  checkin_at: string;

  @ApiPropertyOptional({
    example: 'ENTRADA',
    description: 'ENTRADA, SALIDA, SALIDA_COMER, REGRESO_COMER',
  })
  @IsOptional()
  @IsString()
  tipo?: string;
}
