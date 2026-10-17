import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListOrdenesTrabajoQueryDto {
  @ApiPropertyOptional({ example: 'IORD-20260322-001' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  iord?: string;

  @ApiPropertyOptional({ example: 'SUC1-20260322-VF-0001' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  idfol?: string;

  @ApiPropertyOptional({ example: '10460540001' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  client?: string;

  @ApiPropertyOptional({ example: 'A000123' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  art?: string;

  @ApiPropertyOptional({ example: 'TALLADO' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  tipo?: string;

  @ApiPropertyOptional({ example: '2' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  labor?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  estatus?: string;

  @ApiPropertyOptional({ example: '5' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  estsegu?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  fecIni?: string;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsDateString()
  fecFin?: string;

  @ApiPropertyOptional({ example: 'ANALISTA01' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  asign?: string;

  @ApiPropertyOptional({ example: '2' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  tipom?: string;

  @ApiPropertyOptional({ example: '7' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  motr?: string;

  @ApiPropertyOptional({ example: 'SUC1' })
  @IsOptional()
  @IsString()
  @Length(0, 10)
  suc?: string;

  @ApiPropertyOptional({ example: 'cliente lentes progresivo' })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  search?: string;

  @ApiPropertyOptional({ example: 'operativo', default: 'operativo' })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  panelMode?: string;

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
  @Max(25)
  pageSize?: number;

  @ApiPropertyOptional({ writeOnly: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  exportAll?: boolean;

  @ApiPropertyOptional({ writeOnly: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  reportMode?: boolean;

  @ApiPropertyOptional({ writeOnly: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  ordenesVencerMode?: boolean;

  @ApiPropertyOptional({ enum: ['por_vencer', 'retrasadas'] })
  @IsOptional()
  @IsString()
  @IsIn(['por_vencer', 'retrasadas'])
  vencimiento?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  otros?: boolean;

  @ApiPropertyOptional({ writeOnly: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  deferResults?: boolean;
}
