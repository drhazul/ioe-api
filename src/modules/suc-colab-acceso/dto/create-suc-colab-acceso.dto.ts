import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSucColabAccesoDto {
  @ApiProperty({
    description: 'Sucursal destino que verá colaboradores compartidos',
    example: 'DF14',
  })
  @IsString()
  @MaxLength(10)
  SUC_DESTINO!: string;

  @ApiProperty({
    description: 'Sucursal origen de colaboradores compartidos',
    example: 'DF04',
  })
  @IsString()
  @MaxLength(10)
  SUC_ORIGEN!: string;

  @ApiPropertyOptional({
    description: 'Registro activo',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  ACTIVO?: boolean;

  @ApiPropertyOptional({
    description: 'Observación libre',
    example: 'Sucursales gemelas',
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  OBSERVACION?: string | null;
}
