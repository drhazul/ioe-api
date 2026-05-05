import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SelfServiceMarkDto {
  @ApiPropertyOptional({ description: 'Token QR Base64 del colaborador' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ example: 'ENTRADA' })
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiPropertyOptional({ example: 19.4326 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiPropertyOptional({ example: -99.1332 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(300)
  accuracy_m?: number;
}
