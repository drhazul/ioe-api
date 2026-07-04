import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateRolDto {
  @ApiProperty({ example: 'ADMIN' })
  @IsString()
  @Length(1, 50)
  CODIGO: string;

  @ApiProperty({ example: 'Administrador' })
  @IsString()
  @Length(1, 100)
  NOMBRE: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DESCRIPCION?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;

  @ApiPropertyOptional({
    example: 4,
    description: 'Departamento (DEPARTAMENTO.IDDEPTO)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  IDDEPTO?: number | null;
}
