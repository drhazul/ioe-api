import { IsEmail, IsOptional } from 'class-validator';

export class ReenviarEmailDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}
