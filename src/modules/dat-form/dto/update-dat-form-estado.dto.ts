import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateDatFormEstadoDto {
  @ApiProperty({
    example: true,
    description: 'true=activo, false=inactivo',
  })
  @IsBoolean()
  estado!: boolean;
}

