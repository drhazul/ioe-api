import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'david' })
  @IsString()
  @Length(3, 60)
  USERNAME: string;

  @ApiPropertyOptional({ example: '938120' })
  @IsOptional()
  @IsString()
  @Length(6, 100)
  PASSWORD?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 120)
  NOMBRE?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 120)
  APELLIDOS?: string;

  @ApiProperty({ example: 'david@ioe.com' })
  @IsEmail()
  MAIL: string;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Empresa usada para componer MAIL como USERNAME + EMPRESA.correo',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  IDEMPRESA?: number;

  @ApiProperty({ example: 'ACTIVO' })
  @IsString()
  ESTATUS: 'ACTIVO' | 'INACTIVO';

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  @Max(999)
  NIVEL: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  IDROL: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  IDDEPTO?: number;

  @ApiPropertyOptional({ example: '001' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Cuando es true, el usuario debe cambiar contraseña al iniciar sesión',
  })
  @IsOptional()
  @IsBoolean()
  FORZAR_CAMBIO_PASS?: boolean;
}
