import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches } from 'class-validator';

export class SetHorarioConfirmacionDto {
  @ApiProperty({ example: 'QA-FUL-MOAAB28TL6JG' })
  @IsString()
  @Length(1, 40)
  sucursal: string;

  @ApiProperty({ example: 'OPERACIONES' })
  @IsString()
  @Length(1, 80)
  departamento: string;

  @ApiProperty({ example: '2026-05-04', description: 'Lunes de la semana' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'semana debe ser YYYY-MM-DD',
  })
  semana: string;

  @ApiProperty({ example: 'PENDIENTE', enum: ['PENDIENTE', 'CONFIRMADO'] })
  @IsString()
  @IsIn(['PENDIENTE', 'CONFIRMADO'])
  estatus: 'PENDIENTE' | 'CONFIRMADO';
}
