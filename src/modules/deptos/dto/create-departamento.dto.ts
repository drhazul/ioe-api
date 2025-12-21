import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateDepartamentoDto {
  @ApiProperty({ example: 'SISTEMAS' })
  @IsString()
  @Length(1, 100)
  NOMBRE: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;
}
