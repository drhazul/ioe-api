import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class MermasAutorizadasQueryDto {
  @ApiPropertyOptional({ example: 'DF01' })
  @IsOptional()
  @IsString()
  @Length(0, 10)
  suc?: string;

  @ApiPropertyOptional({ example: 'DF01134420116' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  iordAutorizacion?: string;

  @ApiPropertyOptional({ example: 'DF01134420030' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  iordOriginal?: string;

  @ApiPropertyOptional({ example: 'DF01134420116' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  iord?: string;

  @ApiPropertyOptional({ example: 'DF01-20261026-VF-0028' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  idfol?: string;

  @ApiPropertyOptional({ example: 'MATEO DAMIAN' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  client?: string;

  @ApiPropertyOptional({ example: 'TALLADO' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  tipo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsString()
  @Length(0, 30)
  labor?: string;

  @ApiPropertyOptional({ example: '1001' })
  @IsOptional()
  @IsString()
  @Length(0, 30)
  asign?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  fecIni?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsDateString()
  fecFin?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 25, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
