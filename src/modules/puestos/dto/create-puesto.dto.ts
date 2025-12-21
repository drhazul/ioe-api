import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreatePuestoDto {
  @ApiProperty({ example: 1, description: 'ID del departamento' })
  @IsInt()
  @Min(1)
  IDDEPTO: number;

  @ApiProperty({ example: 'JEFE DE SISTEMAS' })
  @IsString()
  @Length(1, 120)
  NOMBRE: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;
}
