import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @Length(3, 60)
  username: string;

  @ApiProperty({ example: 'Cambio.2019' })
  @IsString()
  @Length(6, 100)
  password: string;
}
