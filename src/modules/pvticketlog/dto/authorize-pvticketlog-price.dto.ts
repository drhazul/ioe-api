import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AuthorizePvTicketLogPriceDto {
  @ApiProperty({
    description: 'Contrasena de un usuario con rol SUPERPV para autorizar cambio de precio',
  })
  @IsString()
  @Length(1, 255)
  AUTH_PASSWORD: string;
}
