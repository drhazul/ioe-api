import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: '938120' })
  @IsString()
  @Length(6, 100)
  currentPassword: string;

  @ApiProperty({ example: 'Cambio.2026' })
  @IsString()
  @Length(6, 100)
  newPassword: string;
}
