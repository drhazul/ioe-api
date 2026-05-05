import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateOrdFlujoVisEstadoDto {
  @ApiProperty({
    description: 'Estado activo/inactivo',
    example: true,
  })
  @IsBoolean()
  estado!: boolean;
}

