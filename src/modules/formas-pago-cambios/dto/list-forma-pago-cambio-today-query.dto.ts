import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListFormaPagoCambioTodayQueryDto {
  @ApiPropertyOptional({
    description: 'Búsqueda parcial por IDFOL',
    example: 'DF1004',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ?? '').toString().trim())
  idfol?: string;

  @ApiPropertyOptional({
    description: 'Búsqueda parcial por CLIEN',
    example: '10460540001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ?? '').toString().trim())
  clien?: string;

  @ApiPropertyOptional({
    description: 'Filtro opcional por sucursal (solo admin)',
    example: 'DF01',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ?? '').toString().trim().toUpperCase())
  suc?: string;

  @ApiPropertyOptional({
    description: 'Filtro opcional por OPV (solo admin)',
    example: 'OPV001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value ?? '').toString().trim().toUpperCase())
  opv?: string;
}
