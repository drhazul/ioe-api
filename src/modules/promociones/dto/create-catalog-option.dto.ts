import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateCatalogOptionDto {
  @ApiProperty({ example: 'DESCUENTO' })
  @IsString()
  @Length(1, 50)
  clave: string;

  @ApiProperty({ example: 'Descuento general' })
  @IsString()
  @Length(1, 120)
  descripcion: string;
}
