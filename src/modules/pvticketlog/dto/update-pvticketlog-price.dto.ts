import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length } from 'class-validator';

export class UpdatePvTicketLogPriceDto {
  @ApiProperty({ type: Number, description: 'Nuevo precio de venta unitario' })
  @IsNumber()
  PVTA: number;

  @ApiPropertyOptional({
    description:
      'Contrasena de usuario con rol SUPERPV cuando el solicitante no es supervisor',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  AUTH_PASSWORD?: string;
}
