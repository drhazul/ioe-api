import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

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
}
