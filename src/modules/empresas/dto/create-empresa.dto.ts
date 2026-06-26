import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateEmpresaDto {
  @ApiProperty({ example: 'IOE BUSINESS' })
  @IsString()
  @Length(1, 200)
  razon_social: string;

  @ApiPropertyOptional({ example: 'Av. Principal 123' })
  @IsOptional()
  @IsString()
  @Length(0, 300)
  direccion?: string;

  @ApiProperty({ example: '@ioebusiness.com.mx' })
  @IsString()
  @Length(4, 120)
  @Matches(/^@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, {
    message:
      'correo debe ser un prefijo de dominio valido, ejemplo @ioebusiness.com.mx',
  })
  correo: string;

  @ApiPropertyOptional({ example: '64000' })
  @IsOptional()
  @IsString()
  @Length(0, 10)
  cp?: string;

  @ApiPropertyOptional({ example: 'XAXX010101000' })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  rfc?: string;

  @ApiPropertyOptional({ example: '8180000000' })
  @IsOptional()
  @IsString()
  @Length(0, 30)
  telefono?: string;
}
