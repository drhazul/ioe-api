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
}
