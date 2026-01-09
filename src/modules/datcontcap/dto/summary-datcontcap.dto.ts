import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class SummaryDatContCapDto {
  @ApiProperty({ description: 'Conteo a resumir', example: 'CONT-001' })
  @IsString()
  @Length(1, 255)
  cont: string;

  @ApiPropertyOptional({ description: 'Solo admin: forzar SUC' })
  @IsOptional()
  @IsString()
  @Length(1, 5)
  suc?: string;
}
