import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'david' })
  @IsString()
  @Length(3, 60)
  USERNAME: string;

  @ApiProperty({ example: 'Cambio.2019' })
  @IsString()
  @Length(6, 100)
  PASSWORD: string;

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
  @Min(1)
  IDROL: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  IDDEPTO?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  IDPUESTO?: number;

  @ApiPropertyOptional({ example: '001' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  SUC?: string;
}
