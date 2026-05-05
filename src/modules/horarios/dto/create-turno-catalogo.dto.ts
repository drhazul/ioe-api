import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class CreateTurnoCatalogoDto {
  @ApiProperty({ example: 'Matutino' })
  @IsString()
  @Length(1, 120)
  nombre: string;

  @ApiProperty({ example: '09:00:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'hr_entrada debe ser HH:mm o HH:mm:ss',
  })
  hr_entrada: string;

  @ApiProperty({ example: '14:00:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'hr_salida_comida debe ser HH:mm o HH:mm:ss',
  })
  hr_salida_comida: string;

  @ApiProperty({ example: '15:00:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'hr_regreso_comida debe ser HH:mm o HH:mm:ss',
  })
  hr_regreso_comida: string;

  @ApiProperty({ example: '18:00:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'hr_salida debe ser HH:mm o HH:mm:ss',
  })
  hr_salida: string;
}

