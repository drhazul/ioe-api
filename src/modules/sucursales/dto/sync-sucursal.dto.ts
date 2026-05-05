import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class SyncSucursalDto {
  @ApiProperty({
    example: 'CDM-01',
    description: 'Código de sucursal/área para generar comando de sincronización',
  })
  @IsString()
  @MaxLength(10)
  suc: string;
}
