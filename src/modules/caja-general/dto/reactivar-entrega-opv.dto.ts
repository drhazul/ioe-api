import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class ReactivarEntregaOpvDto {
  @ApiProperty({ description: 'Sucursal' })
  @Type(() => String)
  @IsString()
  @Length(1, 25)
  suc!: string;

  @ApiProperty({ description: 'Fecha de operación (YYYY-MM-DD)' })
  @Type(() => String)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fcn debe tener formato YYYY-MM-DD',
  })
  fcn!: string;

  @ApiProperty({ description: 'OPV a reactivar' })
  @Type(() => String)
  @IsString()
  @Length(1, 255)
  opv!: string;

  @ApiPropertyOptional({ description: 'Terminal/caja' })
  @Type(() => String)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  ter?: string;

  @ApiPropertyOptional({
    description: 'Usuario actor para traza contable',
  })
  @Type(() => String)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  user?: string;

  @ApiPropertyOptional({
    description:
      'Contraseña de supervisor para autorizar reactivación de fecha no operable',
  })
  @Type(() => String)
  @IsOptional()
  @IsString()
  @Length(1, 255)
  authPassword?: string;
}
