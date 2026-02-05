import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateDatCatUsoDto {
  @ApiProperty()
  @IsString()
  @Length(1, 255)
  USOCFDI: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 255)
  DESCRIPCION?: string;
}
